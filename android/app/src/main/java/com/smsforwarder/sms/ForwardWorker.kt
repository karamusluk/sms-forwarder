package com.smsforwarder.sms

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.WorkerParameters
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import org.json.JSONObject

class ForwardWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    val prefs = SmsPrefs.open(applicationContext)
    if (!prefs.getBoolean(SmsPrefs.ENABLED, false)) {
      return Result.success()
    }

    val functionUrl = prefs.getString(SmsPrefs.FUNCTION_URL, null)
    val anonKey = prefs.getString(SmsPrefs.ANON_KEY, null)
    var accessToken = prefs.getString(SmsPrefs.ACCESS_TOKEN, null)
    var refreshToken = prefs.getString(SmsPrefs.REFRESH_TOKEN, null)
    val authUrl = prefs.getString(SmsPrefs.SUPABASE_AUTH_URL, null)
    val sender = inputData.getString(KEY_SENDER) ?: return Result.failure()
    val body = inputData.getString(KEY_BODY) ?: return Result.failure()
    val timestamp = inputData.getLong(KEY_TIMESTAMP, Long.MIN_VALUE)
    if (
        functionUrl.isNullOrBlank() ||
            anonKey.isNullOrBlank() ||
            accessToken.isNullOrBlank() ||
            refreshToken.isNullOrBlank() ||
            authUrl.isNullOrBlank() ||
            timestamp == Long.MIN_VALUE
    ) {
      return Result.failure()
    }

    val dedupeKey = dedupeKey(sender, timestamp, body)
    val payload =
        JSONObject()
            .put("sender", sender)
            .put("body", body)
            .put("timestamp", timestamp)
            .put("dedupe_key", dedupeKey)
            .toString()

    val first =
        try {
          postJson(functionUrl, accessToken, anonKey, payload)
        } catch (_: Exception) {
          emit("failed", dedupeKey, "network")
          return Result.retry()
        }

    val response =
        if (first.code == 401) {
          val refreshed =
              try {
                refreshSession(authUrl, anonKey, refreshToken)
              } catch (_: Exception) {
                null
              }
          if (refreshed == null) {
            emit("failed", dedupeKey, "unauthorized")
            return Result.retry()
          }
          accessToken = refreshed.accessToken
          refreshToken = refreshed.refreshToken
          prefs
              .edit()
              .putString(SmsPrefs.ACCESS_TOKEN, accessToken)
              .putString(SmsPrefs.REFRESH_TOKEN, refreshToken)
              .apply()
          try {
            postJson(functionUrl, accessToken, anonKey, payload)
          } catch (_: Exception) {
            emit("failed", dedupeKey, "network")
            return Result.retry()
          }
        } else {
          first
        }

    if (response.code in 200..299) {
      emit(outcome(response.body), dedupeKey, null)
      return Result.success()
    }
    if (response.code == 401 || response.code >= 500) {
      emit("failed", dedupeKey, errorCode(response))
      return Result.retry()
    }
    emit("failed", dedupeKey, errorCode(response))
    return Result.failure()
  }

  private fun outcome(body: String): String {
    val json = runCatching { JSONObject(body) }.getOrNull() ?: return "sent"
    if (json.optString("status") == "sent") return "sent"
    if (json.has("skipped")) return "skipped"
    return "sent"
  }

  private fun errorCode(response: HttpResult): String {
    val json = runCatching { JSONObject(response.body) }.getOrNull()
    val code = json?.optString("error").orEmpty()
    if (code.isNotBlank()) return code
    return if (response.code == 401) "unauthorized" else "generic"
  }

  private fun emit(
      status: String,
      dedupeKey: String,
      error: String?,
  ) {
    SmsForwarderModule.emitForwardResult(dedupeKey, status, error)
  }

  private data class HttpResult(
      val code: Int,
      val body: String,
  )

  private data class RefreshedSession(
      val accessToken: String,
      val refreshToken: String,
  )

  private fun postJson(
      url: String,
      accessToken: String,
      anonKey: String,
      json: String,
  ): HttpResult {
    return httpPost(url, json, accessToken, anonKey)
  }

  private fun refreshSession(
      authUrl: String,
      anonKey: String,
      refreshToken: String,
  ): RefreshedSession? {
    val url = authUrl.trimEnd('/') + "/token?grant_type=refresh_token"
    val body = JSONObject().put("refresh_token", refreshToken).toString()
    val response = httpPost(url, body, anonKey, anonKey)
    if (response.code !in 200..299) return null
    val json = JSONObject(response.body)
    val accessToken = json.optString("access_token")
    val nextRefresh = json.optString("refresh_token")
    if (accessToken.isBlank() || nextRefresh.isBlank()) return null
    return RefreshedSession(accessToken, nextRefresh)
  }

  private fun httpPost(
      url: String,
      json: String,
      bearer: String,
      anonKey: String,
  ): HttpResult {
    val connection = (URL(url).openConnection() as HttpURLConnection)
    try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 20_000
      connection.readTimeout = 20_000
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $bearer")
      connection.setRequestProperty("apikey", anonKey)
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { stream -> stream.write(json.toByteArray(Charsets.UTF_8)) }
      val code = connection.responseCode
      val stream = if (code in 200..299) connection.inputStream else connection.errorStream
      val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      return HttpResult(code, responseBody)
    } finally {
      connection.disconnect()
    }
  }

  companion object {
    private const val KEY_SENDER = "sender"
    private const val KEY_BODY = "body"
    private const val KEY_TIMESTAMP = "timestamp"

    fun enqueue(
        context: Context,
        sender: String,
        body: String,
        timestamp: Long,
    ) {
      val data =
          Data.Builder()
              .putString(KEY_SENDER, sender)
              .putString(KEY_BODY, body)
              .putLong(KEY_TIMESTAMP, timestamp)
              .build()
      val request =
          OneTimeWorkRequestBuilder<ForwardWorker>()
              .setInputData(data)
              .setConstraints(
                  Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
              )
              .setBackoffCriteria(
                  BackoffPolicy.EXPONENTIAL,
                  WorkRequest.MIN_BACKOFF_MILLIS,
                  TimeUnit.MILLISECONDS,
              )
              .build()
      WorkManager.getInstance(context).enqueue(request)
    }

    fun dedupeKey(
        sender: String,
        timestamp: Long,
        body: String,
    ): String {
      return "$sender|$timestamp|${shortHash(body)}"
    }

    private fun shortHash(value: String): String {
      var hash = 5381L
      for (character in value) {
        hash = imul(hash, 33) + character.code
      }
      var unsigned = hash % 4294967296L
      if (unsigned < 0) unsigned += 4294967296L
      return unsigned.toString(16).padStart(8, '0')
    }

    private fun imul(
        left: Long,
        right: Int,
    ): Long {
      return toInt32(toInt32(left).toLong() * right).toLong()
    }

    private fun toInt32(value: Long): Int {
      val masked = value and 0xFFFFFFFFL
      return if (masked >= 0x80000000L) (masked - 0x100000000L).toInt() else masked.toInt()
    }
  }
}
