package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import com.glasskeep.app.nativeapp.data.network.SelfUpdateModeDto
import com.glasskeep.app.nativeapp.data.network.SelfUpdateStatusDto
import com.glasskeep.app.nativeapp.data.network.StartSelfUpdateRequest
import com.glasskeep.app.nativeapp.data.network.UpdateCheckDto
import com.glasskeep.app.ui.DarkSubtextColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightSubtextColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import retrofit2.Response

// The server version block as it was before the admin panel took the
// web's shape, until its web rebuild replaces it.

@Composable
internal fun LegacyAdminUpdateBlock(api: GlassKeepApi, dark: Boolean, title: Color, subtext: Color, border: Color) {
    val scope = rememberCoroutineScope()
    var update by remember { mutableStateOf<UpdateCheckDto?>(null) }
    var mode by remember { mutableStateOf<SelfUpdateModeDto?>(null) }
    var status by remember { mutableStateOf<SelfUpdateStatusDto?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmUpdate by remember { mutableStateOf(false) }

    suspend fun load() {
        update = api.checkServerUpdate().requireBody("update check")
        mode = api.selfUpdateMode().requireBody("update mode")
        val statusResponse = api.selfUpdateStatus()
        status = if (statusResponse.code() == 204) null else statusResponse.requireBody("update status")
    }
    fun run(block: suspend () -> Unit) {
        if (busy) return; busy = true; error = null
        scope.launch { try { block(); load() } catch (t: Throwable) { error = t.message } finally { busy = false } }
    }
    LaunchedEffect(Unit) { try { load() } catch (t: Throwable) { error = t.message } }
    LaunchedEffect(status?.inProgress) {
        while (status?.inProgress == true) {
            delay(1_500)
            runCatching { api.selfUpdateStatus() }.getOrNull()?.let { response ->
                if (response.isSuccessful) status = response.body()
            }
        }
    }

    AdminBlock {
        AdminHeading(R.string.native_admin_server_update, title)
        update?.let { info ->
            AdminCard(dark, border) {
                Text(stringResource(R.string.native_admin_version_current, info.currentVersion ?: "?"), color = title)
                Text(stringResource(R.string.native_admin_version_latest, info.latestVersion ?: "?"), color = subtext)
                Text(stringResource(if (info.updateAvailable) R.string.native_admin_update_available else R.string.native_admin_up_to_date), color = if (info.updateAvailable) Color(0xFFD97706) else Color(0xFF16A34A))
                if (info.updateAvailable && mode?.oneClickAvailable == true && info.latestVersion != null) {
                    AdminPrimary(stringResource(R.string.native_admin_update_now), !busy && status?.inProgress != true) { confirmUpdate = true }
                }
                if (mode?.oneClickAvailable != true) AdminHintText(mode?.reason ?: stringResource(R.string.native_admin_update_manual), subtext)
            }
        }
        status?.let { progress ->
            AdminCard(dark, border) {
                Text(progress.state ?: "idle", color = title, fontWeight = FontWeight.SemiBold)
                Text(progress.message ?: progress.step.orEmpty(), color = subtext, fontSize = 13.sp)
                if (progress.inProgress) SmallAction(stringResource(R.string.native_admin_cancel_update), danger = true, enabled = !busy) {
                    run { api.cancelSelfUpdate().requireBody("cancel update") }
                }
            }
        }
        error?.let { AdminError(it) }
    }
    if (confirmUpdate) {
        ConfirmAdminDialog(
            title = stringResource(R.string.native_admin_update_confirm_title),
            message = stringResource(R.string.native_admin_update_confirm_body),
            dark = dark,
            onDismiss = { confirmUpdate = false },
        ) {
            confirmUpdate = false
            run { api.startSelfUpdate(StartSelfUpdateRequest(update?.latestVersion ?: error("No version"))).requireBody("start update") }
        }
    }
}

@Composable
private fun AdminBlock(content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
}

@Composable
private fun AdminHeading(res: Int, color: Color, modifier: Modifier = Modifier) {
    Text(stringResource(res), color = color, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = modifier)
}

@Composable
private fun AdminHintText(value: String, color: Color) = Text(value, color = color, fontSize = 13.sp)

@Composable
private fun AdminCard(dark: Boolean, border: Color, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(if (dark) Color(0xFF242424) else Color.White)
            .border(1.dp, border, RoundedCornerShape(12.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) { content() }
}

@Composable
private fun AdminPrimary(label: String, enabled: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))) { Text(label) }
}

@Composable
private fun SmallAction(label: String, danger: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick, enabled = enabled,
        colors = ButtonDefaults.outlinedButtonColors(contentColor = if (danger) Color(0xFFDC2626) else Color.Unspecified),
    ) { Text(label, fontSize = 12.sp, maxLines = 1) }
}

@Composable
private fun AdminError(value: String) = Text(value, color = Color(0xFFDC2626), fontSize = 13.sp)

@Composable
private fun ConfirmAdminDialog(title: String, message: String, dark: Boolean, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (dark) Color(0xFF282828) else Color.White).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(title, color = if (dark) DarkTitleColor else LightTitleColor, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(message, color = if (dark) DarkSubtextColor else LightSubtextColor, fontSize = 14.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OutlinedButton(onClick = onDismiss) { Text(stringResource(R.string.native_dialog_cancel)) }
                Spacer(Modifier.width(8.dp))
                Button(onClick = onConfirm, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))) { Text(stringResource(R.string.native_admin_confirm)) }
            }
        }
    }
}

private suspend fun <T> Response<T>.requireBody(action: String): T {
    val body = body()
    if (isSuccessful && body != null) return body
    val detail = runCatching { errorBody()?.string() }.getOrNull().orEmpty()
    throw IllegalStateException("$action: HTTP ${code()}${if (detail.isBlank()) "" else " · $detail"}")
}

