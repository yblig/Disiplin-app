package com.gilbi.disiplin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Dipanggil AlarmManager tepat pada jam alarm. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String id = intent.getStringExtra(AlarmScheduler.EXTRA_ID);
        Intent svc = new Intent(c, AlarmService.class).putExtras(intent);
        c.startForegroundService(svc);
        if (id != null && !id.startsWith("once-")) {
            AlarmScheduler.disableOneShot(c, id);
            AlarmScheduler.scheduleAll(c); // jadwalkan kemunculan berikutnya
        }
    }
}
