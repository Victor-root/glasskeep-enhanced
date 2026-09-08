plugins {
    id("com.android.application") version "8.2.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
    // Native rewrite (0-webview effort): Room's annotation processor and the
    // JSON serializer for the Retrofit API client both need a Gradle plugin
    // declared at the root, then applied (without a version) in app/build.gradle.kts.
    id("com.google.devtools.ksp") version "1.9.22-1.0.17" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.22" apply false
}
