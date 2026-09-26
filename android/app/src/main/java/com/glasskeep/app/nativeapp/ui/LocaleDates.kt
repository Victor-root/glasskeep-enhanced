package com.glasskeep.app.nativeapp.ui

import android.text.format.DateFormat
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** `new Date(iso).toLocaleString()`: the numeric date with its full year
 *  and the time with its seconds, in the device's own format. */
internal fun localeDateTimeString(iso: String): String = localeFormat(iso, "yMdjms")

/** `new Date(iso).toLocaleDateString()`: the numeric date alone. */
internal fun localeDateString(iso: String): String = localeFormat(iso, "yMd")

private fun localeFormat(iso: String, skeleton: String): String {
    val ms = parseIsoToEpochMillis(iso) ?: return iso
    val locale = Locale.getDefault()
    return SimpleDateFormat(DateFormat.getBestDateTimePattern(locale, skeleton), locale).format(Date(ms))
}
