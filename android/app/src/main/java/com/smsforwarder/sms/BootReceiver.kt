package com.smsforwarder.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(
      context: Context,
      intent: Intent,
  ) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    if (!SmsPrefs.open(context).getBoolean(SmsPrefs.ENABLED, false)) return
    context.startForegroundService(Intent(context, ForwardService::class.java))
  }
}
