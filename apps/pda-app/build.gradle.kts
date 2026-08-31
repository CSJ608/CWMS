// CWMS PDA 应用根构建(CWMS 仓内独立构建系:pnpm workspace 不收编本目录,CI 不构建 APK,见 ADR-0013)
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
