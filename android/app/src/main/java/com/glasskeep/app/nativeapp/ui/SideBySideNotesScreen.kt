package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.LightBorderColor

/** Mobile SideBySideView.jsx: two equal vertical panes. Each pane is the
 *  complete native note surface; closing either promotes the survivor. */
@Composable
fun SideBySideNotesScreen(
    container: NativeAppContainer,
    serverUrl: String,
    firstId: String,
    secondId: String,
    onKeepOnly: (String) -> Unit,
) {
    val border = if (LocalGkDark.current) DarkBorderColor else LightBorderColor
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxWidth().weight(1f)) {
            NoteDetailScreen(container, serverUrl, firstId, onBack = { onKeepOnly(secondId) })
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(border))
        Box(Modifier.fillMaxWidth().weight(1f)) {
            NoteDetailScreen(container, serverUrl, secondId, onBack = { onKeepOnly(firstId) })
        }
    }
}
