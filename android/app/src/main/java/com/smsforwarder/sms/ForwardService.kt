package com.smsforwarder.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.Build
import android.os.IBinder
import com.smsforwarder.R

class ForwardService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(
      intent: Intent?,
      flags: Int,
      startId: Int,
  ): Int {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    val channel =
        NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
    manager.createNotificationChannel(channel)

    val language = SmsPrefs.open(this).getString(SmsPrefs.LANGUAGE, "tr")
    val text =
        if (language == "en") {
          "SMS forwarding active"
        } else {
          "SMS yönlendirme aktif"
        }

    return Notification.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_notification)
        .setColor(Color.parseColor("#1FB871"))
        .setContentTitle(text)
        .setOngoing(true)
        .build()
  }

  companion object {
    private const val CHANNEL_ID = "sms_forwarder"
    private const val CHANNEL_NAME = "SMS Forwarder"
    private const val NOTIFICATION_ID = 4101
  }
}
