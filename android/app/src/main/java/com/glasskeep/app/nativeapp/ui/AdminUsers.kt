package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.network.AdminUserDto
import com.glasskeep.app.nativeapp.data.network.CreateAdminUserRequest
import com.glasskeep.app.nativeapp.data.network.PendingUserDto
import com.glasskeep.app.nativeapp.data.network.UpdateAdminUserRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.min
import kotlin.math.pow

/**
 * "Pending registrations" (AdminPanel.jsx:541-618), shown only while some
 * are waiting: an amber count in the title, a line of explanation, then an
 * amber card per request with its reject (confirmed first) and approve
 * buttons.
 */
@Composable
internal fun AdminPendingSection(
    state: AdminPanelState,
    expanded: Boolean,
    onToggle: () -> Unit,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val scope = rememberCoroutineScope()
    var rejecting by remember { mutableStateOf<PendingUserDto?>(null) }
    SettingsAccordionSection(
        title = stringResource(R.string.native_admin_pending_registrations),
        expanded = expanded,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        icon = { tint -> UserClockIcon(size = 20.dp, tint = tint) },
        onToggle = onToggle,
        titleTrailing = {
            CountPill(
                count = state.pending.size,
                background = if (dark) Color(0xFF7B3306) else Color(0xFFFEF3C6),
                textColor = if (dark) Color(0xFFFEE685) else Color(0xFF973C00),
            )
        },
    ) {
        Text(
            stringResource(R.string.native_admin_pending_desc),
            color = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282),
            fontSize = 12.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(start = 12.dp),
        )
        state.pending.forEach { request ->
            PendingRow(
                request = request,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                onReject = { rejecting = request },
                onApprove = {
                    scope.launch {
                        val failure = state.approve(request.id)
                        if (failure == null) {
                            toasts.success(context.getString(R.string.native_admin_registration_approved), "user-check")
                        } else {
                            toasts.error(failure)
                        }
                    }
                },
            )
        }
    }
    rejecting?.let { request ->
        GkConfirmDialog(
            title = stringResource(R.string.native_admin_reject_registration_title),
            message = stringResource(R.string.native_admin_reject_registration_confirm, request.name),
            confirmLabel = stringResource(R.string.native_admin_reject),
            cancelLabel = stringResource(R.string.native_dialog_cancel),
            themeId = themeId,
            dark = dark,
            borderColor = borderColor,
            titleColor = titleColor,
            subtextColor = if (dark) DialogBodyDark else DialogBodyLight,
            variant = GkConfirmVariant.DANGER,
            onConfirm = {
                scope.launch {
                    val failure = state.reject(request.id)
                    if (failure == null) {
                        toasts.show(context.getString(R.string.native_admin_registration_rejected), icon = "user-x")
                    } else {
                        toasts.error(failure)
                    }
                }
            },
            onDismiss = { rejecting = null },
        )
    }
}

/** One request: the user glyph, name, address and when it was asked, then
 *  the red X and the green check. */
@Composable
private fun PendingRow(
    request: PendingUserDto,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    onReject: () -> Unit,
    onApprove: () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (dark) Color(0xFF7B3306).copy(alpha = 0.2f) else Color(0xFFFFFBEB).copy(alpha = 0.5f), shape)
            .border(1.dp, if (dark) Color(0xFFBB4D00) else Color(0xFFFFD230), shape)
            .padding(13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingsRowIcon(themeId, dark) { tint -> UserCircleIcon(size = 20.dp, tint = tint) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                request.name,
                color = titleColor,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                request.email,
                color = SettingsSubtleColor,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                stringResource(R.string.native_admin_requested_on, localeDateTimeString(request.createdAt.orEmpty())),
                color = Color(0xFF99A1AF),
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
        }
        Spacer(Modifier.width(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AdminIconButton(
                label = stringResource(R.string.native_admin_reject),
                background = if (dark) Color(0xFF82181A).copy(alpha = 0.4f) else Color(0xFFFFE2E2),
                onClick = onReject,
            ) { CloseIcon(size = 20.dp, tint = if (dark) Color(0xFFFFA2A2) else Color(0xFFC10007), strokeWidth = 1.75f) }
            AdminIconButton(
                label = stringResource(R.string.native_admin_approve),
                background = if (dark) Color(0xFF004F3B).copy(alpha = 0.4f) else Color(0xFFD0FAE5),
                onClick = onApprove,
            ) { TablerCheckIcon(size = 20.dp, tint = if (dark) Color(0xFF5EE9B5) else Color(0xFF007A55)) }
        }
    }
}

/**
 * "All Users" (AdminPanel.jsx:686-791): the count in the accent pill, then
 * a card per account with its avatar, the ADMIN badge, edit and (for
 * anyone but the admin looking) delete, and its notes, storage and
 * sign-up date.
 */
@Composable
internal fun AdminUsersSection(
    state: AdminPanelState,
    currentUserId: Int?,
    expanded: Boolean,
    onToggle: () -> Unit,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val scope = rememberCoroutineScope()
    var editing by remember { mutableStateOf<AdminUserDto?>(null) }
    var deleting by remember { mutableStateOf<AdminUserDto?>(null) }
    SettingsAccordionSection(
        title = stringResource(R.string.native_admin_all_users),
        expanded = expanded,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        icon = { tint -> UsersIcon(size = 20.dp, tint = tint) },
        onToggle = onToggle,
        titleTrailing = {
            CountPill(
                count = state.users.size,
                background = WorkspaceTheme.accentSoftBg(themeId, dark),
                textColor = WorkspaceTheme.accent(themeId, dark),
            )
        },
    ) {
        state.users.forEach { user ->
            UserCard(
                user = user,
                deletable = user.id != currentUserId,
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                onEdit = { editing = user },
                onDelete = { deleting = user },
            )
        }
    }
    editing?.let { user ->
        EditUserDialog(
            user = user,
            state = state,
            themeId = themeId,
            dark = dark,
            titleColor = titleColor,
            borderColor = borderColor,
            onDismiss = { editing = null },
        )
    }
    deleting?.let { user ->
        GkConfirmDialog(
            title = stringResource(R.string.native_admin_delete_user),
            // The address tells two same-named accounts apart.
            message = stringResource(R.string.native_admin_delete_user_confirm, user.name, user.email),
            confirmLabel = stringResource(R.string.native_admin_delete),
            cancelLabel = stringResource(R.string.native_dialog_cancel),
            themeId = themeId,
            dark = dark,
            borderColor = borderColor,
            titleColor = titleColor,
            subtextColor = if (dark) DialogBodyDark else DialogBodyLight,
            variant = GkConfirmVariant.DANGER,
            onConfirm = {
                scope.launch {
                    state.deleteUser(user.id)?.let { deleted ->
                        toasts.success(
                            context.getString(R.string.native_admin_user_deleted, deleted.name.ifEmpty { deleted.email }),
                            "user-x",
                        )
                    }
                }
            },
            onDismiss = { deleting = null },
        )
    }
}

@Composable
private fun UserCard(
    user: AdminUserDto,
    deletable: Boolean,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    Column(
        modifier = Modifier.fillMaxWidth().border(1.dp, borderColor, shape).padding(13.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // AdminPanel leaves UserAvatar's `dark` out: the light disc.
            AvatarCircle(avatarUrl = user.avatarUrl, name = user.name, size = 36.dp, dark = false, fontSize = 14.sp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        user.name,
                        color = titleColor,
                        fontSize = 16.sp,
                        lineHeight = 24.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (user.isAdmin) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            stringResource(R.string.native_admin_badge).uppercase(),
                            color = if (dark) Color(0xFFFFC9C9) else Color(0xFFC10007),
                            fontSize = 10.sp,
                            lineHeight = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 0.25.sp,
                            modifier = Modifier
                                .background(
                                    if (dark) Color(0xFF82181A).copy(alpha = 0.5f) else Color(0xFFFFE2E2),
                                    RoundedCornerShape(4.dp),
                                )
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                        )
                    }
                }
                Text(
                    user.email,
                    color = SettingsSubtleColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AdminIconButton(
                    label = stringResource(R.string.native_admin_edit),
                    background = WorkspaceTheme.iconPillBg(themeId, dark),
                    onClick = onEdit,
                ) { PencilIcon(size = 20.dp, tint = WorkspaceTheme.iconPillFg(themeId, dark), strokeWidth = 1.75f) }
                if (deletable) {
                    AdminIconButton(
                        label = stringResource(R.string.native_admin_delete),
                        background = if (dark) Color(0xFF82181A).copy(alpha = 0.4f) else Color(0xFFFFE2E2),
                        onClick = onDelete,
                    ) { TablerTrashIcon(size = 20.dp, tint = if (dark) Color(0xFFFFA2A2) else Color(0xFFC10007)) }
                }
            }
        }
        val statColor = if (dark) Color(0xFF99A1AF) else Color(0xFF6A7282)
        FlowRow(
            modifier = Modifier.padding(start = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            listOf(
                stringResource(R.string.native_admin_stat_notes, user.notes),
                stringResource(R.string.native_admin_stat_storage, formatBytes(user.storageBytes)),
                stringResource(R.string.native_admin_stat_joined, localeDateString(user.createdAt.orEmpty())),
            ).forEach { stat ->
                Text(stat, color = statColor, fontSize = 12.sp, lineHeight = 16.sp)
            }
        }
    }
}

/** The panel's 36px tinted square buttons (edit, delete, reject, approve),
 *  each with its tooltip. */
@Composable
private fun AdminIconButton(label: String, background: Color, onClick: () -> Unit, icon: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .semantics { contentDescription = label }
            .gkTooltip(label)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

/** A section title's count: 12px semibold in a fully rounded pill. */
@Composable
private fun CountPill(count: Int, background: Color, textColor: Color) {
    Text(
        count.toString(),
        color = textColor,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.background(background, CircleShape).padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/**
 * The edit modal (AdminPanel.jsx:922-1014): a borderless card on a 50%
 * scrim that a tap outside leaves open, its pencil and title, the name,
 * address and reset-password fields, the admin switch, then Cancel and
 * "Update User". The browser's `required` keeps an emptied name or address
 * from submitting at all.
 */
@Composable
private fun EditUserDialog(
    user: AdminUserDto,
    state: AdminPanelState,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    var name by rememberSaveable(user.id) { mutableStateOf(user.name) }
    var email by rememberSaveable(user.id) { mutableStateOf(user.email) }
    var password by rememberSaveable(user.id) { mutableStateOf("") }
    var admin by rememberSaveable(user.id) { mutableStateOf(user.isAdmin) }
    var updating by remember { mutableStateOf(false) }
    fun submit() {
        if (updating || name.isEmpty() || email.isEmpty()) return
        updating = true
        scope.launch {
            try {
                state.updateUser(user.id, UpdateAdminUserRequest(name, email, password.ifEmpty { null }, admin))
                toasts.success(context.getString(R.string.native_admin_user_updated), "user-check")
                onDismiss()
            } catch (t: CancellationException) {
                throw t
            } catch (t: Throwable) {
                toasts.error(state.failureText(t, R.string.native_admin_failed_update_user))
            } finally {
                updating = false
            }
        }
    }
    GkDialog(
        onDismissRequest = onDismiss,
        dark = dark,
        borderColor = Color.Transparent,
        dismissOnClickOutside = false,
        background = if (dark) Color(0xFF282828).copy(alpha = 0.98f) else Color.White.copy(alpha = 0.98f),
        scrimAlpha = 0.5f,
        screenPadding = 16.dp,
        widthFraction = 1f,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SettingsRowIcon(themeId, dark) { tint -> PencilIcon(size = 20.dp, tint = tint, strokeWidth = 1.75f) }
            Spacer(Modifier.width(12.dp))
            Text(
                stringResource(R.string.native_admin_edit_user_title),
                color = titleColor,
                fontSize = 18.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(16.dp))
        val next = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            GkTextField(
                value = name,
                onValueChange = { name = it },
                label = stringResource(R.string.native_register_name),
                placeholder = "",
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = next,
            )
            GkTextField(
                value = email,
                onValueChange = { email = it },
                label = stringResource(R.string.native_login_username),
                placeholder = "",
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, imeAction = ImeAction.Next),
                keyboardActions = next,
            )
            Column {
                GkTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = stringResource(R.string.native_admin_reset_password_label),
                    placeholder = stringResource(R.string.native_admin_reset_password_placeholder),
                    themeId = themeId,
                    dark = dark,
                    titleColor = titleColor,
                    borderColor = borderColor,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { submit() }),
                    visualTransformation = PasswordVisualTransformation(),
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    stringResource(R.string.native_admin_reset_password_hint),
                    color = if (dark) Color(0xFF6A7282) else Color(0xFF99A1AF),
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                )
            }
            MakeAdminRow(admin, { admin = it }, themeId, dark, titleColor)
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 32.dp),
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
                onClick = onDismiss,
            )
            GkGradientButton(
                label = stringResource(if (updating) R.string.native_admin_updating else R.string.native_admin_update_user),
                themeId = themeId,
                enabled = !updating,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                onClick = { submit() },
            )
        }
    }
}

/** "Make admin" and its switch, the row the create form and the edit
 *  modal share. */
@Composable
private fun MakeAdminRow(checked: Boolean, onChange: (Boolean) -> Unit, themeId: String?, dark: Boolean, titleColor: Color) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            stringResource(R.string.native_admin_make_admin),
            color = titleColor,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(12.dp))
        GkSwitch(checked = checked, themeId = themeId, dark = dark, onCheckedChange = onChange)
    }
}

/**
 * "Create New User" (AdminPanel.jsx:793-862): three placeholder-only
 * fields, the note that the password is temporary, the admin switch and a
 * 90%-wide button, which tells about missing fields rather than waiting
 * for them. The form is kept while the panel stays open.
 */
@Composable
internal fun AdminCreateUserSection(
    state: AdminPanelState,
    expanded: Boolean,
    onToggle: () -> Unit,
    themeId: String?,
    dark: Boolean,
    titleColor: Color,
    borderColor: Color,
) {
    val context = LocalContext.current
    val toasts = LocalGkToasts.current
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var admin by rememberSaveable { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }
    fun submit() {
        if (creating) return
        if (name.isEmpty() || email.isEmpty() || password.isEmpty()) {
            toasts.error(context.getString(R.string.native_admin_fill_required))
            return
        }
        creating = true
        scope.launch {
            try {
                if (state.createUser(CreateAdminUserRequest(name, email, password, admin))) {
                    name = ""
                    email = ""
                    password = ""
                    admin = false
                    toasts.success(context.getString(R.string.native_admin_user_created), "user-plus")
                }
            } finally {
                creating = false
            }
        }
    }
    SettingsAccordionSection(
        title = stringResource(R.string.native_admin_create_new_user),
        expanded = expanded,
        themeId = themeId,
        dark = dark,
        titleColor = titleColor,
        icon = { tint -> UserPlusIcon(size = 20.dp, tint = tint) },
        onToggle = onToggle,
    ) {
        val next = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
        Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            GkTextField(
                value = name,
                onValueChange = { name = it },
                label = null,
                placeholder = stringResource(R.string.native_register_name),
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = next,
            )
            GkTextField(
                value = email,
                onValueChange = { email = it },
                label = null,
                placeholder = stringResource(R.string.native_login_username),
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, imeAction = ImeAction.Next),
                keyboardActions = next,
            )
            GkTextField(
                value = password,
                onValueChange = { password = it },
                label = null,
                placeholder = stringResource(R.string.native_admin_temporary_password),
                themeId = themeId,
                dark = dark,
                titleColor = titleColor,
                borderColor = borderColor,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = { submit() }),
                visualTransformation = PasswordVisualTransformation(),
            )
            Text(
                stringResource(R.string.native_admin_temporary_password_hint),
                color = if (dark) Color(0xFF6A7282) else Color(0xFF99A1AF),
                fontSize = 12.sp,
                lineHeight = 16.sp,
            )
            MakeAdminRow(admin, { admin = it }, themeId, dark, titleColor)
            GkGradientButton(
                label = stringResource(if (creating) R.string.native_admin_creating else R.string.native_admin_create_user_cta),
                themeId = themeId,
                enabled = !creating,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                modifier = Modifier.fillMaxWidth(0.9f).align(Alignment.CenterHorizontally),
                onClick = { submit() },
            )
        }
    }
}

/** AdminPanel.jsx's formatBytes(): two decimals at most with the zeros
 *  dropped, always a dot. Its units stop at GB, where this stays. */
private fun formatBytes(bytes: Long): String {
    if (bytes == 0L) return "0 B"
    val units = listOf("B", "KB", "MB", "GB")
    val index = min(units.lastIndex, floor(ln(bytes.toDouble()) / ln(1024.0)).toInt())
    val value = BigDecimal(bytes / 1024.0.pow(index)).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()
    return "$value ${units[index]}"
}
