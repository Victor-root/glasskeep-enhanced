package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.Serializable

/**
 * The buckets the two Notifications settings work in, ported from
 * soundCategoryFor/filterCategoryFor (App.jsx:742-787).
 *
 * The sound list offers six of them, the display filter eight: the two
 * extra ones ([FEDERATION] and [REMINDER]) have explicit notification
 * types of their own, which the sound side never needed to tell apart.
 */
enum class NotifCategory(val key: String) {
    FEDERATION("federation"),
    SHARE("share"),
    ACCESS("access"),
    REMINDER("reminder"),
    SUCCESS("success"),
    WARNING("warning"),
    ERROR("error"),
    INFO("info");

    companion object {
        /** The six the sound list shows, in its own order. */
        val SOUND = listOf(SHARE, ACCESS, SUCCESS, WARNING, ERROR, INFO)

        /** The eight the display filter shows, in its own order. */
        val FILTER = listOf(FEDERATION, SHARE, ACCESS, REMINDER, SUCCESS, WARNING, ERROR, INFO)

        /** An explicit notification `type` wins over the variant, which is
         *  only the fallback for the plain success/warning/error/info
         *  messages the app raises itself. */
        fun of(type: String?, variant: NotifVariantKey): NotifCategory = when (type) {
            "federation" -> FEDERATION
            "reminder" -> REMINDER
            "note_shared" -> SHARE
            "note_access_revoked", "note_access_revoked_with_copy",
            "collaborator_removed", "collaborator_removed_with_copy",
            "collaborator_left", "shared_note_deleted", "shared_note_deleted_with_copy",
            -> ACCESS
            else -> when (variant) {
                NotifVariantKey.SUCCESS -> SUCCESS
                NotifVariantKey.WARNING -> WARNING
                NotifVariantKey.ERROR -> ERROR
                NotifVariantKey.INFO -> INFO
            }
        }
    }
}

/** The variant half of [NotifCategory.of]. Kept in the data layer so the
 *  categories do not depend on the ui layer's own colour-carrying enum. */
enum class NotifVariantKey { SUCCESS, WARNING, ERROR, INFO }

/**
 * Which categories are on. Absent means on, exactly like the web's own
 * `types?.[key] !== false` reads, so a category the server has never
 * heard of still shows.
 */
@Serializable
data class NotifCategoryFlags(val values: Map<String, Boolean> = emptyMap()) {
    operator fun get(category: NotifCategory): Boolean = values[category.key] != false

    fun with(category: NotifCategory, enabled: Boolean): NotifCategoryFlags =
        NotifCategoryFlags(values + (category.key to enabled))

    companion object {
        val ALL_ON = NotifCategoryFlags()
    }
}
