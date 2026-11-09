package com.gilbi.disiplin;

import android.animation.ArgbEvaluator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import org.json.JSONObject;

import java.io.File;
import java.util.Locale;
import java.util.Random;

/** Layar alarm penuh (muncul di atas layar kunci) dengan wallpaper foto/video dan tantangan untuk mematikan. */
public class AlarmActivity extends Activity {
    static final String EXTRA_PREVIEW = "preview";
    static final String[] PHRASES = {"AKU BANGUN SEKARANG", "AKU DISIPLIN HARI INI", "TIDAK ADA SNACK HARI INI",
            "AKU PASTI BISA BERUBAH", "BANGUN DAN GERAK"};

    private int answer;
    private String phrase;
    private boolean needMath, needType, preview;
    private EditText mathInput, typeInput;
    private ValueAnimator flash;
    private VideoView video;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        build();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        build();
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setShadowLayer(dp(6), 0, dp(2), Color.argb(140, 0, 0, 0));
        t.setPadding(0, dp(6), 0, dp(6));
        return t;
    }

    private Button button(String s, boolean primary) {
        Button btn = new Button(this);
        btn.setText(s);
        btn.setAllCaps(false);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, primary ? 20 : 16);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setTextColor(primary ? Color.parseColor("#EF4444") : Color.WHITE);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(16));
        bg.setColor(primary ? Color.WHITE : Color.argb(60, 255, 255, 255));
        if (!primary) bg.setStroke(dp(1), Color.argb(110, 255, 255, 255));
        btn.setBackground(bg);
        btn.setPadding(dp(16), dp(16), dp(16), dp(16));
        return btn;
    }

    private EditText input(String hint, int type) {
        EditText e = new EditText(this);
        e.setInputType(type);
        e.setHint(hint);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        e.setGravity(Gravity.CENTER);
        e.setTextColor(Color.BLACK);
        e.setHintTextColor(Color.GRAY);
        GradientDrawable ibg = new GradientDrawable();
        ibg.setCornerRadius(dp(12));
        ibg.setColor(Color.WHITE);
        e.setBackground(ibg);
        e.setPadding(dp(12), dp(12), dp(12), dp(12));
        return e;
    }

    private void build() {
        Intent it = getIntent();
        final String label = it.getStringExtra(AlarmScheduler.EXTRA_LABEL);
        String time = it.getStringExtra(AlarmScheduler.EXTRA_TIME);
        final String src = it.getStringExtra(AlarmScheduler.EXTRA_SRC);
        boolean snoozed = it.getBooleanExtra(AlarmScheduler.EXTRA_SNOOZED, false);
        preview = it.getBooleanExtra(EXTRA_PREVIEW, false);
        JSONObject cfg = AlarmScheduler.config(this);
        String ch = cfg.optString("challenge", cfg.optBoolean("mathLock", true) ? "math" : "none");
        needMath = !preview && ("math".equals(ch) || "both".equals(ch));
        needType = !preview && ("type".equals(ch) || "both".equals(ch));
        if (preview && "math".equals(ch) || preview && "both".equals(ch)) needMath = true; // tampilkan contoh soal
        if (time == null || time.isEmpty()) {
            java.util.Calendar c = java.util.Calendar.getInstance();
            time = String.format(Locale.US, "%02d:%02d", c.get(java.util.Calendar.HOUR_OF_DAY), c.get(java.util.Calendar.MINUTE));
        }
        final String timeF = time;

        // ---- isi (tombol & tantangan) ----
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);
        col.setPadding(dp(24), dp(48), dp(24), dp(48));
        if (preview) col.addView(text("👀 Contoh tampilan layar alarm", 15, true));
        col.addView(text(time, 76, true));
        col.addView(text(label == null ? "Bangun!" : label, 26, true));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(14);

        if (needMath) {
            Random r = new Random();
            int a = 12 + r.nextInt(40), bb = 3 + r.nextInt(9), c = r.nextInt(50);
            answer = a * bb + c;
            col.addView(text(a + " × " + bb + " + " + c + " = ?", 34, true), lp);
            mathInput = input("Jawaban", InputType.TYPE_CLASS_NUMBER);
            col.addView(mathInput, lp);
        }
        if (needType) {
            phrase = PHRASES[new Random().nextInt(PHRASES.length)];
            col.addView(text("Ketik persis kalimat ini:", 15, false), lp);
            col.addView(text(phrase, 26, true));
            typeInput = input("Ketik di sini", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
            col.addView(typeInput, lp);
        }

        Button dismiss = button(preview ? "Tutup contoh" : "Aku sudah bangun 💪", true);
        dismiss.setOnClickListener(v -> tryDismiss(timeF, label));
        col.addView(dismiss, lp);

        if (!snoozed && !preview) {
            Button snooze = button("Tunda 5 menit (maks 1x)", false);
            snooze.setOnClickListener(v -> {
                AlarmScheduler.scheduleOnce(this, AlarmScheduler.SNOOZE_REQ,
                        (label == null ? "Pengingat" : label) + " (tunda)", System.currentTimeMillis() + 5 * 60 * 1000L, src);
                AlarmService.stop(this);
                Toast.makeText(this, "Ditunda 5 menit. Cuma sekali ya!", Toast.LENGTH_LONG).show();
                finish();
            });
            col.addView(snooze, lp);
        }

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.addView(col);

        // ---- latar: wallpaper foto/video, atau warna berkedip ----
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        View scrim = new View(this);
        boolean hasWall = addWallpaper(root, cfg, src);
        FrameLayout.LayoutParams full = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        root.addView(scrim, full);
        root.addView(sv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        if (flash != null) flash.cancel();
        if (hasWall) {
            flash = ValueAnimator.ofObject(new ArgbEvaluator(), Color.argb(70, 0, 0, 0), Color.argb(130, 127, 29, 29));
            flash.setDuration(1200);
            flash.addUpdateListener(an -> scrim.setBackgroundColor((int) an.getAnimatedValue()));
        } else {
            flash = ValueAnimator.ofObject(new ArgbEvaluator(), Color.parseColor("#EF4444"), Color.parseColor("#7F1D1D"));
            flash.setDuration(900);
            flash.addUpdateListener(an -> scrim.setBackgroundColor((int) an.getAnimatedValue()));
        }
        flash.setRepeatMode(ValueAnimator.REVERSE);
        flash.setRepeatCount(ValueAnimator.INFINITE);
        flash.start();
    }

    /** Tambahkan wallpaper (khusus alarm, atau umum). true kalau ada. */
    private boolean addWallpaper(FrameLayout root, JSONObject cfg, String src) {
        String key = null, kind = null;
        JSONObject a = AlarmScheduler.findAlarm(this, src);
        String mode = a == null ? "default" : a.optString("wall", "default");
        if ("custom".equals(mode)) { key = a.optString("id"); kind = a.optString("wallKind", "image"); }
        else if (!"none".equals(mode) && !"none".equals(cfg.optString("wallKind", "none"))) { key = "default"; kind = cfg.optString("wallKind", "image"); }
        if (key == null) return false;
        File f = AlarmScheduler.wallFile(this, key);
        if (!f.exists()) return false;
        try {
            if ("video".equals(kind)) {
                video = new VideoView(this);
                if (Build.VERSION.SDK_INT >= 26) video.setAudioFocusRequest(AudioManager.AUDIOFOCUS_NONE);
                video.setVideoPath(f.getAbsolutePath());
                video.setOnPreparedListener(mp -> {
                    mp.setLooping(true);
                    mp.setVolume(0f, 0f); // suara alarm diputar terpisah
                    // isi penuh layar (center-crop)
                    int W = root.getWidth(), H = root.getHeight(), vw = mp.getVideoWidth(), vh = mp.getVideoHeight();
                    if (W > 0 && H > 0 && vw > 0 && vh > 0) {
                        float s = Math.max((float) W / vw, (float) H / vh);
                        video.setLayoutParams(new FrameLayout.LayoutParams((int) (vw * s), (int) (vh * s), Gravity.CENTER));
                    }
                    video.start();
                });
                video.setOnErrorListener((mp, w, e) -> true);
                root.addView(video, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
                return true;
            }
            DisplayMetrics dm = getResources().getDisplayMetrics();
            Bitmap bmp = decodeSampled(f, dm.widthPixels, dm.heightPixels);
            if (bmp == null) return false;
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setImageBitmap(bmp);
            root.addView(iv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static Bitmap decodeSampled(File f, int reqW, int reqH) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(f.getAbsolutePath(), o);
        if (o.outWidth <= 0 || o.outHeight <= 0) return null;
        int sample = 1;
        while (o.outWidth / (sample * 2) >= reqW && o.outHeight / (sample * 2) >= reqH) sample *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = sample;
        return BitmapFactory.decodeFile(f.getAbsolutePath(), o2);
    }

    private void tryDismiss(String time, String label) {
        if (needMath && !preview) {
            int v;
            try { v = Integer.parseInt(mathInput.getText().toString().trim()); } catch (Exception e) { v = Integer.MIN_VALUE; }
            if (v != answer) {
                mathInput.setText("");
                Toast.makeText(this, "Jawaban salah! Ayo melek dulu 👀", Toast.LENGTH_SHORT).show();
                return;
            }
        }
        if (needType) {
            String t = typeInput.getText().toString().trim().toUpperCase(Locale.ROOT).replaceAll("\\s+", " ");
            if (!t.equals(phrase)) {
                Toast.makeText(this, "Kalimatnya belum sama persis ✍️", Toast.LENGTH_SHORT).show();
                return;
            }
        }
        if (preview) { finish(); return; }
        AlarmService.stop(this);
        AlarmScheduler.logWake(this, time, label);
        Toast.makeText(this, "Bagus! Langsung gerak, jangan balik ke kasur! 💪", Toast.LENGTH_LONG).show();
        finish();
    }

    @Override
    public void onBackPressed() {
        if (preview) { finish(); return; }
        Toast.makeText(this, "Matikan alarm dulu dengan tombol di layar 😉", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDestroy() {
        if (flash != null) flash.cancel();
        if (video != null) try { video.stopPlayback(); } catch (Exception ignored) {}
        super.onDestroy();
    }
}
