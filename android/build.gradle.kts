plugins {
    id("com.android.application") version "9.4.1" apply false
    // AGP compiles Kotlin itself; this pins the Kotlin version it uses
    // and adds the Compose compiler, which ships with Kotlin.
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.21" apply false
}
