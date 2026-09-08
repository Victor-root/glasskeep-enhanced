import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    // Native rewrite: KSP generates Room's DAO implementations at compile
    // time (no reflection, unlike kapt); the serialization plugin lets data
    // classes be marked @Serializable for the Retrofit/JSON layer below.
    id("com.google.devtools.ksp")
    id("org.jetbrains.kotlin.plugin.serialization")
    // Kotlin 2.0+: the Compose compiler is a Kotlin compiler plugin now,
    // not a composeOptions{} version string. See the composeOptions
    // removal below.
    id("org.jetbrains.kotlin.plugin.compose")
}

// Pull release-keystore credentials from android/keystore.properties.
// File is gitignored — it lives on the maintainer's machine and on no
// CI box that the maintainer didn't set up themselves. When it's
// missing (fresh clone, F-Droid build server, fork without a keystore)
// we silently fall back to Android Studio's auto-debug keystore so the
// project still builds. See keystore.properties.example for the format.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps =
    Properties().apply {
        if (keystorePropsFile.exists()) {
            keystorePropsFile.inputStream().use { load(it) }
        }
    }
val hasReleaseSigning =
    keystoreProps.getProperty("storeFile")?.isNotBlank() == true &&
        rootProject.file(keystoreProps.getProperty("storeFile")).exists()

android {
    namespace = "com.glasskeep.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.glasskeep.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 10
        versionName = "1.4.7"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Sign debug builds with the release key when available — this
            // is what makes the green Run triangle in Android Studio
            // install a passkey-capable APK without going through the
            // "Generate Signed Bundle / APK" wizard. The fingerprint
            // matches /.well-known/assetlinks.json, so Credential Manager
            // accepts the WebView's WebAuthn calls.
            //
            // When keystore.properties is missing, Gradle falls back to
            // its auto-generated debug key — useful for forks who haven't
            // set up signing yet, but passkeys won't work in that build.
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        // BuildConfig is opt-in on AGP 8+. The self-update flow reads
        // BuildConfig.VERSION_NAME to compare against the latest APK
        // asset on GitHub Releases.
        buildConfig = true
    }

}

// Rename the output APK so Android Studio's Build → Build Bundle(s) /
// APK(s) → Build APK(s) drops a "GlassKeep-v<versionName>.apk" file
// (debug builds get a "-debug" suffix) instead of the default
// "app-release.apk" / "app-debug.apk". Matches the asset naming
// convention the in-app self-updater scans for on GitHub Releases, so
// the APK uploaded to a release is already named correctly.
//
// This used to be `android.applicationVariants.all { ... }` casting the
// output to the internal BaseVariantOutputImpl class. AGP 9 disabled
// that legacy variant API by default (gone for good in AGP 10), so this
// is the modern androidComponents replacement: a top-level block, not
// nested inside android {}, and versionName is read from defaultConfig
// directly rather than from the (now lazy/Provider-based) variant itself.
androidComponents {
    onVariants { variant ->
        variant.outputs.forEach { output ->
            val suffix = if (variant.buildType == "debug") "-debug" else ""
            output.outputFileName.set("GlassKeep-v${android.defaultConfig.versionName}$suffix.apk")
        }
    }
}

dependencies {
    // Current as of the Sept 2026 toolchain upgrade (was 2024.04.01).
    // Tracks the Kotlin/AGP/Gradle bump above: the Compose compiler
    // plugin, the BOM and Kotlin all move together, an old BOM paired
    // with a new Kotlin/compiler is the same kind of mismatch that broke
    // CircularProgressIndicator earlier in this project (see git log).
    implementation(platform("androidx.compose:compose-bom:2026.08.00"))
    implementation("androidx.core:core-ktx:1.12.0")
    // WorkManager: periodic background reminder sync so reminders created on
    // another device still fire on a closed phone — without any push service.
    // AndroidX → JobScheduler (AOSP), NOT Google Play Services. See
    // ReminderSyncWorker. (Keeps the app Google-free.)
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.webkit:webkit:1.9.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")

    // Custom Tabs: opens external URLs as an overlay on top of the
    // app (Chrome / Brave / Firefox custom-tab UI) instead of cold-
    // launching the full browser app. The user stays in our task
    // stack — back returns to the WebView — and the page renders in
    // their default browser's engine + session cookies.
    implementation("androidx.browser:browser:1.8.0")

    // Credential Manager: Android's unified API for passkeys, passwords
    // and federated sign-in. Bridges the WebView's WebAuthn calls into
    // the OS-level passkey UI (Google Password Manager / 1Password /
    // Bitwarden / etc.) so passkeys work inside the app instead of
    // forcing users back to a browser.
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")

    // Plain JVM unit tests (./gradlew test). net/CleartextPolicy decides
    // which server addresses may be reached without TLS and touches
    // nothing Android-specific, so it is testable without a device.
    testImplementation("junit:junit:4.13.2")

    // ---- Native rewrite (0-webview effort) --------------------------------
    // Nothing above this line needed to change: the server exposes a plain
    // JSON/HTTP API with a Bearer token, so the native app is a normal
    // Android client, no backend changes required (see the migration report).

    // Screen-to-screen navigation. Nothing in the app does this today; every
    // "screen" so far has been a page inside the WebView.
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")

    // Local database on the phone (offline cache of notes + the sync queue
    // later on). Room = SQLite with generated, type-safe access.
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // HTTP client talking to the same /api/* routes the web app already
    // uses. kotlinx.serialization decodes the JSON responses into plain
    // Kotlin data classes.
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-kotlinx-serialization:2.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Prints every request/response to Logcat. Debug builds only: this is
    // exactly the traffic to paste back when something doesn't sync right.
    debugImplementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Encrypted on-device storage for the session token (the web app keeps
    // it in localStorage; a native app has no such thing, and a session
    // token is not something to leave in plain SharedPreferences).
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
