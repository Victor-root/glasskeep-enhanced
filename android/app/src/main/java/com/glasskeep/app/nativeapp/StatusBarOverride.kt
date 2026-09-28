package com.glasskeep.app.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * The colour the status/nav bars take instead of the workspace theme's, so
 * that they match an open note's own background. Each note screen holds a
 * [Claim] for as long as it is shown, and the latest claim with a colour
 * wins: a note opened over another (a notification's Open, a reminder)
 * takes the bars over, and the note left once either goes keeps them, as
 * the web's one note modal just recolours them (NoteModal.jsx:467).
 */
class StatusBarOverride {
    private val claims = mutableStateListOf<Claim>()

    /** The bars' colour as an ARGB Int, or null for the theme's own. */
    val argb: Int?
        get() = claims.asReversed().firstNotNullOfOrNull { it.argb }

    fun add(claim: Claim) {
        claims += claim
    }

    fun remove(claim: Claim) {
        claims -= claim
    }

    /** One screen's say in the bars' colour. */
    class Claim {
        /** Null while the screen leaves the bars to the others. */
        var argb: Int? by mutableStateOf(null)
    }
}
