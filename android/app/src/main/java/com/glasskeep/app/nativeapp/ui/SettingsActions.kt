package com.glasskeep.app.nativeapp.ui

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeAppContainer
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.NoteExporter
import com.glasskeep.app.nativeapp.data.ChangePasswordResult
import com.glasskeep.app.nativeapp.data.NoteTransfer
import com.glasskeep.app.nativeapp.data.NotesRepository
import com.glasskeep.app.nativeapp.data.SyncQueueWorker
import com.glasskeep.app.nativeapp.data.local.NoteEntity
import com.glasskeep.app.nativeapp.data.network.ImportNotesResponse
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import com.glasskeep.app.ui.DarkBorderColor
import com.glasskeep.app.ui.DarkTitleColor
import com.glasskeep.app.ui.LightBorderColor
import com.glasskeep.app.ui.LightTitleColor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/** The export file is written the way the web writes its own:
 *  JSON.stringify(payload, null, 2) (useImportExport.js:156). The
 *  two-space indent is what needs the opt-in; the rest is stable API. */
@OptIn(ExperimentalSerializationApi::class)
private val prettyJson = Json { prettyPrint = true; prettyPrintIndent = "  " }

/**
 * The settings panel's account actions, run the way App.jsx runs them on
 * the web: SettingsPanel only closes itself and calls back (onExportAll,
 * onImportAll, onDownloadSecretKey, onResetNoteOrder, onChangePassword),
 * so every file picker, share sheet, result message and the password
 * dialog land over the notes list. They live at NativeNavHost's level
 * for the same reason: by then the settings route, and every launcher and
 * coroutine it owned, has left the composition.
 *
 * Results and failures of the file actions are what the WebView showed
 * through the web's `alert()`, [alertMessage]; the files themselves leave
 * through the share sheet.
 */
@Stable
internal class SettingsActions(
    private val context: Context,
    private val container: NativeAppContainer,
    private val repository: NotesRepository,
    private val scope: CoroutineScope,
    private val toasts: ToastController,
) {
    var alertMessage: String? by mutableStateOf(null)
        private set

    var changePasswordOpen: Boolean by mutableStateOf(false)
        private set

    var passwordSaving: Boolean by mutableStateOf(false)
        private set

    var passwordError: String? by mutableStateOf(null)
        private set

    private var transferRunning = false
    private var glassKeepPicker: ActivityResultLauncher<Array<String>>? = null
    private var googleKeepPicker: ActivityResultLauncher<Array<String>>? = null
    private var markdownPicker: ActivityResultLauncher<Array<String>>? = null

    fun attachPickers(
        glassKeep: ActivityResultLauncher<Array<String>>,
        googleKeep: ActivityResultLauncher<Array<String>>,
        markdown: ActivityResultLauncher<Array<String>>,
    ) {
        glassKeepPicker = glassKeep
        googleKeepPicker = googleKeep
        markdownPicker = markdown
    }

    fun dismissAlert() {
        alertMessage = null
    }

    // "*/*" as well: a .json picked from a file manager often reports as
    // application/octet-stream.
    fun pickGlassKeepExport() {
        glassKeepPicker?.launch(arrayOf("application/json", "*/*"))
    }

    fun pickGoogleKeep() {
        googleKeepPicker?.launch(arrayOf("application/zip", "application/json", "image/*", "*/*"))
    }

    fun pickMarkdown() {
        markdownPicker?.launch(arrayOf("text/markdown", "text/plain", "*/*"))
    }

    fun exportAll() {
        if (transferRunning) return
        transferRunning = true
        scope.launch {
            try {
                val payload = repository.exportNotes()
                // Sanitised before the extension, as the web does, so a
                // long address never cuts the ".json" off.
                val filename = NoteExporter.sanitizeFilename(
                    NoteTransfer.exportFilename(container.tokenStore.profile?.email),
                ) + ".json"
                val pretty = withContext(Dispatchers.IO) { prettyJson.encodeToString(JsonElement.serializer(), payload) }
                val shared = withContext(Dispatchers.IO) {
                    NoteExporter.exportTextFile(context, filename, pretty, "application/json")
                }
                if (!shared) alertMessage = context.getString(R.string.native_settings_export_failed)
            } catch (t: Throwable) {
                NativeDebug.e("SettingsActions exportAll failed", t)
                alertMessage = context.getString(R.string.native_settings_export_failed)
            } finally {
                transferRunning = false
            }
        }
    }

    /** No confirmation step, matching useImportExport.js's own
     *  downloadSecretKey(): the server rotates the key on this call and the
     *  new one only ever leaves as the .txt file, never shown on screen. */
    fun downloadSecretKey() {
        if (transferRunning) return
        transferRunning = true
        scope.launch {
            alertMessage = try {
                val key = repository.generateSecretKey()
                val content = NoteTransfer.secretKeyFile(
                    key,
                    context.getString(R.string.native_login_forgot_password),
                    context.getString(R.string.native_secret_login_title),
                )
                val shared = withContext(Dispatchers.IO) {
                    NoteExporter.exportTextFile(context, NoteTransfer.secretKeyFilename(), content, "text/plain")
                }
                context.getString(
                    if (shared) R.string.native_settings_secret_key_downloaded else R.string.native_settings_secret_key_failed,
                )
            } catch (t: Throwable) {
                NativeDebug.e("SettingsActions downloadSecretKey failed", t)
                context.getString(R.string.native_settings_secret_key_failed)
            } finally {
                transferRunning = false
            }
        }
    }

    fun importGlassKeepExport(uri: Uri) = runImport(
        emptyMessage = R.string.native_settings_import_no_notes,
        successTemplate = R.string.native_settings_import_done,
        failureMessage = R.string.native_settings_import_failed,
    ) {
        val raw = context.contentResolver.openInputStream(uri)?.use { it.readBytes().decodeToString() }
        raw?.let { NoteTransfer.readGlassKeepExport(it) }
    }

    fun importGoogleKeep(uris: List<Uri>) = runImport(
        emptyMessage = R.string.native_settings_import_gkeep_none,
        successTemplate = R.string.native_settings_import_gkeep_done,
        failureMessage = R.string.native_settings_import_gkeep_failed,
    ) { NoteTransfer.readGoogleKeep(context, uris) }

    fun importMarkdown(uris: List<Uri>) = runImport(
        emptyMessage = R.string.native_settings_import_md_none,
        successTemplate = R.string.native_settings_import_md_done,
        failureMessage = R.string.native_settings_import_md_failed,
    ) { NoteTransfer.readMarkdown(context, uris) }

    /** The three imports differ only in how the files are read; everything
     *  after that (nothing usable, send, report) is the same. */
    private fun runImport(
        emptyMessage: Int,
        successTemplate: Int,
        failureMessage: Int,
        read: suspend () -> NoteTransfer.ImportPayload?,
    ) {
        if (transferRunning) return
        transferRunning = true
        scope.launch {
            alertMessage = try {
                val payload = withContext(Dispatchers.IO) { read() }
                when {
                    payload == null -> context.getString(R.string.native_settings_import_invalid_json)
                    payload.notes.isEmpty() -> context.getString(emptyMessage)
                    else -> importMessage(
                        repository.importNotes(payload.notes),
                        payload.attempted,
                        context.getString(successTemplate),
                    )
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsActions import failed", t)
                context.getString(failureMessage)
            } finally {
                transferRunning = false
            }
        }
    }

    /** buildImportMessage() (useImportExport.js:36-66): imported, restored,
     *  skipped and rejected each get said out loud, since a restore that
     *  only updates would otherwise report nothing at all. */
    private fun importMessage(result: ImportNotesResponse, attempted: Int, successTemplate: String): String {
        val imported = result.imported
        val base = when {
            result.skipped > 0 && imported == 0 -> context.getString(R.string.native_settings_import_all_skipped)
                .replace("{skipped}", "${result.skipped}")
            result.skipped > 0 -> context.getString(R.string.native_settings_import_done_skipped)
                .replace("{count}", "$imported")
                .replace("{skipped}", "${result.skipped}")
            else -> successTemplate.replace("{count}", "${if (imported > 0) imported else attempted}")
        }
        val withUpdated = when {
            result.updated == 0 -> base
            imported == 0 && result.skipped == 0 -> context.getString(R.string.native_settings_import_all_updated)
                .replace("{updated}", "${result.updated}")
            else -> "$base ${
                context.getString(R.string.native_settings_import_also_updated).replace("{updated}", "${result.updated}")
            }"
        }
        if (result.rejected == 0) return withUpdated
        return "$withUpdated ${
            context.getString(R.string.native_settings_import_rejected).replace("{rejected}", "${result.rejected}")
        }"
    }

    /**
     * resetNoteOrder() (App.jsx:6614): pinned first, then most recently
     * updated, sent through the same reorder the drag-and-drop uses. The
     * dialog's "overwrite custom positions" box only decides whether the
     * web's in-memory copy gets provisional positions before the server
     * answers; the server assigns the real ones from the id lists either
     * way (server/index.js:2917-2933), and this app's optimistic reorder
     * already writes them.
     */
    fun resetNoteOrder() {
        if (transferRunning) return
        transferRunning = true
        scope.launch {
            try {
                val all = repository.observeNotes().first()
                // Pinned first, then most recently modified. The web adds
                // creation date as a last tie-break; the local cache does
                // not keep one (see NoteEntity), so two notes modified in
                // the very same millisecond keep whatever order they had.
                val sorted = all.sortedWith(
                    compareByDescending<NoteEntity> { it.pinned }
                        .thenByDescending { it.updatedAt?.let(::parseIsoToEpochMillis) ?: 0L },
                )
                repository.reorderQueued(sorted.filter { it.pinned }, sorted.filterNot { it.pinned })
                SyncQueueWorker.triggerNow(context)
                toasts.success(context.getString(R.string.native_settings_reset_order_done))
            } catch (t: Throwable) {
                NativeDebug.e("SettingsActions resetNoteOrder failed", t)
                toasts.error(
                    context.getString(R.string.native_settings_action_error, t.message ?: t.javaClass.simpleName),
                )
            } finally {
                transferRunning = false
            }
        }
    }

    fun openChangePassword() {
        passwordError = null
        changePasswordOpen = true
    }

    fun closeChangePassword() {
        changePasswordOpen = false
    }

    fun clearPasswordError() {
        passwordError = null
    }

    /** ChangePasswordModal.jsx's own checks, then the change itself. It
     *  runs here rather than in the dialog: the server signs every other
     *  session out on success, so the fresh token must be stored even when
     *  the dialog was closed while the request was still out. */
    fun changePassword(current: String, new: String, confirm: String) {
        if (passwordSaving) return
        passwordError = null
        if (new.length < 6) {
            passwordError = context.getString(R.string.native_settings_password_too_short)
            return
        }
        if (new != confirm) {
            passwordError = context.getString(R.string.native_settings_password_mismatch)
            return
        }
        passwordSaving = true
        scope.launch {
            try {
                when (val result = repository.changePassword(current.ifBlank { null }, new)) {
                    is ChangePasswordResult.Saved -> {
                        container.tokenStore.token = result.token
                        changePasswordOpen = false
                        toasts.success(context.getString(R.string.native_settings_password_success))
                    }
                    is ChangePasswordResult.Rejected -> {
                        passwordError = context.getString(R.string.native_settings_password_error, result.httpCode)
                    }
                }
            } catch (t: Throwable) {
                NativeDebug.e("SettingsActions changePassword failed", t)
                passwordError = context.getString(R.string.native_settings_action_error, t.message ?: t.javaClass.simpleName)
            } finally {
                passwordSaving = false
            }
        }
    }
}

@Composable
internal fun rememberSettingsActions(
    container: NativeAppContainer,
    repository: NotesRepository,
    toasts: ToastController,
): SettingsActions {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val actions = remember(repository, toasts) { SettingsActions(context, container, repository, scope, toasts) }
    val glassKeepPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) actions.importGlassKeepExport(uri)
    }
    val googleKeepPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) actions.importGoogleKeep(uris)
    }
    val markdownPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) actions.importMarkdown(uris)
    }
    SideEffect { actions.attachPickers(glassKeepPicker, googleKeepPicker, markdownPicker) }
    return actions
}

/** The alert and the password dialog [SettingsActions] raise, drawn over
 *  whatever screen is showing. */
@Composable
internal fun SettingsActionDialogs(actions: SettingsActions, themeId: String, dark: Boolean) {
    val titleColor = if (dark) DarkTitleColor else LightTitleColor
    val borderColor = if (dark) DarkBorderColor else LightBorderColor
    actions.alertMessage?.let { message ->
        GkAlertDialog(
            message = message,
            themeId = themeId,
            dark = dark,
            borderColor = borderColor,
            textColor = titleColor,
            onDismiss = actions::dismissAlert,
        )
    }
    if (actions.changePasswordOpen) {
        ChangePasswordDialog(actions, themeId, dark, titleColor, borderColor)
    }
}

/** ChangePasswordModal.jsx: three labelled fields, the new one focused on
 *  open, the inline error, then Cancel and the gradient submit, which
 *  reads "Saving..." while the request is out. */
@Composable
private fun ChangePasswordDialog(
    actions: SettingsActions,
    themeId: String,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    val newFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { newFocus.requestFocus() }
    val focusRing = WorkspaceTheme.fieldFocusRing(themeId, dark)

    GkDialog(
        onDismissRequest = actions::closeChangePassword,
        dark = dark,
        borderColor = borderColor,
        dismissOnClickOutside = false,
    ) {
        Text(
            stringResource(R.string.native_settings_change_password),
            color = titleColor,
            fontSize = 18.sp,
            lineHeight = 28.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(16.dp))
        GkTextField(
            value = current,
            onValueChange = { current = it; actions.clearPasswordError() },
            label = stringResource(R.string.native_settings_password_current),
            placeholder = stringResource(R.string.native_settings_password_current),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            focusRingColor = focusRing,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
            visualTransformation = PasswordVisualTransformation(),
        )
        Spacer(Modifier.height(16.dp))
        GkTextField(
            value = new,
            onValueChange = { new = it; actions.clearPasswordError() },
            label = stringResource(R.string.native_settings_password_new),
            placeholder = stringResource(R.string.native_settings_password_new_placeholder),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            focusRingColor = focusRing,
            focusRequester = newFocus,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
            visualTransformation = PasswordVisualTransformation(),
        )
        Spacer(Modifier.height(16.dp))
        GkTextField(
            value = confirm,
            onValueChange = { confirm = it; actions.clearPasswordError() },
            label = stringResource(R.string.native_settings_password_confirm),
            placeholder = stringResource(R.string.native_settings_password_confirm_placeholder),
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            focusRingColor = focusRing,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            visualTransformation = PasswordVisualTransformation(),
        )
        actions.passwordError?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = DangerRed, fontSize = 14.sp, lineHeight = 20.sp)
        }
        // space-y-4 plus the button row's own pt-2.
        Spacer(Modifier.height(24.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GkSecondaryButton(
                label = stringResource(R.string.native_dialog_cancel),
                borderColor = borderColor,
                textColor = titleColor,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.Normal,
                onClick = actions::closeChangePassword,
            )
            GkGradientButton(
                label = stringResource(
                    if (actions.passwordSaving) R.string.native_settings_password_saving else R.string.native_settings_change_password,
                ),
                themeId = themeId,
                enabled = !actions.passwordSaving,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                onClick = { actions.changePassword(current, new, confirm) },
            )
        }
    }
}
