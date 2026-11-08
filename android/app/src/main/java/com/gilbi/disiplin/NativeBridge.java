package com.gilbi.disiplin;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Fungsi yang bisa dipanggil dari JavaScript lewat window.DisiplinNative. */
public class NativeBridge {
    private final Activity act;

    NativeBridge(Activity a) { act = a; }

    @JavascriptInterface
    public boolean isNative() { return true; }

    @JavascriptInterface
    public void syncConfig(String json) { AlarmScheduler.saveConfig(act, json); }

    @JavascriptInterface
    public String getConfig() { return AlarmScheduler.config(act).toString(); }

    @JavascriptInterface
    public long nextAlarm() { return AlarmScheduler.prefs(act).getLong("next", 0); }

    @JavascriptInterface
    public boolean saveCustomSound(String base64) {
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            try (FileOutputStream o = new FileOutputStream(new File(act.getFilesDir(), "custom_sound"))) { o.write(data); }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public void testSound() {
        Intent i = new Intent(act, AlarmService.class)
                .putExtra(AlarmService.EXTRA_TEST, true)
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
                v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
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
