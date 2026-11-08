package com.gilbi.disiplin;

import android.animation.ArgbEvaluator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Random;

/** Layar alarm penuh (muncul di atas layar kunci). Matikan dengan menjawab soal hitungan. */
public class AlarmActivity extends Activity {
    private int answer;
    private boolean mathLock;
    private EditText input;
    private ValueAnimator flash;

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
    protected void onNewIntent(android.content.Intent intent) {
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
        bg.setCornerRadius(dp(14));
        bg.setColor(primary ? Color.WHITE : Color.argb(50, 255, 255, 255));
        btn.setBackground(bg);
        btn.setPadding(dp(16), dp(16), dp(16), dp(16));
        return btn;
    }

    private void build() {
        String label = getIntent().getStringExtra(AlarmScheduler.EXTRA_LABEL);
        String time = getIntent().getStringExtra(AlarmScheduler.EXTRA_TIME);
        boolean snoozed = getIntent().getBooleanExtra(AlarmScheduler.EXTRA_SNOOZED, false);
        mathLock = AlarmScheduler.config(this).optBoolean("mathLock", true);

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);
        col.setPadding(dp(24), dp(48), dp(24), dp(48));

        col.addView(text(time == null ? "" : time, 76, true));
        col.addView(text(label == null ? "Bangun!" : label, 26, true));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(14);

        if (mathLock) {
            Random r = new Random();
            int a = 12 + r.nextInt(40), bb = 3 + r.nextInt(9), c = r.nextInt(50);
            answer = a * bb + c;
            TextView q = text(a + " × " + bb + " + " + c + " = ?", 34, true);
            col.addView(q, lp);
            input = new EditText(this);
            input.setInputType(InputType.TYPE_CLASS_NUMBER);
            input.setHint("Jawaban");
            input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
            input.setGravity(Gravity.CENTER);
            input.setTextColor(Color.BLACK);
            GradientDrawable ibg = new GradientDrawable();
            ibg.setCornerRadius(dp(12));
            ibg.setColor(Color.WHITE);
            input.setBackground(ibg);
            input.setPadding(dp(12), dp(12), dp(12), dp(12));
            col.addView(input, lp);
        }

        Button dismiss = button("Aku sudah bangun 💪", true);
        dismiss.setOnClickListener(v -> tryDismiss());
        col.addView(dismiss, lp);

        if (!snoozed) {
            Button snooze = button("Tunda 5 menit (maks 1x)", false);
            snooze.setOnClickListener(v -> {
                AlarmScheduler.scheduleOnce(this, AlarmScheduler.SNOOZE_REQ,
                        (label == null ? "Pengingat" : label) + " (tunda)", System.currentTimeMillis() + 5 * 60 * 1000L);
                AlarmService.stop(this);
                Toast.makeText(this, "Ditunda 5 menit. Cuma sekali ya!", Toast.LENGTH_LONG).show();
                finish();
            });
            col.addView(snooze, lp);
        }

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.addView(col);
        setContentView(sv);

        if (flash != null) flash.cancel();
        flash = ValueAnimator.ofObject(new ArgbEvaluator(), Color.parseColor("#EF4444"), Color.parseColor("#7F1D1D"));
        flash.setDuration(900);
        flash.setRepeatMode(ValueAnimator.REVERSE);
        flash.setRepeatCount(ValueAnimator.INFINITE);
        flash.addUpdateListener(an -> sv.setBackgroundColor((int) an.getAnimatedValue()));
        flash.start();
    }

    private void tryDismiss() {
        if (mathLock) {
            int v;
            try { v = Integer.parseInt(input.getText().toString().trim()); } catch (Exception e) { v = Integer.MIN_VALUE; }
            if (v != answer) {
                input.setText("");
                Toast.makeText(this, "Jawaban salah! Ayo melek dulu 👀", Toast.LENGTH_SHORT).show();
                return;
            }
        }
        AlarmService.stop(this);
        Toast.makeText(this, "Bagus! Langsung gerak, jangan balik ke kasur! 💪", Toast.LENGTH_LONG).show();
        finish();
    }

    @Override
    public void onBackPressed() {
        Toast.makeText(this, "Matikan alarm dulu dengan tombol di layar 😉", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDestroy() {
        if (flash != null) flash.cancel();
        super.onDestroy();
    }
}
