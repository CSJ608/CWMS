package com.cwms.pda

import org.junit.Assert.assertEquals
import org.junit.Test

/** 数量步输入域边界:合法正整数放行,空/非数字/零/负/小数/超界拦截。 */
class ScanValuesTest {
    @Test fun 合法正整数() {
        assertEquals(10, ScanValues.qtyOf("10"))
        assertEquals(1, ScanValues.qtyOf("1"))
    }

    @Test fun 容忍首尾空白() {
        assertEquals(7, ScanValues.qtyOf(" 7 "))
    }

    @Test fun 非数字为空() {
        assertEquals(null, ScanValues.qtyOf("abc"))
        assertEquals(null, ScanValues.qtyOf(""))
    }

    @Test fun 零与负数为空() {
        assertEquals(null, ScanValues.qtyOf("0"))
        assertEquals(null, ScanValues.qtyOf("-1"))
    }

    @Test fun 小数与超界为空() {
        assertEquals(null, ScanValues.qtyOf("10.5"))
        assertEquals(null, ScanValues.qtyOf("99999999999999999999"))
    }
}
