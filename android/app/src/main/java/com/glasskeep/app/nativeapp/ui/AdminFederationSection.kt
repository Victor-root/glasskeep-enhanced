package com.glasskeep.app.nativeapp.ui

import android.content.ClipData
import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.NativeDebug
import com.glasskeep.app.nativeapp.data.bodyOrRefusal
import com.glasskeep.app.nativeapp.data.network.FederationAcceptRequest
import com.glasskeep.app.nativeapp.data.network.FederationAddressRequest
import com.glasskeep.app.nativeapp.data.network.FederationInviteRequest
import com.glasskeep.app.nativeapp.data.network.FederationLinkDto
import com.glasskeep.app.nativeapp.data.network.FederationRenameRequest
import com.glasskeep.app.nativeapp.data.network.FederationSelfNameRequest
import com.glasskeep.app.nativeapp.data.network.GlassKeepApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

/** Which of a card's two inline editors is open, and what it holds. */
internal data class FederationEdit(val kind: FederationEditKind, val draft: String)

internal enum class FederationEditKind { ADDRESS, RENAME }

/**
 * useFederation.js and FederationSection.jsx's own state: the links and
 * this server's name as last read, both forms, which link a request holds
 * and each card's inline editor, kept while the section is folded.
 * [localBaseUrl] is the web's window.location.origin, the address the app
 * reaches the server at, which the server hands its peers.
 */
internal class AdminFederationState(
    private val context: Context,
    private val api: GlassKeepApi,
    val localBaseUrl: String,
    private val toasts: ToastController,
    private val scope: CoroutineScope,
) {
    var links by mutableStateOf<List<FederationLinkDto>>(emptyList())
        private set
    var loading by mutableStateOf(false)
        private set
    var loaded by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    /** The link a request holds, or [AllLinks] while an invitation is out. */
    var busyId by mutableStateOf<String?>(null)
        private set
    var selfName by mutableStateOf("")
        private set
    var maxLabelLen by mutableStateOf(24)
        private set

    var nameDraft by mutableStateOf("")
    var savingName by mutableStateOf(false)
        private set
    var peerInput by mutableStateOf("")
    var submitting by mutableStateOf(false)
        private set
    val edits = mutableStateMapOf<String, FederationEdit>()

    private var loadInFlight = false

    val hasSelfName: Boolean
        get() = selfName.isNotBlank()

    fun isBusy(id: String): Boolean = busyId == id || busyId == AllLinks

    /** load(): the links and this server's name. A failure keeps what is
     *  shown and says why under the list; a [silent] read (polling, a live
     *  frame, after an action) leaves the loading line alone. */
    suspend fun load(silent: Boolean = false) {
        if (loadInFlight) return
        loadInFlight = true
        if (!silent) loading = true
        try {
            val data = api.getFederationLinks().bodyOrRefusal("GET /api/admin/federation/links")
            links = data.links
            applySelfName(data.selfName)
            maxLabelLen = data.maxLabelLen
            error = null
            loaded = true
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            NativeDebug.e("Federation links read failed", t)
            error = context.requestErrorText(t).ifEmpty { "error" }
        } finally {
            loadInFlight = false
            if (!silent) loading = false
        }
    }

    /** The name field follows the name the server reports, as the web's
     *  effect on selfName does: a read bringing the same name back leaves
     *  a draft being typed alone. */
    private fun applySelfName(name: String) {
        if (name == selfName) return
        selfName = name
        nameDraft = name
    }

    /** onSaveName(): the trimmed draft, and a toast either way. */
    fun saveName() {
        val name = nameDraft.trim()
        if (name.isEmpty() || savingName) return
        savingName = true
        scope.launch {
            try {
                api.setFederationSelfName(FederationSelfNameRequest(name))
                    .bodyOrRefusal("PUT /api/admin/federation/self-name")
                    .selfName?.let { applySelfName(it) }
                toasts.success(context.getString(R.string.native_fed_self_name_saved))
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Federation name save failed", t)
                toasts.error(context.getString(R.string.native_fed_err_generic))
            } finally {
                savingName = false
            }
        }
    }

    /** onInvite(): the address as typed; without a name of our own the
     *  invitation is refused before it leaves. */
    fun invite() {
        val peerBaseUrl = peerInput.trim()
        if (peerBaseUrl.isEmpty() || submitting) return
        if (!hasSelfName) {
            toasts.error(context.getString(R.string.native_fed_self_name_required))
            return
        }
        submitting = true
        scope.launch {
            try {
                run(null) {
                    inviteFederation(FederationInviteRequest(peerBaseUrl, localBaseUrl))
                        .bodyOrRefusal("POST /api/admin/federation/invite")
                }
                peerInput = ""
                toasts.success(context.getString(R.string.native_fed_invite_sent))
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Federation invite failed", t)
                toasts.error(context.federationErrorText(t, R.string.native_fed_err_generic))
            } finally {
                submitting = false
            }
        }
    }

    fun accept(id: String) = act(id) {
        acceptFederation(id, FederationAcceptRequest(localBaseUrl)).bodyOrRefusal("POST /api/admin/federation/links/$id/accept")
    }

    fun refuse(id: String) = act(id) {
        refuseFederation(id).bodyOrRefusal("POST /api/admin/federation/links/$id/refuse")
    }

    fun updateAddress(id: String, peerBaseUrl: String) = act(id) {
        updateFederationAddress(id, FederationAddressRequest(peerBaseUrl)).bodyOrRefusal("POST /api/admin/federation/links/$id/address")
    }

    fun rename(id: String, label: String) = act(id) {
        renameFederation(id, FederationRenameRequest(label)).bodyOrRefusal("PATCH /api/admin/federation/links/$id")
    }

    fun unpair(id: String) = act(id) {
        unpairFederation(id).bodyOrRefusal("DELETE /api/admin/federation/links/$id")
    }

    fun resend(id: String) = act(id) {
        resendFederation(id, FederationAcceptRequest(localBaseUrl)).bodyOrRefusal("POST /api/admin/federation/links/$id/resend")
    }

    fun recheck(id: String) = act(id) {
        recheckFederation(id).bodyOrRefusal("POST /api/admin/federation/links/$id/recheck")
    }

    /** A card's action. The web leaves its failure unhandled: nothing is
     *  said, the list simply stays as it was. */
    private fun act(id: String, request: suspend GlassKeepApi.() -> Any) {
        scope.launch {
            try {
                run(id, request)
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                NativeDebug.e("Federation action failed on $id", t)
            }
        }
    }

    /** run(): one request holding [id] (all of them for null), then a
     *  quiet read; a failure goes back to the caller. */
    private suspend fun <T> run(id: String?, request: suspend GlassKeepApi.() -> T): T {
        busyId = id ?: AllLinks
        try {
            val result = api.request()
            load(silent = true)
            return result
        } finally {
            busyId = null
        }
    }

    companion object {
        const val AllLinks = "__global__"
    }
}

/** federationErrorMessage(): the server's error code in words, else
 *  [fallback]. */
internal fun Context.federationErrorText(t: Throwable, @StringRes fallback: Int): String =
    getString(FederationErrorCodes[requestErrorText(t)] ?: fallback)

private val FederationErrorCodes = mapOf(
    "invalid_peer_url" to R.string.native_fed_err_invalid_peer_url,
    "invalid_local_url" to R.string.native_fed_err_invalid_local_url,
    "cannot_pair_with_self" to R.string.native_fed_err_self,
    "already_linked_or_pending" to R.string.native_fed_err_already,
    "self_name_required" to R.string.native_fed_self_name_required,
    "not_found" to R.string.native_fed_err_link_gone,
    "not_pending" to R.string.native_fed_err_not_pending,
)

/** A danger confirmation a card asks for before [onConfirm]. */
private data class FederationConfirm(
    @StringRes val title: Int,
    @StringRes val message: Int,
    @StringRes val confirmLabel: Int,
    val peer: String,
    val onConfirm: () -> Unit,
)

/**
 * "Cross-server collaboration" (FederationSection.jsx): what it is, the
 * HTTPS warning on a plain-http server, this server's name and address,
 * the invitation form, then the pairing requests and the linked servers.
 * Read when the section opens and every 12s while it stays open.
 */
@Composable
internal fun AdminFederationSection(
    federation: AdminFederationState,
    expanded: Boolean,
    onToggle: () -> Unit,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    LaunchedEffect(federation, expanded) {
        if (!expanded) return@LaunchedEffect
        federation.load()
        while (true) {
            delay(FederationPollMs)
            federation.load(silent = true)
        }
    }
    var confirm by remember { mutableStateOf<FederationConfirm?>(null) }
    val inviteFocus = remember { FocusRequester() }
    SettingsAccordionSection(
        title = stringResource(R.string.native_admin_federation_section),
        expanded = expanded,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        icon = { tint -> ServerIcon(size = 20.dp, tint = tint) },
        onToggle = onToggle,
    ) {
        Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(
                stringResource(R.string.native_fed_intro),
                color = if (dark) DialogBodyDark else DialogBodyLight,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            if (!federation.localBaseUrl.startsWith("https://")) FederationHttpsNotice(dark)
            FederationSelfNameCard(federation, themeId, dark, titleColor, borderColor) { inviteFocus.requestFocus() }
            FederationAddressBox(federation.localBaseUrl, themeId, dark, borderColor)
            FederationInviteCard(federation, inviteFocus, themeId, dark, titleColor, borderColor)
            val incoming = federation.links.filter { it.status == "incoming_pending" }
            val others = federation.links.filter { it.status != "incoming_pending" }
            val ask = { request: FederationConfirm -> confirm = request }
            if (incoming.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SettingsSubHeading(stringResource(R.string.native_fed_incoming_heading), dark)
                    incoming.forEach { link ->
                        FederationLinkCard(link, federation, federation.hasSelfName, ask, themeId, dark, titleColor, borderColor)
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (others.isNotEmpty()) SettingsSubHeading(stringResource(R.string.native_fed_linked_heading), dark)
                others.forEach { link ->
                    FederationLinkCard(link, federation, hasSelfName = true, ask, themeId, dark, titleColor, borderColor)
                }
                val subtle = if (dark) Color(0xFF99A1AF) else SettingsSubtleColor
                when {
                    federation.loaded && federation.links.isEmpty() -> Column(
                        Modifier.fillMaxWidth().padding(vertical = 24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        // The glyph sits atop its own 26px line, 8px over the text.
                        WorldIcon(Modifier.alpha(0.4f), size = 20.dp, tint = subtle)
                        Spacer(Modifier.height(14.dp))
                        Text(stringResource(R.string.native_fed_no_links), color = subtle, fontSize = 14.sp, lineHeight = 20.sp, textAlign = TextAlign.Center)
                    }
                    !federation.loaded && federation.loading -> Text(
                        stringResource(R.string.native_fed_loading),
                        color = subtle,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                    )
                }
                federation.error?.let {
                    Text(
                        it,
                        color = if (dark) Rose300 else Rose600,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    )
                }
            }
        }
    }
    confirm?.let { request ->
        GkConfirmDialog(
            title = stringResource(request.title),
            message = stringResource(request.message, request.peer),
            confirmLabel = stringResource(request.confirmLabel),
            cancelLabel = stringResource(R.string.native_dialog_cancel),
            themeId = themeId,
            dark = dark,
            borderColor = borderColor,
            titleColor = titleColor,
            subtextColor = if (dark) DialogBodyDark else DialogBodyLight,
            variant = GkConfirmVariant.DANGER,
            onConfirm = request.onConfirm,
            onDismiss = { confirm = null },
        )
    }
}

/** The amber box a plain-http server gets: federation refuses it. */
@Composable
private fun FederationHttpsNotice(dark: Boolean) {
    val textColor = if (dark) Amber200 else Amber800
    Row(
        Modifier
            .fillMaxWidth()
            .background(amberNoticeFill(dark), RoundedCornerShape(8.dp))
            .border(1.dp, amberNoticeBorder(dark), RoundedCornerShape(8.dp))
            .padding(13.dp),
    ) {
        AlertFilledOutlineIcon(Modifier.padding(top = 2.dp), size = 20.dp, tint = textColor)
        Spacer(Modifier.width(8.dp))
        Text(stringResource(R.string.native_fed_https_required), color = textColor, fontSize = 12.sp, lineHeight = 16.sp)
    }
}

/** This server's name: a neutral card once it has one, amber while it is
 *  missing, since pairing needs it. The keyboard's Next goes on to the
 *  invitation field, as the WebView's did from one input to the next. */
@Composable
private fun FederationSelfNameCard(
    federation: AdminFederationState,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onNext: () -> Unit,
) {
    val hasName = federation.hasSelfName
    FederationCard(
        borderColor = if (hasName) borderColor else amberNoticeBorder(dark),
        background = if (hasName) cardFill(dark) else amberNoticeFill(dark),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ServerUserIcon(size = 24.dp, tint = cardGlyphColor(dark), userTint = WorkspaceTheme.accent(themeId, dark))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.native_fed_self_name_title), color = titleColor, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(4.dp))
        FederationHint(stringResource(R.string.native_fed_self_name_hint), dark)
        Spacer(Modifier.height(12.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FederationInput(
                value = federation.nameDraft,
                onValueChange = { federation.nameDraft = it.take(federation.maxLabelLen) },
                placeholder = stringResource(R.string.native_fed_self_name_placeholder),
                themeId = themeId,
                dark = dark,
                borderColor = borderColor,
                imeAction = ImeAction.Next,
                onImeAction = onNext,
                modifier = Modifier.widthIn(min = 192.dp).weight(1f).align(Alignment.CenterVertically),
            )
            Text(
                "${federation.nameDraft.length}/${federation.maxLabelLen}",
                color = if (dark) SettingsSubtleColor else Color(0xFF99A1AF),
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                modifier = Modifier.align(Alignment.CenterVertically),
            )
            val draft = federation.nameDraft.trim()
            GkGradientButton(
                label = stringResource(R.string.native_admin_save),
                themeId = themeId,
                enabled = draft.isNotEmpty() && draft != federation.selfName.trim() && !federation.savingName,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                leading = { TablerCheckIcon(size = 20.dp, tint = Color.White) },
                onClick = { federation.saveName() },
            )
        }
    }
}

/** This server's address, ready to copy for the other admin. */
@Composable
private fun FederationAddressBox(localBaseUrl: String, themeId: String?, dark: Boolean, borderColor: Color) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copied by remember { mutableStateOf(false) }
    val labelColor = if (dark) DialogBodyDark else DialogBodyLight
    val subtle = if (dark) Color(0xFF99A1AF) else SettingsSubtleColor
    Column(
        Modifier
            .fillMaxWidth()
            .background(if (dark) Color.Black.copy(alpha = 0.3f) else Color(0xFFF9FAFB), RoundedCornerShape(8.dp))
            .border(1.dp, borderColor, RoundedCornerShape(8.dp))
            .padding(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            WorldWwwIcon(size = 20.dp, tint = labelColor, wwwTint = WorkspaceTheme.accent(themeId, dark))
            Spacer(Modifier.width(6.dp))
            Text(
                stringResource(R.string.native_fed_this_server).uppercase(),
                color = labelColor,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.3.sp,
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                localBaseUrl,
                color = if (dark) Color(0xFFF3F4F6) else Color(0xFF1E2939),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                fontFamily = FontFamily.Monospace,
                softWrap = false,
                modifier = Modifier
                    .weight(1f)
                    .background(if (dark) Color.Black.copy(alpha = 0.4f) else Color.White, RoundedCornerShape(6.dp))
                    .border(1.dp, borderColor, RoundedCornerShape(6.dp))
                    .padding(horizontal = 9.dp, vertical = 7.dp)
                    .horizontalScroll(rememberScrollState()),
            )
            Spacer(Modifier.width(8.dp))
            Row(
                Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) {
                        if (localBaseUrl.isNotEmpty()) {
                            scope.launch {
                                clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("server address", localBaseUrl)))
                                copied = true
                                delay(1_800)
                                copied = false
                            }
                        }
                    }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (copied) {
                    TablerCheckIcon(size = 20.dp, tint = if (dark) Color(0xFF00D492) else Color(0xFF009966))
                } else {
                    CopyIcon(size = 20.dp, tint = subtle)
                }
                Spacer(Modifier.width(4.dp))
                Text(
                    stringResource(if (copied) R.string.native_common_copied else R.string.native_common_copy),
                    color = subtle,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.native_fed_this_server_hint), color = subtle, fontSize = 11.sp, lineHeight = 16.5.sp)
    }
}

/** "Pair a server": the peer's address and the invitation, held back
 *  while this server has no name. */
@Composable
private fun FederationInviteCard(
    federation: AdminFederationState,
    focusRequester: FocusRequester,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    FederationCard(borderColor = borderColor, background = cardFill(dark)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ServerPlusIcon(size = 24.dp, tint = cardGlyphColor(dark), plusTint = WorkspaceTheme.accent(themeId, dark))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.native_fed_pair_title), color = titleColor, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(8.dp))
        FederationHint(stringResource(R.string.native_fed_pair_hint), dark)
        Spacer(Modifier.height(12.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FederationInput(
                value = federation.peerInput,
                onValueChange = { federation.peerInput = it },
                placeholder = "server.example.com",
                themeId = themeId,
                dark = dark,
                borderColor = borderColor,
                imeAction = ImeAction.Go,
                onImeAction = { federation.invite() },
                focusRequester = focusRequester,
                modifier = Modifier.widthIn(min = 192.dp).weight(1f).align(Alignment.CenterVertically),
            )
            GkGradientButton(
                label = stringResource(if (federation.submitting) R.string.native_fed_invite_sending else R.string.native_fed_invite_send),
                themeId = themeId,
                enabled = federation.peerInput.isNotBlank() && !federation.submitting && federation.hasSelfName,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                leading = { LinkIcon(size = 20.dp, tint = Color.White) },
                onClick = { federation.invite() },
            )
        }
        if (!federation.hasSelfName) {
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.native_fed_self_name_required),
                color = if (dark) Amber300 else Amber700,
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
            )
        }
    }
}

/**
 * FederationLinkCard.jsx: the peer's identity and a status pill, a line
 * explaining a blocked or pending link, what the last health check learnt
 * for an active one, then the actions its status allows, or one of the
 * two inline editors in their place.
 */
@Composable
private fun FederationLinkCard(
    link: FederationLinkDto,
    federation: AdminFederationState,
    hasSelfName: Boolean,
    ask: (FederationConfirm) -> Unit,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val meta = federationStateMeta(link.state)
    val isActive = link.status == "active"
    val isIncoming = link.status == "incoming_pending"
    val isOutgoing = link.status == "outgoing_pending" || link.status == "accepting"
    val isTerminal = link.status == "refused" || link.status == "cancelled" || link.status == "revoked"
    val blocked = isActive && !link.writable
    val host = hostOf(link.peerBaseUrl)
    val title = link.peerLabel?.takeIf { it.isNotEmpty() } ?: host
    val busy = federation.isBusy(link.id)
    val edit = federation.edits[link.id]
    val subtle = if (dark) Color(0xFF99A1AF) else SettingsSubtleColor
    FederationCard(borderColor = borderColor, background = cardFill(dark)) {
        Row(verticalAlignment = Alignment.Top) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(36.dp)
                        .background(WorkspaceTheme.sectionPillBg(themeId, dark), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    ServerCheckIcon(size = 22.dp, tint = WorkspaceTheme.sectionPillFg(themeId, dark))
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(title, color = titleColor, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(host, color = subtle, fontSize = 12.sp, lineHeight = 16.sp, fontFamily = FontFamily.Monospace, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.width(12.dp))
            FederationStatePill(meta, themeId, dark)
        }
        if (blocked || isOutgoing || isIncoming || link.state == "unknown") {
            Spacer(Modifier.height(12.dp))
            Text(
                when {
                    link.state == "incompatible" -> incompatibleText(link, title)
                    isIncoming && !hasSelfName -> stringResource(R.string.native_fed_incoming_needs_self_name)
                    else -> stringResource(meta.description)
                },
                color = when {
                    blocked && link.state == "offline" -> if (dark) Rose300 else Rose600
                    blocked || (isIncoming && !hasSelfName) -> if (dark) Amber300 else Amber700
                    else -> if (dark) DialogBodyDark else DialogBodyLight
                },
                fontSize = 12.sp,
                lineHeight = 19.5.sp,
            )
        }
        if (isActive) {
            Spacer(Modifier.height(16.dp))
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FederationStat(stringResource(R.string.native_fed_peer_version), dark, icon = { tint -> TablerTagIcon(size = 20.dp, tint = tint) }) {
                    val version = link.peerAppVersion?.let { "v$it" } ?: "-"
                    val protocol = stringResource(R.string.native_fed_protocol)
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(version) }
                            link.peerProtocol?.let {
                                withStyle(SpanStyle(color = if (dark) SettingsSubtleColor else Color(0xFF99A1AF))) { append(" · $protocol $it") }
                            }
                        },
                        color = statValueColor(dark),
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                FederationStat(stringResource(R.string.native_fed_last_contact), dark, icon = { tint -> ClockIcon(size = 20.dp, tint = tint) }) {
                    Text(
                        link.lastSeenAt?.let { localeDateTimeString(it) } ?: stringResource(R.string.native_fed_never),
                        color = statValueColor(dark),
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                val lastError = link.lastError
                if (lastError != null && link.state != "online") {
                    FederationStat(stringResource(R.string.native_fed_detail), dark, icon = { tint -> TablerAlertTriangleIcon(size = 20.dp, tint = tint) }) {
                        Text(
                            federationErrorLabel(lastError),
                            color = if (dark) Color(0xFFE5E7EB) else Color(0xFF364153),
                            fontSize = 12.sp,
                            lineHeight = 19.5.sp,
                        )
                    }
                }
            }
        }
        if (edit != null) {
            Spacer(Modifier.height(8.dp))
            FederationInlineEdit(
                draft = edit.draft,
                onDraftChange = { federation.edits[link.id] = edit.copy(draft = it) },
                placeholder = if (edit.kind == FederationEditKind.ADDRESS) "server.example.com" else stringResource(R.string.native_fed_label_placeholder),
                busy = busy,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onSave = {
                    val value = edit.draft.trim()
                    if (edit.kind == FederationEditKind.ADDRESS) {
                        if (value.isNotEmpty()) federation.updateAddress(link.id, value)
                    } else {
                        federation.rename(link.id, value)
                    }
                    federation.edits.remove(link.id)
                },
                onCancel = { federation.edits.remove(link.id) },
            )
        } else {
            Spacer(Modifier.height(16.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (isIncoming) {
                    FederationActionButton(stringResource(R.string.native_fed_accept), FederationActionStyle.PRIMARY, dark, borderColor, !busy && hasSelfName, { tint -> TablerCheckIcon(size = 20.dp, tint = tint) }) {
                        federation.accept(link.id)
                    }
                    FederationActionButton(stringResource(R.string.native_fed_refuse), FederationActionStyle.DANGER, dark, borderColor, !busy, { tint -> CloseIcon(size = 20.dp, tint = tint, strokeWidth = 1.75f) }) {
                        ask(FederationConfirm(R.string.native_fed_refuse_title, R.string.native_fed_refuse_confirm, R.string.native_fed_refuse, title) { federation.refuse(link.id) })
                    }
                }
                if (isOutgoing) {
                    FederationActionButton(stringResource(R.string.native_fed_cancel_invite), FederationActionStyle.DANGER, dark, borderColor, !busy, { tint -> CloseIcon(size = 20.dp, tint = tint, strokeWidth = 1.75f) }) {
                        ask(FederationConfirm(R.string.native_fed_cancel_invite_title, R.string.native_fed_cancel_invite_confirm, R.string.native_fed_cancel_invite_action, title) { federation.refuse(link.id) })
                    }
                }
                if (isActive) {
                    FederationActionButton(stringResource(R.string.native_fed_recheck), FederationActionStyle.NEUTRAL, dark, borderColor, !busy, { tint -> RefreshIcon(size = 20.dp, tint = tint) }) {
                        federation.recheck(link.id)
                    }
                    FederationActionButton(stringResource(R.string.native_fed_change_address), FederationActionStyle.NEUTRAL, dark, borderColor, !busy, { tint -> ExternalLinkIcon(size = 20.dp, tint = tint) }) {
                        federation.edits[link.id] = FederationEdit(FederationEditKind.ADDRESS, host)
                    }
                    FederationActionButton(stringResource(R.string.native_fed_rename), FederationActionStyle.NEUTRAL, dark, borderColor, !busy, { tint -> PencilIcon(size = 20.dp, tint = tint, strokeWidth = 1.75f) }) {
                        federation.edits[link.id] = FederationEdit(FederationEditKind.RENAME, link.peerLabel.orEmpty())
                    }
                    FederationActionButton(stringResource(R.string.native_fed_unpair), FederationActionStyle.DANGER, dark, borderColor, !busy, { tint -> TablerTrashIcon(size = 20.dp, tint = tint) }) {
                        ask(FederationConfirm(R.string.native_fed_unpair_title, R.string.native_fed_unpair_confirm, R.string.native_fed_unpair, title) { federation.unpair(link.id) })
                    }
                }
                if (isTerminal) {
                    // Only whoever sent the invitation has one to send again.
                    if (link.role == "initiator") {
                        FederationActionButton(stringResource(R.string.native_fed_resend_invite), FederationActionStyle.NEUTRAL, dark, borderColor, !busy, { tint -> LinkIcon(size = 20.dp, tint = tint) }) {
                            federation.resend(link.id)
                        }
                    }
                    FederationActionButton(stringResource(R.string.native_fed_remove), FederationActionStyle.DANGER, dark, borderColor, !busy, { tint -> TablerTrashIcon(size = 20.dp, tint = tint) }) {
                        federation.unpair(link.id)
                    }
                }
            }
        }
    }
}

/** A card's small inline editor: its field focused on arrival, then
 *  Save and Cancel. */
@Composable
private fun FederationInlineEdit(
    draft: String,
    onDraftChange: (String) -> Unit,
    placeholder: String,
    busy: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        GkTextField(
            value = draft,
            onValueChange = onDraftChange,
            label = null,
            placeholder = placeholder,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            modifier = Modifier.widthIn(min = 192.dp).weight(1f).align(Alignment.CenterVertically),
            focusRingColor = FieldFocusRing,
            focusRequester = focus,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { onSave() }),
            background = if (dark) Color.Black.copy(alpha = 0.3f) else Color.White,
            verticalPadding = 7.dp,
            placeholderColor = titleColor.copy(alpha = 0.5f),
        )
        FederationActionButton(stringResource(R.string.native_admin_save), FederationActionStyle.PRIMARY, dark, borderColor, !busy, { tint -> TablerCheckIcon(size = 20.dp, tint = tint) }, onSave)
        FederationActionButton(stringResource(R.string.native_dialog_cancel), FederationActionStyle.NEUTRAL, dark, borderColor, !busy, { tint -> CloseIcon(size = 20.dp, tint = tint, strokeWidth = 1.75f) }, onCancel)
    }
}

/** The name and address inputs: `text-sm` on white (black 30% in dark),
 *  gray-900 text, the indigo half-strength focus ring. */
@Composable
private fun FederationInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    themeId: String?,
    dark: Boolean,
    borderColor: Color,
    imeAction: ImeAction,
    onImeAction: () -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
) {
    GkTextField(
        value = value,
        onValueChange = onValueChange,
        label = null,
        placeholder = placeholder,
        themeId = themeId,
        dark = dark,
        titleColor = if (dark) Color(0xFFF3F4F6) else Color(0xFF101828),
        borderColor = borderColor,
        modifier = modifier,
        focusRingColor = FieldFocusRing,
        focusRequester = focusRequester,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, imeAction = imeAction),
        keyboardActions = KeyboardActions(onNext = { onImeAction() }, onGo = { onImeAction() }),
        background = if (dark) Color.Black.copy(alpha = 0.3f) else Color.White,
    )
}

/** `rounded-xl border p-4`, the section's cards. */
@Composable
private fun FederationCard(
    borderColor: Color,
    background: Color,
    content: @Composable () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(background, RoundedCornerShape(12.dp))
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .padding(17.dp),
    ) { content() }
}

@Composable
private fun FederationHint(text: String, dark: Boolean) {
    Text(text, color = if (dark) DialogBodyDark else DialogBodyLight, fontSize = 12.sp, lineHeight = 16.sp)
}

/** One health fact: a small uppercase caption behind its faded glyph,
 *  the value under it. */
@Composable
private fun FederationStat(label: String, dark: Boolean, icon: @Composable (Color) -> Unit, value: @Composable () -> Unit) {
    val captionColor = if (dark) Color(0xFF99A1AF) else SettingsSubtleColor
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.alpha(0.7f)) { icon(captionColor) }
            Spacer(Modifier.width(6.dp))
            Text(
                label.uppercase(),
                color = captionColor,
                fontSize = 11.sp,
                lineHeight = 16.5.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.275.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(2.dp))
        value()
    }
}

/** federationStatus.js: how a link's state reads, its glyph and tone. */
private enum class FederationTone { OK, WARN, DOWN, PENDING, NEUTRAL }

private enum class FederationGlyph { CIRCLE_CHECK, ALERT, SHIELD_LOCK, CLOCK, USER_PLUS, X, WORLD }

private data class FederationStateMeta(
    val tone: FederationTone,
    val glyph: FederationGlyph,
    @StringRes val label: Int,
    @StringRes val description: Int,
)

private fun federationStateMeta(state: String): FederationStateMeta = when (state) {
    "online" -> FederationStateMeta(FederationTone.OK, FederationGlyph.CIRCLE_CHECK, R.string.native_fed_state_online, R.string.native_fed_state_online_desc)
    "offline" -> FederationStateMeta(FederationTone.DOWN, FederationGlyph.ALERT, R.string.native_fed_state_offline, R.string.native_fed_state_offline_desc)
    "incompatible" -> FederationStateMeta(FederationTone.WARN, FederationGlyph.ALERT, R.string.native_fed_state_incompatible, R.string.native_fed_state_incompatible_desc)
    "locked" -> FederationStateMeta(FederationTone.WARN, FederationGlyph.SHIELD_LOCK, R.string.native_fed_state_locked, R.string.native_fed_state_locked_desc)
    "unknown" -> FederationStateMeta(FederationTone.PENDING, FederationGlyph.CLOCK, R.string.native_fed_state_checking, R.string.native_fed_state_checking_desc)
    "outgoing_pending" -> FederationStateMeta(FederationTone.PENDING, FederationGlyph.CLOCK, R.string.native_fed_state_outgoing, R.string.native_fed_state_outgoing_desc)
    "incoming_pending" -> FederationStateMeta(FederationTone.PENDING, FederationGlyph.USER_PLUS, R.string.native_fed_state_incoming, R.string.native_fed_state_incoming_desc)
    "accepting" -> FederationStateMeta(FederationTone.PENDING, FederationGlyph.CLOCK, R.string.native_fed_state_accepting, R.string.native_fed_state_accepting_desc)
    "refused" -> FederationStateMeta(FederationTone.NEUTRAL, FederationGlyph.X, R.string.native_fed_state_refused, R.string.native_fed_state_refused_desc)
    "cancelled" -> FederationStateMeta(FederationTone.NEUTRAL, FederationGlyph.X, R.string.native_fed_state_cancelled, R.string.native_fed_state_cancelled_desc)
    "revoked" -> FederationStateMeta(FederationTone.NEUTRAL, FederationGlyph.X, R.string.native_fed_state_revoked, R.string.native_fed_state_revoked_desc)
    else -> FederationStateMeta(FederationTone.NEUTRAL, FederationGlyph.WORLD, R.string.native_fed_state_checking, R.string.native_fed_state_checking_desc)
}

/** The status pill, fully rounded: semantic green, amber and rose tones,
 *  the theme's soft accent for anything pending, grey once it ended. */
@Composable
private fun FederationStatePill(meta: FederationStateMeta, themeId: String?, dark: Boolean) {
    val (fill, edge, text) = when (meta.tone) {
        FederationTone.OK -> Triple(Emerald500.copy(alpha = 0.12f), Emerald500.copy(alpha = 0.25f), if (dark) Color(0xFF5EE9B5) else Color(0xFF007A55))
        FederationTone.WARN -> Triple(Amber500.copy(alpha = 0.12f), Amber500.copy(alpha = 0.25f), if (dark) Amber300 else Amber700)
        FederationTone.DOWN -> Triple(Rose500.copy(alpha = 0.12f), Rose500.copy(alpha = 0.25f), if (dark) Rose300 else Color(0xFFC70036))
        FederationTone.PENDING -> Triple(
            WorkspaceTheme.accentSoftBg(themeId, dark),
            WorkspaceTheme.accentSoftBorder(themeId, dark),
            WorkspaceTheme.accent(themeId, dark),
        )
        FederationTone.NEUTRAL -> Triple(Gray500.copy(alpha = 0.1f), Gray500.copy(alpha = 0.2f), if (dark) DialogBodyDark else DialogBodyLight)
    }
    val shape = RoundedCornerShape(50)
    Row(
        Modifier
            .background(fill, shape)
            .border(1.dp, edge, shape)
            .padding(horizontal = 9.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (meta.glyph) {
            FederationGlyph.CIRCLE_CHECK -> CircleCheckIcon(size = 20.dp, tint = text)
            FederationGlyph.ALERT -> TablerAlertTriangleIcon(size = 20.dp, tint = text)
            FederationGlyph.SHIELD_LOCK -> ShieldLockIcon(size = 20.dp, tint = text)
            FederationGlyph.CLOCK -> ClockIcon(size = 20.dp, tint = text)
            FederationGlyph.USER_PLUS -> UserPlusIcon(size = 20.dp, tint = text)
            FederationGlyph.X -> CloseIcon(size = 20.dp, tint = text, strokeWidth = 1.75f)
            FederationGlyph.WORLD -> WorldIcon(size = 20.dp, tint = text)
        }
        Spacer(Modifier.width(4.dp))
        Text(stringResource(meta.label), color = text, fontSize = 11.sp, lineHeight = 16.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

private enum class FederationActionStyle { NEUTRAL, PRIMARY, DANGER }

/** FederationLinkCard.jsx's ActionButton: `text-xs` with a 20px glyph,
 *  white and bordered, emerald for the one to press, rose for danger. */
@Composable
private fun FederationActionButton(
    label: String,
    style: FederationActionStyle,
    dark: Boolean,
    borderColor: Color,
    enabled: Boolean,
    icon: @Composable (Color) -> Unit,
    onClick: () -> Unit,
) {
    val plain = if (dark) Color.White.copy(alpha = 0.1f) else Color.White
    val (fill, edge, text) = when (style) {
        FederationActionStyle.NEUTRAL -> Triple(plain, borderColor, if (dark) Color(0xFFE5E7EB) else Color(0xFF364153))
        FederationActionStyle.PRIMARY -> Triple(Emerald600, Emerald600, Color.White)
        FederationActionStyle.DANGER -> Triple(
            plain,
            if (dark) Rose500.copy(alpha = 0.3f) else Rose300.copy(alpha = 0.6f),
            if (dark) Rose300 else Rose600,
        )
    }
    val shape = RoundedCornerShape(8.dp)
    Row(
        Modifier
            .alpha(if (enabled) 1f else 0.5f)
            .clip(shape)
            .background(fill)
            .border(1.dp, edge, shape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 11.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon(text)
        Spacer(Modifier.width(6.dp))
        Text(label, color = text, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium)
    }
}

/** incompatibleDesc(): which side is behind, from the two protocols. */
@Composable
private fun incompatibleText(link: FederationLinkDto, peer: String): String {
    val local = link.localProtocol
    val remote = link.peerProtocol
    return when {
        remote == null -> stringResource(R.string.native_fed_state_incompatible_peer, peer)
        local != null && remote > local -> stringResource(R.string.native_fed_state_incompatible_self, peer)
        local != null && remote < local -> stringResource(R.string.native_fed_state_incompatible_peer, peer)
        else -> stringResource(R.string.native_fed_state_incompatible_desc)
    }
}

/** federationErrorLabel(): the server's last error slug in words; an
 *  unknown one shows as recorded. */
@Composable
private fun federationErrorLabel(raw: String): String {
    val value = raw.trim()
    FederationErrorSlugs[value]?.let { return stringResource(it) }
    ClockSkewPattern.matchEntire(value)?.let { match ->
        return stringResource(R.string.native_fed_err_clock_skew, skewText(match.groupValues[1].toLong()))
    }
    if (value == "clock-skew") return stringResource(R.string.native_fed_err_clock_skew_unknown)
    if (value.isNotEmpty() && value.all { it.isDigit() }) return stringResource(R.string.native_fed_err_tls)
    HttpStatusPattern.matchEntire(value)?.let { return stringResource(R.string.native_fed_err_http, it.groupValues[1]) }
    return value
}

private val FederationErrorSlugs = mapOf(
    "tls-certificate-invalid" to R.string.native_fed_err_tls,
    "dns-not-found" to R.string.native_fed_err_dns,
    "connection-refused" to R.string.native_fed_err_conn,
    "protocol-incompatible" to R.string.native_fed_err_protocol,
    "unreachable" to R.string.native_fed_err_unreachable,
)
private val ClockSkewPattern = Regex("^clock-skew:([+-]?\\d+)$")
private val HttpStatusPattern = Regex("^http\\s+(.+)$", RegexOption.IGNORE_CASE)

/** formatSkew(): a clock gap as a person reads it, the sign dropped. */
private fun skewText(seconds: Long): String {
    val s = abs(seconds)
    if (s < 90) return "$s s"
    val m = (s / 60.0).roundToInt()
    if (m < 90) return "$m min"
    return "${m / 60} h ${(m % 60).toString().padStart(2, '0')}"
}

/** hostOf(): the address without its scheme. */
internal fun hostOf(url: String): String = url.replace(SchemePrefix, "")

private val SchemePrefix = Regex("^https?://", RegexOption.IGNORE_CASE)

private fun cardFill(dark: Boolean): Color = if (dark) Color.White.copy(alpha = 0.05f) else Color.White.copy(alpha = 0.6f)

private fun cardGlyphColor(dark: Boolean): Color = if (dark) DialogBodyDark else DialogBodyLight

private fun statValueColor(dark: Boolean): Color = if (dark) Color(0xFFF3F4F6) else Color(0xFF1E2939)

private fun amberNoticeFill(dark: Boolean): Color = if (dark) Amber500.copy(alpha = 0.1f) else Color(0xFFFFFBEB)

private fun amberNoticeBorder(dark: Boolean): Color = if (dark) Amber500.copy(alpha = 0.3f) else Amber300.copy(alpha = 0.6f)

/** `focus-visible:ring-indigo-500/50`. */
private val FieldFocusRing = Color(0xFF615FFF).copy(alpha = 0.5f)

private const val FederationPollMs = 12_000L

private val Amber200 = Color(0xFFFEE685)
private val Amber300 = Color(0xFFFFD230)
private val Amber500 = Color(0xFFFE9A00)
private val Amber700 = Color(0xFFBB4D00)
private val Amber800 = Color(0xFF973C00)
private val Emerald500 = Color(0xFF00BC7D)
private val Emerald600 = Color(0xFF009966)
private val Rose300 = Color(0xFFFFA1AD)
private val Rose500 = Color(0xFFFF2056)
private val Rose600 = Color(0xFFEC003F)
private val Gray500 = Color(0xFF6A7282)
