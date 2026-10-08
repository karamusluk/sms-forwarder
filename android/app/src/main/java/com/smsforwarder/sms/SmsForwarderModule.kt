package com.smsforwarder.sms

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

@ReactModule(name = SmsForwarderModule.NAME)
class SmsForwarderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), PermissionListener {

  private var pendingSms: Promise? = null
  private var pendingNotifications: Promise? = null

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    instance = this
  }

  override fun invalidate() {
    pendingSms?.reject("E_ACTIVITY", "SMS permission request was cancelled.")
    pendingNotifications?.reject("E_ACTIVITY", "Notification permission request was cancelled.")
    pendingSms = null
    pendingNotifications = null
    if (instance === this) {
      instance = null
    }
    super.invalidate()
  }

  @ReactMethod
  fun hasSmsPermission(promise: Promise) {
    promise.resolve(hasReceiveSmsPermission())
  }

  @ReactMethod
  fun requestSmsPermission(promise: Promise) {
    if (hasReceiveSmsPermission()) {
      promise.resolve(true)
      return
    }

    val activity = reactApplicationContext.currentActivity
    if (activity !is PermissionAwareActivity) {
      promise.reject("E_ACTIVITY", "SMS permission requires a foreground activity.")
      return
    }

    if (pendingSms != null) {
      promise.reject("E_ACTIVITY", "An SMS permission request is already in progress.")
      return
    }

    pendingSms = promise
    activity.requestPermissions(arrayOf(Manifest.permission.RECEIVE_SMS), REQUEST_SMS, this)
  }

  @ReactMethod
  fun requestNotificationPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      promise.resolve(true)
      return
    }
    if (hasNotificationPermission()) {
      promise.resolve(true)
      return
    }

    val activity = reactApplicationContext.currentActivity
    if (activity !is PermissionAwareActivity) {
      promise.reject("E_ACTIVITY", "Notification permission requires a foreground activity.")
      return
    }
    if (pendingNotifications != null) {
      promise.reject("E_ACTIVITY", "A notification permission request is already in progress.")
      return
    }

    pendingNotifications = promise
    activity.requestPermissions(
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        REQUEST_NOTIFICATIONS,
        this,
    )
  }

  @ReactMethod
  fun setConfig(config: ReadableMap, promise: Promise) {
    try {
      val editor =
          prefs()
              .edit()
              .putString(SmsPrefs.FUNCTION_URL, requiredString(config, "functionUrl"))
              .putString(SmsPrefs.ANON_KEY, requiredString(config, "anonKey"))
              .putString(SmsPrefs.ACCESS_TOKEN, requiredString(config, "accessToken"))
              .putString(SmsPrefs.REFRESH_TOKEN, requiredString(config, "refreshToken"))
              .putString(SmsPrefs.SUPABASE_AUTH_URL, requiredString(config, "supabaseAuthUrl"))
              .putString(SmsPrefs.DESTINATION_EMAIL, requiredString(config, "destinationEmail"))
              .putBoolean(SmsPrefs.ENABLED, requiredBoolean(config, "enabled"))
      if (config.hasKey("language") && !config.isNull("language")) {
        config.getString("language")?.let { editor.putString(SmsPrefs.LANGUAGE, it) }
      }
      editor.apply()
      promise.resolve(true)
    } catch (error: IllegalArgumentException) {
      promise.reject("E_CONFIG", error.message, error)
    }
  }

  @ReactMethod
  fun setEnabled(enabled: Boolean, promise: Promise) {
    prefs().edit().putBoolean(SmsPrefs.ENABLED, enabled).apply()
    promise.resolve(true)
  }

  @ReactMethod
  fun startForegroundService(promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, ForwardService::class.java)
      reactApplicationContext.startForegroundService(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_SERVICE", error.message, error)
    }
  }

  @ReactMethod
  fun stopForegroundService(promise: Promise) {
    reactApplicationContext.stopService(Intent(reactApplicationContext, ForwardService::class.java))
    promise.resolve(true)
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    val powerManager = reactApplicationContext.getSystemService(PowerManager::class.java)
    promise.resolve(
        powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName),
    )
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      val intent =
          Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${reactApplicationContext.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_BATTERY", error.message, error)
    }
  }

  override fun onRequestPermissionsResult(
      requestCode: Int,
      permissions: Array<String>,
      grantResults: IntArray,
  ): Boolean {
    val granted =
        grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
    when (requestCode) {
      REQUEST_SMS -> {
        pendingSms?.resolve(granted)
        pendingSms = null
        return true
      }
      REQUEST_NOTIFICATIONS -> {
        pendingNotifications?.resolve(granted)
        pendingNotifications = null
        return true
      }
    }
    return false
  }

  private fun emitSms(sender: String, body: String, timestamp: Long) {
    val context = reactApplicationContext
    if (!context.hasActiveReactInstance()) return

    val payload =
        Arguments.createMap().apply {
          putString("sender", sender)
          putString("body", body)
          putDouble("timestamp", timestamp.toDouble())
        }
    context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_SMS_RECEIVED, payload)
  }

  private fun emitForwardResult(dedupeKey: String, status: String, error: String?) {
    val context = reactApplicationContext
    if (!context.hasActiveReactInstance()) return
    context.runOnUiQueueThread {
      if (!context.hasActiveReactInstance()) return@runOnUiQueueThread
      val payload =
          Arguments.createMap().apply {
            putString("dedupeKey", dedupeKey)
            putString("status", status)
            if (error != null) putString("error", error)
          }
      context
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_FORWARD_RESULT, payload)
    }
  }

  private fun hasReceiveSmsPermission(): Boolean {
    return reactApplicationContext.checkSelfPermission(Manifest.permission.RECEIVE_SMS) ==
        PackageManager.PERMISSION_GRANTED
  }

  private fun hasNotificationPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
    return reactApplicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
  }

  private fun prefs() = SmsPrefs.open(reactApplicationContext)

  private fun requiredString(config: ReadableMap, key: String): String {
    if (!config.hasKey(key) || config.isNull(key)) {
      throw IllegalArgumentException("Missing config field: $key")
    }
    return config.getString(key) ?: throw IllegalArgumentException("Missing config field: $key")
  }

  private fun requiredBoolean(config: ReadableMap, key: String): Boolean {
    if (!config.hasKey(key) || config.isNull(key)) {
      throw IllegalArgumentException("Missing config field: $key")
    }
    return config.getBoolean(key)
  }

  companion object {
    const val NAME = "SmsForwarder"
    const val EVENT_SMS_RECEIVED = "onSmsReceived"
    const val EVENT_FORWARD_RESULT = "onForwardResult"
    private const val REQUEST_SMS = 41029
    private const val REQUEST_NOTIFICATIONS = 41033

    @Volatile private var instance: SmsForwarderModule? = null

    fun emitSms(sender: String, body: String, timestamp: Long) {
      val module = instance ?: return
      module.emitSms(sender, body, timestamp)
    }

    fun emitForwardResult(dedupeKey: String, status: String, error: String?) {
      val module = instance ?: return
      module.emitForwardResult(dedupeKey, status, error)
    }
  }
}
