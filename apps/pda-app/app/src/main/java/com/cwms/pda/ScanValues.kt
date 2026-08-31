package com.cwms.pda

/** 纯 JVM 输入解析(可单测):数量步的正整数判定,与 web 端 qtyOf 同口径。 */
object ScanValues {
    fun qtyOf(raw: String): Int? = raw.trim().toIntOrNull()?.takeIf { it > 0 }
}
