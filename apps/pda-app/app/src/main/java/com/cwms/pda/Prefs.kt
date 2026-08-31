package com.cwms.pda

import android.content.Context
import android.content.SharedPreferences

/** 应用配置(SharedPreferences):服务器地址 + 扫码广播 action(空=键盘模式)。 */
object Prefs {
    private const val FILE = "cwms_pda"

    fun of(context: Context): SharedPreferences = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun server(context: Context): String =
        of(context).getString("server", "http://192.168.20.252:8080") ?: "http://192.168.20.252:8080"

    fun scanAction(context: Context): String = of(context).getString("scan_action", "") ?: ""
}
