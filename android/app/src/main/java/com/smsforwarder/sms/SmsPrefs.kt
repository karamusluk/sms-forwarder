package com.smsforwarder.sms

import android.content.Context
import android.content.SharedPreferences

object SmsPrefs {
  const val NAME = "sms_forwarder"
  const val FUNCTION_URL = "functionUrl"
  const val ANON_KEY = "anonKey"
  const val ACCESS_TOKEN = "accessToken"
  const val REFRESH_TOKEN = "refreshToken"
  const val SUPABASE_AUTH_URL = "supabaseAuthUrl"
  const val DESTINATION_EMAIL = "destinationEmail"
  const val ENABLED = "enabled"
  const val LANGUAGE = "language"

  fun open(context: Context): SharedPreferences {
    return context.getSharedPreferences(NAME, Context.MODE_PRIVATE)
  }
}
