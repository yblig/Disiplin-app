package com.gilbi.disiplin;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

/** Menyimpan konfigurasi alarm dari aplikasi web dan menjadwalkannya di AlarmManager. */
public final class AlarmScheduler {
    static final String PREFS = "disiplin";
    static final String EXTRA_ID = "id", EXTRA_LABEL = "label", EXTRA_TIME = "time", EXTRA_SNOOZED = "snoozed";
    static final int SNOOZE_REQ = 900001, TEST_REQ = 900002;

    private AlarmScheduler() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject config(Context c) {
        try {
            return new JSONObject(prefs(c).getString("config", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static void saveConfig(Context c, String json) {
        prefs(c).edit().putString("config", json).apply();
        scheduleAll(c);
    }

    /** Matikan alarm "sekali" setelah berbunyi. */
    static void disableOneShot(Context c, String id) {
        try {
            JSONObject cfg = config(c);
            JSONArray alarms = cfg.optJSONArray("alarms");
            if (alarms == null) return;
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject a = alarms.getJSONObject(i);
                JSONArray days = a.optJSONArray("days");
                if (id.equals(a.optString("id")) && (days == null || days.length() == 0)) a.put("on", false);
            }
            prefs(c).edit().putString("config", cfg.toString()).apply();
        } catch (Exception ignored) {}
    }

    static int reqCode(String id) {
        return (id.hashCode() & 0x7ffffff) + 1000;
    }

    static PendingIntent firePi(Context c, int req, String id, String label, String time, boolean snoozed) {
        Intent i = new Intent(c, AlarmReceiver.class)
                .putExtra(EXTRA_ID, id).putExtra(EXTRA_LABEL, label)
                .putExtra(EXTRA_TIME, time).putExtra(EXTRA_SNOOZED, snoozed);
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void scheduleAll(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences p = prefs(c);

        // batalkan jadwal lama
        for (String r : p.getStringSet("scheduled", new HashSet<>())) {
            try {
                am.cancel(firePi(c, Integer.parseInt(r), "", "", "", false));
            } catch (Exception ignored) {}
        }

        Set<String> scheduled = new HashSet<>();
        long earliest = Long.MAX_VALUE;
        try {
            JSONArray alarms = config(c).optJSONArray("alarms");
            if (alarms != null) {
                long now = System.currentTimeMillis();
                for (int i = 0; i < alarms.length(); i++) {
                    JSONObject a = alarms.getJSONObject(i);
                    if (!a.optBoolean("on", true)) continue;
                    String id = a.optString("id"), time = a.optString("time");
                    long at = nextTrigger(time, a.optJSONArray("days"), now);
                    if (at <= 0) continue;
                    int req = reqCode(id);
                    setExact(c, am, at, firePi(c, req, id, a.optString("label", "Pengingat!"), time, false));
                    scheduled.add(String.valueOf(req));
                    earliest = Math.min(earliest, at);
                }
            }
        } catch (Exception ignored) {}
        p.edit().putStringSet("scheduled", scheduled)
                .putLong("next", earliest == Long.MAX_VALUE ? 0 : earliest).apply();
    }

    /** Waktu berikutnya (ms) untuk jam "HH:MM" pada hari yang dipilih (0=Minggu). Kosong = hari apa saja. */
    static long nextTrigger(String hm, JSONArray days, long now) {
        try {
            String[] parts = hm.split(":");
            int h = Integer.parseInt(parts[0]), m = Integer.parseInt(parts[1]);
            for (int add = 0; add <= 7; add++) {
                Calendar cal = Calendar.getInstance();
                cal.setTimeInMillis(now);
                cal.add(Calendar.DAY_OF_YEAR, add);
                cal.set(Calendar.HOUR_OF_DAY, h);
                cal.set(Calendar.MINUTE, m);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);
                if (cal.getTimeInMillis() <= now + 1000) continue;
                int dow = cal.get(Calendar.DAY_OF_WEEK) - 1; // 0 = Minggu
                if (days == null || days.length() == 0) return cal.getTimeInMillis();
                for (int j = 0; j < days.length(); j++) if (days.optInt(j, -1) == dow) return cal.getTimeInMillis();
            }
        } catch (Exception ignored) {}
        return -1;
    }

    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        return ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms();
    }

    static void setExact(Context c, AlarmManager am, long at, PendingIntent op) {
        if (canExact(c)) {
            PendingIntent show = PendingIntent.getActivity(c, 1, new Intent(c, MainActivity.class),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), op);
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, op);
        }
    }

    static void scheduleOnce(Context c, int req, String label, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(at);
        String time = String.format(java.util.Locale.US, "%02d:%02d", cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE));
        setExact(c, am, at, firePi(c, req, "once-" + req, label, time, req == SNOOZE_REQ));
    }
}
