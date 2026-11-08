package com.gilbi.disiplin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.media.audiofx.LoudnessEnhancer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONObject;

import java.io.File;

/** Layanan latar depan yang membunyikan alarm dengan volume alarm MAKSIMAL + boost digital. */
public class AlarmService extends Service {
    static final String CHANNEL = "disiplin_alarm_v1";
    static final String EXTRA_TEST = "test";
    static final int NOTIF_ID = 1001;
    static final long MAX_RING_MS = 15 * 60 * 1000L;

    private MediaPlayer player;
    private LoudnessEnhancer enhancer;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private int prevAlarmVolume = -1;

    static void stop(Context c) {
        c.stopService(new Intent(c, AlarmService.class));
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        boolean test = intent.getBooleanExtra(EXTRA_TEST, false);
        String label = intent.getStringExtra(AlarmScheduler.EXTRA_LABEL);
        String time = intent.getStringExtra(AlarmScheduler.EXTRA_TIME);
        if (label == null) label = "Pengingat!";
        if (time == null) time = "";

        createChannel(this);
        Intent full = new Intent(this, AlarmActivity.class)
                .putExtras(intent)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent fullPi = PendingIntent.getActivity(this, 7, full,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stopPi = PendingIntent.getService(this, 8,
                new Intent(this, AlarmService.class).setAction("STOP"),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        if ("STOP".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }

        Notification.Builder nb = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle((test ? "🔊 Tes suara" : "⏰ " + time) + " — Disiplin")
                .setContentText(label)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setContentIntent(fullPi);
        if (test) nb.addAction(new Notification.Action.Builder(null, "Stop", stopPi).build());
        else nb.setFullScreenIntent(fullPi, true);
        Notification n = nb.build();

        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTIF_ID, n);

        if (!test) {
            try { startActivity(full); } catch (Exception ignored) {} // kalau diblokir, full-screen intent yang muncul
        }

        stopSound();
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (wakeLock == null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "disiplin:alarm");
            wakeLock.acquire(MAX_RING_MS + 60000);
        }
        JSONObject cfg = AlarmScheduler.config(this);
        startSound(cfg);
        if (cfg.optBoolean("vibrate", true)) startVibrate();
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::stopSelf, test ? 6000 : MAX_RING_MS);
        return START_NOT_STICKY;
    }

    static void createChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Alarm Disiplin", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Alarm & pengingat harian");
        ch.setSound(null, null); // suara diputar sendiri oleh layanan
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setBypassDnd(true);
        nm.createNotificationChannel(ch);
    }

    private void startSound(JSONObject cfg) {
        int vol = cfg.optInt("volume", 300);
        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
        try {
            prevAlarmVolume = am.getStreamVolume(AudioManager.STREAM_ALARM);
            am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
        } catch (Exception ignored) {}

        String sound = cfg.optString("sound", "siren");
        try {
            File f = new File(getFilesDir(), "custom_sound");
            if (!"custom".equals(sound) || !f.exists()) f = ToneMaker.get(this, sound);
            player = buildPlayer(Uri.fromFile(f));
        } catch (Exception e) {
            try {
                player = buildPlayer(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM));
            } catch (Exception ignored) { return; }
        }

        float base = Math.min(1f, vol / 100f);
        player.setVolume(base, base);
        if (vol > 100) {
            try {
                enhancer = new LoudnessEnhancer(player.getAudioSessionId());
                // 100 mB = 1 dB; 800% ≈ +18 dB
                enhancer.setTargetGain((int) Math.round(2000 * Math.log10(vol / 100.0)));
                enhancer.setEnabled(true);
            } catch (Exception ignored) {}
        }
        player.start();
    }

    private MediaPlayer buildPlayer(Uri uri) throws Exception {
        MediaPlayer mp = new MediaPlayer();
        mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        mp.setDataSource(this, uri);
        mp.setLooping(true);
        mp.prepare();
        return mp;
    }

    private void startVibrate() {
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null) return;
        long[] pattern = {0, 800, 300, 800, 300, 800, 1000};
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
    }

    private void stopSound() {
        if (enhancer != null) { try { enhancer.release(); } catch (Exception ignored) {} enhancer = null; }
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) {}
            player.release();
            player = null;
        }
        if (vibrator != null) { vibrator.cancel(); vibrator = null; }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        stopSound();
        if (prevAlarmVolume >= 0) {
            try {
                ((AudioManager) getSystemService(AUDIO_SERVICE))
                        .setStreamVolume(AudioManager.STREAM_ALARM, prevAlarmVolume, 0);
            } catch (Exception ignored) {}
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
}
