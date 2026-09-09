plugins {
    // Toolchain upgrade (Sept 2026): was AGP 8.2.2 / Kotlin 1.9.22, about
    // 2.5 years behind. Bumped together since they're tested as one set;
    // see the app module's build.gradle.kts for what else this pulled in
    // (Compose compiler plugin, Compose BOM) and the removed legacy
    // variant API this forced a rewrite of.
    //
    // No org.jetbrains.kotlin.android plugin here anymore: AGP 9.0+ compiles
    // Kotlin itself (built-in Kotlin support), applying that plugin on top
    // now fails the build outright. The Kotlin version for the plugins
    // below still comes from their own "version 2.4.20", not from this one.
    id("com.android.application") version "9.4.0" apply false
    // Native app: Room's annotation processor and the
    // JSON serializer for the Retrofit API client both need a Gradle plugin
    // declared at the root, then applied (without a version) in app/build.gradle.kts.
    // KSP decoupled its own version numbering from Kotlin's a while back
    // (used to be "<kotlin-version>-<ksp-version>"), so this is KSP's own
    // release number, not tied to the 2.4.20 above.
    id("com.google.devtools.ksp") version "2.3.11" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.4.20" apply false
    // Kotlin 2.0+ moved the Jetpack Compose compiler into the Kotlin
    // repository itself: composeOptions.kotlinCompilerExtensionVersion
    // (app/build.gradle.kts) is gone, this plugin replaces it.
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.20" apply false
}
