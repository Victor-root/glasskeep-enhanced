# Keep Compose
-dontwarn androidx.compose.**

# jump3r: only its desktop front end (lowlevel.LameEncoder), which the app
# never calls, refers to the JDK's javax.sound, absent on Android.
-dontwarn javax.sound.sampled.**
