package com.glasskeep.app.nativeapp.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.union
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.zIndex
import com.glasskeep.app.nativeapp.NativeAppContainer
import kotlin.math.roundToInt

/** A note's pane in the side-by-side view: the edge of the screen it keeps. */
enum class SplitPane { TOP, BOTTOM }

/**
 * Mobile SideBySideView.jsx: two equal panes, one over the other, each the
 * whole note surface inside its own 1px border, so the junction shows two
 * lines (globalCSS.js:2446-2478). Each pops in where it sits; the top one
 * keeps the status bar, the bottom one the navigation bar, and the
 * keyboard moves neither. Closing one leaves it in place while the other
 * grows over it to the full screen and stays open as the note, its edits
 * and scroll kept (sbsMobileSurvivorFrom*, globalCSS.js:2483-2576).
 */
@Composable
fun SideBySideNotesScreen(
    container: NativeAppContainer,
    serverUrl: String,
    firstId: String,
    secondId: String,
    /** sbsMobilePaneIn's progress, 0 to 1, read while drawing. */
    appear: () -> Float,
    /** The note left alone, closed in turn. */
    onClose: () -> Unit,
    onUnarchived: () -> Unit,
) {
    var closedId by rememberSaveable { mutableStateOf<String?>(null) }
    val grow = remember { Animatable(if (closedId == null) 0f else 1f) }
    LaunchedEffect(closedId) {
        if (closedId != null) grow.animateTo(1f, tween(360, easing = GkGlideEasing))
    }
    val alone by remember { derivedStateOf { grow.value == 1f } }
    Box(Modifier.fillMaxSize()) {
        for ((id, pane) in listOf(firstId to SplitPane.TOP, secondId to SplitPane.BOTTOM)) {
            key(id) {
                val closed = id == closedId
                val survivor = closedId != null && !closed
                if (!(closed && alone)) {
                    Box(
                        Modifier
                            .zIndex(if (survivor) 1f else 0f)
                            .layout { measurable, constraints ->
                                val half = constraints.maxHeight / 2f
                                val height = if (survivor) half * (1f + grow.value) else half
                                val top = when {
                                    pane == SplitPane.TOP -> 0f
                                    survivor -> half * (1f - grow.value)
                                    else -> half
                                }
                                val placeable = measurable.measure(Constraints.fixed(constraints.maxWidth, height.roundToInt()))
                                layout(constraints.maxWidth, constraints.maxHeight) { placeable.place(0, top.roundToInt()) }
                            }
                            .graphicsLayer {
                                val progress = appear()
                                alpha = progress
                                scaleX = 0.92f + 0.08f * progress
                                scaleY = 0.92f + 0.08f * progress
                            }
                            .then(
                                when {
                                    alone -> Modifier
                                    pane == SplitPane.TOP -> Modifier.consumeWindowInsets(WindowInsets.navigationBars.union(WindowInsets.ime))
                                    else -> Modifier.consumeWindowInsets(WindowInsets.statusBars.union(WindowInsets.ime))
                                },
                            ),
                    ) {
                        NoteDetailScreen(
                            container = container,
                            serverUrl = serverUrl,
                            noteId = id,
                            onBack = {
                                when (closedId) {
                                    null -> closedId = id
                                    id -> Unit
                                    else -> onClose()
                                }
                            },
                            onUnarchived = onUnarchived,
                            splitPane = pane.takeUnless { alone },
                        )
                        if (closed) {
                            // Frozen under the note growing over it, and
                            // out of reach meanwhile (pointer-events: none).
                            Box(Modifier.matchParentSize().pointerInput(Unit) { awaitEachGesture { awaitFirstDown(requireUnconsumed = false) } })
                        }
                    }
                }
            }
        }
    }
}
