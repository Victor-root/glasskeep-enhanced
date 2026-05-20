import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
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
        // TEMP — testing the self-update flow against the published
        // 1.3.0 APK. Both versionCode and versionName are bumped down
        // so Android's PackageManager accepts the 1.3.0 download as a
        // genuine upgrade. Restore to versionCode=6 / versionName=1.3.0
        // before publishing the next release.
        versionCode = 5
        versionName = "1.2.0"
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

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }

    // Rename the output APK so Android Studio's Build → Build Bundle(s) /
    // APK(s) → Build APK(s) drops a "GlassKeep-v<versionName>.apk" file
    // (debug builds get a "-debug" suffix) instead of the default
    // "app-release.apk" / "app-debug.apk". Matches the asset naming
    // convention the in-app self-updater scans for on GitHub Releases,
    // so the APK uploaded to a release is already named correctly.
    applicationVariants.all {
        val variant = this
        outputs.forEach { output ->
            val suffix = if (variant.buildType.name == "debug") "-debug" else ""
            (output as com.android.build.gradle.internal.api.BaseVariantOutputImpl)
                .outputFileName = "GlassKeep-v${variant.versionName}${suffix}.apk"
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.01.00"))
    implementation("androidx.core:core-ktx:1.12.0")
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
}
