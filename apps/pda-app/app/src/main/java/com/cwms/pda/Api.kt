package com.cwms.pda

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * CWMS /api 最小 HTTP 客户端:零第三方依赖(HttpURLConnection + org.json)。
 * 内网明文 HTTP 已在 Manifest 放行;超时 连接 10s/读 30s(联调事实约定)。
 * 回调统一切回主线程;任何异常都以 onOk=false + 服务端/异常文案回传,调用方只管呈现。
 */
object Api {
    private val pool: ExecutorService = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    fun get(base: String, path: String, cb: (ok: Boolean, json: JSONObject?, error: String) -> Unit) {
        pool.execute {
            var conn: HttpURLConnection? = null
            try {
                conn = (URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 30_000
                    requestMethod = "GET"
                }
                val json = parseBody(conn, readBody(conn))
                main.post { cb(true, json, "") }
            } catch (e: Exception) {
                main.post { cb(false, null, e.message ?: e.toString()) }
            } finally {
                conn?.disconnect()
            }
        }
    }

    fun post(base: String, path: String, payload: JSONObject, cb: (ok: Boolean, json: JSONObject?, error: String) -> Unit) {
        pool.execute {
            var conn: HttpURLConnection? = null
            try {
                val bytes = payload.toString().toByteArray(Charsets.UTF_8)
                conn = (URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 30_000
                    requestMethod = "POST"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setFixedLengthStreamingMode(bytes.size)
                }
                conn.outputStream.use { it.write(bytes) }
                val json = parseBody(conn, readBody(conn))
                main.post { cb(true, json, "") }
            } catch (e: Exception) {
                main.post { cb(false, null, e.message ?: e.toString()) }
            } finally {
                conn?.disconnect()
            }
        }
    }

    /** 非法请求(如完结会话再提交)服务端回 500 + JSON 错误体:不读 errorStream 会把 URL 当异常文案。 */
    private fun readBody(conn: HttpURLConnection): String {
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        return stream?.bufferedReader()?.readText()
            ?: throw RuntimeException("HTTP ${conn.responseCode}")
    }

    private fun parseBody(conn: HttpURLConnection, body: String): JSONObject =
        try {
            JSONObject(body)
        } catch (e: Exception) {
            throw RuntimeException("服务端返回非 JSON(HTTP ${conn.responseCode})")
        }
}
