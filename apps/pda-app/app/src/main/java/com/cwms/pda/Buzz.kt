package com.cwms.pda

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * 工业反馈语义(全局仅两种,不新增第三种含义):
 * 成功 = 单脉冲 120ms;错误 = 双脉冲 400ms-停-400ms。每次错误都要震。
 */
object Buzz {
    fun ok(context: Context) = vibrator(context)?.vibrate(
        VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE))

    fun err(context: Context) = vibrator(context)?.vibrate(
        VibrationEffect.createWaveform(longArrayOf(0, 400, 400, 400), intArrayOf(0, 255, 0, 255), -1))

    private fun vibrator(context: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= 31) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
}
