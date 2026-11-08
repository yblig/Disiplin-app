package com.gilbi.disiplin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Setelah HP restart / jam diubah / aplikasi di-update, jadwalkan ulang semua alarm. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        AlarmScheduler.scheduleAll(c);
    }
}
