package com.gilbi.disiplin;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.media.MediaMuxer;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.view.WindowManager;
import java.io.ByteArrayOutputStream;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/** Fungsi yang bisa dipanggil dari JavaScript lewat window.DisiplinNative. */
public class NativeBridge {
    static final int MEDIA_PERM_REQ = 2;
    private final MainActivity act;
    private MediaPlayer preview;

    NativeBridge(MainActivity a) { act = a; }

    @JavascriptInterface
    public boolean isNative() { return true; }

    @JavascriptInterface
    public void syncConfig(String json) { AlarmScheduler.saveConfig(act, json); }

    @JavascriptInterface
    public String getConfig() { return AlarmScheduler.config(act).toString(); }

    @JavascriptInterface
    public long nextAlarm() { return AlarmScheduler.prefs(act).getLong("next", 0); }

    /** (lama) simpan suara dari base64 sebagai suara umum. */
    @JavascriptInterface
    public boolean saveCustomSound(String base64) {
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            try (FileOutputStream o = new FileOutputStream(AlarmScheduler.soundFile(act, "default"))) { o.write(data); }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void testSound() { testSoundFor(""); }

    /** Tes suara dengan pengaturan alarm tertentu (src = id alarm, kosong = pengaturan umum). */
    @JavascriptInterface
    public void testSoundFor(String src) {
        Intent i = new Intent(act, AlarmService.class)
                .putExtra(AlarmService.EXTRA_TEST, true)
                .putExtra(AlarmScheduler.EXTRA_SRC, src == null ? "" : src)
                .putExtra(AlarmScheduler.EXTRA_LABEL, "Tes suara alarm")
                .putExtra(AlarmScheduler.EXTRA_TIME, "");
        act.startForegroundService(i);
    }

    @JavascriptInterface
    public void stopSound() { AlarmService.stop(act); }

    /** Bunyikan alarm sungguhan beberapa detik lagi (bisa dites sambil HP dikunci). */
    @JavascriptInterface
    public void testAlarm(int seconds) {
        AlarmScheduler.scheduleOnce(act, AlarmScheduler.TEST_REQ, "Tes alarm — kalau bunyi, berarti sudah siap! ✅",
                System.currentTimeMillis() + Math.max(5, seconds) * 1000L);
    }

    // ---------------- Media (lagu & video di HP) ----------------

    private String[] mediaPerms() {
        if (Build.VERSION.SDK_INT >= 33)
            return new String[]{Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_MEDIA_VIDEO, Manifest.permission.READ_MEDIA_IMAGES};
        return new String[]{Manifest.permission.READ_EXTERNAL_STORAGE};
    }

    @JavascriptInterface
    public boolean hasMediaPermission() {
        for (String p : mediaPerms())
            if (act.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    @JavascriptInterface
    public void requestMediaPermission() {
        act.runOnUiThread(() -> act.requestPermissions(mediaPerms(), MEDIA_PERM_REQ));
    }

    /** Daftar SEMUA audio (mp3, ogg, m4a, wav, flac, ...) dan video (mp4, mkv, webm, 3gp, ...) di HP. */
    @JavascriptInterface
    public String listMedia() {
        JSONArray out = new JSONArray();
        query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, "audio", out);
        query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video", out);
        query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image", out);
        return out.toString();
    }

    private void query(Uri base, String kind, JSONArray out) {
        boolean q = Build.VERSION.SDK_INT >= 29;
        boolean img = "image".equals(kind); // tabel foto tidak punya kolom durasi
        String[] proj = {"_id", "_display_name", img ? "_size" : "duration", "_size", "date_added", q ? "relative_path" : "_data"};
        try (Cursor c = act.getContentResolver().query(base, proj, null, null, "date_added DESC")) {
            if (c == null) return;
            while (c.moveToNext()) {
                long size = c.getLong(3);
                if (size <= 0) continue;
                String folder = c.getString(5);
                if (folder == null) folder = "";
                if (!q) {
                    int slash = folder.lastIndexOf('/');
                    folder = slash > 0 ? folder.substring(0, slash) : folder;
                    slash = folder.lastIndexOf('/');
                    if (slash >= 0) folder = folder.substring(slash + 1);
                } else if (folder.endsWith("/")) {
                    folder = folder.substring(0, folder.length() - 1);
                }
                JSONObject o = new JSONObject();
                o.put("uri", ContentUris.withAppendedId(base, c.getLong(0)).toString());
                o.put("name", c.getString(1) == null ? "(tanpa nama)" : c.getString(1));
                o.put("duration", img ? 0 : c.getLong(2));
                o.put("size", size);
                o.put("added", c.getLong(4));
                o.put("folder", folder);
                o.put("kind", kind);
                out.put(o);
            }
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void previewMedia(String uri) {
        act.runOnUiThread(() -> {
            stopPreviewNow();
            try {
                MediaPlayer mp = new MediaPlayer();
                mp.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                mp.setDataSource(act, Uri.parse(uri));
                mp.setOnPreparedListener(MediaPlayer::start);
                mp.setOnErrorListener((p, w, e) -> { toast("File ini tidak bisa diputar"); return true; });
                mp.prepareAsync();
                preview = mp;
            } catch (Exception e) {
                toast("File ini tidak bisa diputar");
            }
        });
    }

    @JavascriptInterface
    public void stopPreview() { act.runOnUiThread(this::stopPreviewNow); }

    private void stopPreviewNow() {
        if (preview != null) {
            try { preview.stop(); } catch (Exception ignored) {}
            preview.release();
            preview = null;
        }
    }

    /**
     * Pakai file sebagai suara alarm. Video diubah jadi audio (track audio diambil ke .m4a).
     * Hasil dikirim balik lewat window.onNativeMediaUsed(key, ok, name, converted).
     */
    @JavascriptInterface
    public void useMedia(String key, String uri, String name, boolean isVideo) {
        new Thread(() -> {
            File dest = AlarmScheduler.soundFile(act, key);
            File tmp = new File(dest.getParentFile(), dest.getName() + ".tmp");
            boolean converted = false, ok;
            try {
                tmp.delete();
                if (isVideo) converted = extractAudio(act, Uri.parse(uri), tmp);
                if (!converted) copy(Uri.parse(uri), tmp);
                ok = playable(tmp);
                if (ok) {
                    dest.delete();
                    ok = tmp.renameTo(dest);
                }
            } catch (Exception e) {
                ok = false;
            }
            tmp.delete();
            act.js("window.onNativeMediaUsed && window.onNativeMediaUsed(" + JSONObject.quote(key) + "," + ok + ","
                    + JSONObject.quote(name) + "," + converted + ")");
        }).start();
    }

    private void copy(Uri src, File out) throws Exception {
        try (InputStream in = act.getContentResolver().openInputStream(src);
             FileOutputStream o = new FileOutputStream(out)) {
            byte[] buf = new byte[256 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        }
    }

    private boolean playable(File f) {
        MediaPlayer mp = new MediaPlayer();
        try {
            mp.setDataSource(f.getAbsolutePath());
            mp.prepare();
            return mp.getDuration() != 0;
        } catch (Exception e) {
            return false;
        } finally {
            mp.release();
        }
    }

    /** Ambil track audio AAC dari video ke file .m4a tanpa encode ulang. */
    static boolean extractAudio(Context c, Uri src, File out) {
        MediaExtractor ex = new MediaExtractor();
        MediaMuxer mux = null;
        try {
            ex.setDataSource(c, src, null);
            int track = -1;
            MediaFormat fmt = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) { track = i; fmt = f; break; }
            }
            if (track < 0 || !"audio/mp4a-latm".equals(fmt.getString(MediaFormat.KEY_MIME))) return false;
            ex.selectTrack(track);
            mux = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int dst = mux.addTrack(fmt);
            mux.start();
            int cap = fmt.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE) ? fmt.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) : 0;
            ByteBuffer buf = ByteBuffer.allocate(Math.max(cap, 512 * 1024));
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            int samples = 0;
            while (true) {
                buf.clear();
                int n = ex.readSampleData(buf, 0);
                if (n < 0) break;
                info.offset = 0;
                info.size = n;
                info.presentationTimeUs = ex.getSampleTime();
                info.flags = MediaCodec.BUFFER_FLAG_KEY_FRAME;
                mux.writeSampleData(dst, buf, info);
                samples++;
                ex.advance();
            }
            mux.stop();
            return samples > 0 && out.length() > 0;
        } catch (Exception e) {
            return false;
        } finally {
            ex.release();
            if (mux != null) try { mux.release(); } catch (Exception ignored) {}
        }
    }

    // ---------------- Wallpaper layar alarm ----------------

    /** Salin foto/video jadi wallpaper. Hasil: window.onNativeWallUsed(key, ok, name, kind). */
    @JavascriptInterface
    public void useWall(String key, String uri, String name, String kind) {
        new Thread(() -> {
            File dest = AlarmScheduler.wallFile(act, key);
            File tmp = new File(dest.getParentFile(), dest.getName() + ".tmp");
            boolean ok;
            try {
                tmp.delete();
                copy(Uri.parse(uri), tmp);
                ok = "video".equals(kind) ? hasVideoFrame(tmp) : AlarmActivity.decodeSampled(tmp, 64, 64) != null;
                if (ok) { dest.delete(); ok = tmp.renameTo(dest); }
            } catch (Exception e) {
                ok = false;
            }
            tmp.delete();
            act.js("window.onNativeWallUsed && window.onNativeWallUsed(" + JSONObject.quote(key) + "," + ok + ","
                    + JSONObject.quote(name) + "," + JSONObject.quote(kind == null ? "image" : kind) + ")");
        }).start();
    }

    private boolean hasVideoFrame(File f) {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(f.getAbsolutePath());
            return r.getFrameAtTime(0) != null;
        } catch (Exception e) {
            return false;
        } finally {
            try { r.release(); } catch (Exception ignored) {}
        }
    }

    /** Thumbnail kecil (JPEG base64) dari wallpaper, untuk pratinjau di aplikasi. */
    @JavascriptInterface
    public String wallThumb(String key) {
        File f = AlarmScheduler.wallFile(act, key);
        if (!f.exists()) return "";
        Bitmap bmp = AlarmActivity.decodeSampled(f, 360, 360);
        if (bmp == null) {
            MediaMetadataRetriever r = new MediaMetadataRetriever();
            try { r.setDataSource(f.getAbsolutePath()); bmp = r.getFrameAtTime(0); } catch (Exception ignored) {}
            finally { try { r.release(); } catch (Exception ignored) {} }
        }
        if (bmp == null) return "";
        int w = Math.min(480, bmp.getWidth());
        Bitmap small = Bitmap.createScaledBitmap(bmp, w, Math.max(1, bmp.getHeight() * w / bmp.getWidth()), true);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        small.compress(Bitmap.CompressFormat.JPEG, 75, bo);
        return Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
    }

    /** Tampilkan contoh layar alarm (tanpa suara). */
    @JavascriptInterface
    public void previewAlarmScreen(String src) {
        JSONObject a = AlarmScheduler.findAlarm(act, src);
        Intent i = new Intent(act, AlarmActivity.class)
                .putExtra(AlarmActivity.EXTRA_PREVIEW, true)
                .putExtra(AlarmScheduler.EXTRA_SRC, src == null ? "" : src)
                .putExtra(AlarmScheduler.EXTRA_LABEL, a != null ? a.optString("label") : "Contoh layar alarm")
                .putExtra(AlarmScheduler.EXTRA_TIME, a != null ? a.optString("time") : "")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        act.startActivity(i);
    }

    // ---------------- Lain-lain ----------------

    /** Ambil (lalu kosongkan) catatan jam alarm dimatikan. */
    @JavascriptInterface
    public String takeWakeLog() {
        String v = AlarmScheduler.prefs(act).getString("wakelog", "[]");
        AlarmScheduler.prefs(act).edit().putString("wakelog", "[]").apply();
        return v;
    }

    @JavascriptInterface
    public void keepScreenOn(boolean on) {
        act.runOnUiThread(() -> {
            if (on) act.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    @JavascriptInterface
    public void setStatusBarColor(String hex) {
        act.runOnUiThread(() -> { try { act.getWindow().setStatusBarColor(Color.parseColor(hex)); } catch (Exception ignored) {} });
    }

    /** File yang dibagikan dari aplikasi lain (JSON) atau "" kalau tidak ada. */
    @JavascriptInterface
    public String takeShared() { return act.takeShared(); }

    // ---------------- Izin ----------------

    @JavascriptInterface
    public String permissionStatus() {
        JSONObject o = new JSONObject();
        try {
            boolean notif = Build.VERSION.SDK_INT < 33
                    || act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            NotificationManager nm = act.getSystemService(NotificationManager.class);
            boolean full = Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent();
            PowerManager pm = (PowerManager) act.getSystemService(Activity.POWER_SERVICE);
            o.put("notif", notif && nm.areNotificationsEnabled());
            o.put("exact", AlarmScheduler.canExact(act));
            o.put("fullscreen", full);
            o.put("battery", pm.isIgnoringBatteryOptimizations(act.getPackageName()));
        } catch (Exception ignored) {}
        return o.toString();
    }

    @JavascriptInterface
    public void openPermission(String which) {
        act.runOnUiThread(() -> {
            try {
                String pkg = act.getPackageName();
                switch (which) {
                    case "notif":
                        if (Build.VERSION.SDK_INT >= 33
                                && act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                            act.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
                        } else {
                            act.startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                    .putExtra(Settings.EXTRA_APP_PACKAGE, pkg));
                        }
                        break;
                    case "exact":
                        if (Build.VERSION.SDK_INT >= 31)
                            act.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg)));
                        break;
                    case "fullscreen":
                        if (Build.VERSION.SDK_INT >= 34)
                            act.startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + pkg)));
                        break;
                    case "battery":
                        act.startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg)));
                        break;
                    default:
                        act.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
                }
            } catch (Exception e) {
                act.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.getPackageName())));
            }
        });
    }

    /** Simpan file cadangan ke folder Download. */
    @JavascriptInterface
    public boolean saveFile(String name, String content) {
        try {
            byte[] data = content.getBytes(StandardCharsets.UTF_8);
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, name.endsWith(".csv") ? "text/csv" : "application/json");
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = act.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                try (OutputStream o = act.getContentResolver().openOutputStream(uri)) { o.write(data); }
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                dir.mkdirs();
                try (FileOutputStream o = new FileOutputStream(new File(dir, name))) { o.write(data); }
            }
            toast("Tersimpan di folder Download: " + name);
            return true;
        } catch (Exception e) {
            toast("Gagal menyimpan: " + e.getMessage());
            return false;
        }
    }

    @JavascriptInterface
    public void toast(String msg) {
        act.runOnUiThread(() -> Toast.makeText(act, msg, Toast.LENGTH_LONG).show());
    }
}
