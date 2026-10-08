package com.smsforwarder.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    if (messages.isEmpty()) return

    val sender = messages[0].displayOriginatingAddress ?: "unknown"
    val body = messages.joinToString(separator = "") { it.messageBody ?: "" }
    val timestamp = messages[0].timestampMillis

    SmsForwarderModule.emitSms(sender, body, timestamp)
    ForwardWorker.enqueue(context, sender, body, timestamp)
  }
}
