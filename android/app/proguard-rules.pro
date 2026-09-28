# Keep Compose
-dontwarn androidx.compose.**

# jump3r: only its desktop front end (lowlevel.LameEncoder), which the app
# never calls, refers to the JDK's javax.sound, absent on Android.
-dontwarn javax.sound.sampled.**

# ML Kit builds the components its manifests name (the QR scanner's barcode
# scanning among them) by reflection, with their no-argument constructor,
# which R8 sees no call to: without it the scanner cannot start.
-keep class * implements com.google.firebase.components.ComponentRegistrar {
    <init>();
}
