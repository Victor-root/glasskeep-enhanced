package com.glasskeep.app.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R
import com.glasskeep.app.nativeapp.data.parseIsoToEpochMillis
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** DEFAULT_TIME_CHIPS / MAX_TIME_CHIPS (ReminderPicker.jsx:47-48). */
private val DefaultTimeChips = listOf("09:00", "12:00", "15:00", "18:00", "20:00")
private const val MaxTimeChips = 5

private val PickerBgLight = Color(0xFFFFFFFF)
private val PickerBgDark = Color(0xFF1F2937)
private val PickerBorderLight = Color(0x1A000000)
private val PickerBorderDark = Color(0x1FFFFFFF)
private val PickerFgLight = Color(0xFF1F2937)
private val PickerFgDark = Color(0xFFE5E7EB)
private val BtnHoverLight = Color(0x0E000000)
private val BtnHoverDark = Color(0x14FFFFFF)
private val PastHintLight = Color(0xFFDC2626)
private val PastHintDark = Color(0xFFF87171)

/**
 * ReminderPicker.jsx, in its phone shape. `useIsMobile` is true under
 * 768px, so the web never shows the small anchored 286px popover here:
 * it opens the full-screen variant, on a neutral white / #1f2937 panel
 * rather than the note's own colour, with no entrance animation.
 *
 * Contents in the web's own order: the label, a Monday-first mini
 * calendar of 42 cells, the time picker with its quick-time chips, the
 * past-date warning, then the actions row.
 */
@Composable
fun ReminderPickerOverlay(
    currentReminderIso: String?,
    timeChips: List<String>,
    themeId: String?,
    dark: Boolean,
    onChipsChange: (List<String>) -> Unit,
    onSave: (Date) -> Unit,
    onRemove: () -> Unit,
    onDismiss: () -> Unit,
) {
    val accent = WorkspaceTheme.accent(themeId, dark)
    val fg = if (dark) PickerFgDark else PickerFgLight
    val border = if (dark) PickerBorderDark else PickerBorderLight

    // presetTomorrow() (ReminderPicker.jsx:34-39) when the note has no
    // reminder yet: tomorrow at 09:00 sharp.
    val initial = remember(currentReminderIso) {
        Calendar.getInstance().apply {
            val existing = currentReminderIso?.let { parseIsoToEpochMillis(it) }
            if (existing != null) {
                timeInMillis = existing
            } else {
                add(Calendar.DAY_OF_MONTH, 1)
                set(Calendar.HOUR_OF_DAY, 9)
                set(Calendar.MINUTE, 0)
            }
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
    }

    var selectedYear by remember { mutableStateOf(initial.get(Calendar.YEAR)) }
    var selectedMonth by remember { mutableStateOf(initial.get(Calendar.MONTH)) }
    var selectedDay by remember { mutableStateOf(initial.get(Calendar.DAY_OF_MONTH)) }
    var viewYear by remember { mutableStateOf(initial.get(Calendar.YEAR)) }
    var viewMonth by remember { mutableStateOf(initial.get(Calendar.MONTH)) }
    var hour by remember { mutableStateOf(initial.get(Calendar.HOUR_OF_DAY)) }
    var minute by remember { mutableStateOf(initial.get(Calendar.MINUTE)) }

    val chips = remember(timeChips) {
        mutableStateListOf<String>().apply {
            addAll(timeChips.ifEmpty { DefaultTimeChips })
        }
    }
    var editingChips by remember { mutableStateOf(false) }

    val picked = remember(selectedYear, selectedMonth, selectedDay, hour, minute) {
        Calendar.getInstance().apply {
            set(selectedYear, selectedMonth, selectedDay, hour, minute, 0)
            set(Calendar.MILLISECOND, 0)
        }
    }
    val isPast = picked.timeInMillis <= System.currentTimeMillis()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(if (dark) PickerBgDark else PickerBgLight)
            .windowInsetsPadding(WindowInsets.systemBars),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, top = 10.dp, end = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.native_note_detail_reminder),
                color = fg,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            val closeLabel = stringResource(R.string.native_common_close)
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .semantics { contentDescription = closeLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { onDismiss() },
                contentAlignment = Alignment.Center,
            ) {
                CloseIcon(size = 20.dp, tint = fg)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(border))

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 14.dp, end = 14.dp, top = 8.dp, bottom = 18.dp),
        ) {
            Text(
                stringResource(R.string.native_reminder_pick_datetime).uppercase(),
                color = fg.copy(alpha = 0.65f),
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.46.sp,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 0.dp),
            )
            Spacer(Modifier.height(4.dp))

            MiniCalendar(
                viewYear = viewYear,
                viewMonth = viewMonth,
                selectedYear = selectedYear,
                selectedMonth = selectedMonth,
                selectedDay = selectedDay,
                accent = accent,
                fg = fg,
                dark = dark,
                onPrevMonth = {
                    if (viewMonth == 0) {
                        viewMonth = 11
                        viewYear -= 1
                    } else {
                        viewMonth -= 1
                    }
                },
                onNextMonth = {
                    if (viewMonth == 11) {
                        viewMonth = 0
                        viewYear += 1
                    } else {
                        viewMonth += 1
                    }
                },
                onPick = { y, m, d ->
                    selectedYear = y
                    selectedMonth = m
                    selectedDay = d
                    viewYear = y
                    viewMonth = m
                },
            )
            Spacer(Modifier.height(10.dp))

            TimeSection(
                hour = hour,
                minute = minute,
                chips = chips,
                editing = editingChips,
                accent = accent,
                fg = fg,
                dark = dark,
                border = border,
                onHourChange = { hour = (it + 24) % 24 },
                onMinuteChange = { minute = (it + 60) % 60 },
                onChipPicked = { h, m -> hour = h; minute = m },
                onEditToggle = { editingChips = !editingChips },
                onChipsCommitted = { committed ->
                    chips.clear()
                    chips.addAll(committed)
                    editingChips = false
                    onChipsChange(committed)
                },
            )

            if (isPast) {
                Spacer(Modifier.height(6.dp))
                Text(
                    stringResource(R.string.native_reminder_past_hint),
                    color = if (dark) PastHintDark else PastHintLight,
                    fontSize = 11.5.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, bottom = 4.dp),
                )
            }

            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (currentReminderIso != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { onRemove() }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        Text(
                            stringResource(R.string.native_reminder_remove),
                            color = if (dark) PastHintDark else PastHintLight,
                            fontSize = 12.8.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
                GkGradientButton(
                    label = if (currentReminderIso != null) {
                        stringResource(R.string.native_reminder_update)
                    } else {
                        stringResource(R.string.native_reminder_set)
                    },
                    themeId = themeId,
                    enabled = !isPast,
                    horizontalPadding = 12.dp,
                    verticalPadding = 6.dp,
                    onClick = { onSave(picked.time) },
                )
            }
        }
    }
}

/** MiniCalendar (ReminderPicker.jsx:72-150): six fixed rows of seven,
 *  starting on Monday, with past days disabled. */
@Composable
private fun MiniCalendar(
    viewYear: Int,
    viewMonth: Int,
    selectedYear: Int,
    selectedMonth: Int,
    selectedDay: Int,
    accent: Color,
    fg: Color,
    dark: Boolean,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onPick: (Int, Int, Int) -> Unit,
) {
    val locale = Locale.getDefault()
    val monthTitle = remember(viewYear, viewMonth, locale) {
        val cal = Calendar.getInstance().apply { set(viewYear, viewMonth, 1) }
        SimpleDateFormat("LLLL yyyy", locale).format(cal.time)
            .replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }
    }
    // Day names taken from the week of 1 January 2024, itself a Monday,
    // exactly like the web builds its own labels.
    val dayLabels = remember(locale) {
        val fmt = SimpleDateFormat("EEE", locale)
        val cal = Calendar.getInstance().apply { set(2024, Calendar.JANUARY, 1) }
        List(7) { index ->
            val day = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, index) }
            fmt.format(day.time).uppercase(locale)
        }
    }

    val today = remember { Calendar.getInstance() }
    val todayY = today.get(Calendar.YEAR)
    val todayM = today.get(Calendar.MONTH)
    val todayD = today.get(Calendar.DAY_OF_MONTH)

    val cells = remember(viewYear, viewMonth) {
        val first = Calendar.getInstance().apply {
            set(viewYear, viewMonth, 1, 0, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val firstDow = (first.get(Calendar.DAY_OF_WEEK) + 5) % 7
        val start = (first.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, -firstDow) }
        List(42) { index ->
            val day = (start.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, index) }
            Triple(day.get(Calendar.YEAR), day.get(Calendar.MONTH), day.get(Calendar.DAY_OF_MONTH))
        }
    }

    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CalendarArrow(
                contentDescription = stringResource(R.string.native_reminder_prev_month),
                rotation = 90f,
                tint = fg,
                onClick = onPrevMonth,
            )
            Text(
                monthTitle,
                color = fg,
                fontSize = 13.6.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
            CalendarArrow(
                contentDescription = stringResource(R.string.native_reminder_next_month),
                rotation = -90f,
                tint = fg,
                onClick = onNextMonth,
            )
        }
        Row(Modifier.fillMaxWidth()) {
            dayLabels.forEach { label ->
                Text(
                    label,
                    color = fg.copy(alpha = 0.55f),
                    fontSize = 9.9.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f).padding(vertical = 2.dp),
                )
            }
        }
        cells.chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                week.forEach { (year, month, day) ->
                    val outside = month != viewMonth || year != viewYear
                    val isToday = year == todayY && month == todayM && day == todayD
                    val isSelected = year == selectedYear && month == selectedMonth && day == selectedDay
                    val isPastDay = compareDates(year, month, day, todayY, todayM, todayD) < 0
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .heightIn(min = 38.dp)
                            .padding(vertical = 1.dp)
                            .clip(RoundedCornerShape(9.dp))
                            .background(if (isSelected) accent else Color.Transparent)
                            .then(
                                if (isToday && !isSelected) {
                                    Modifier.border(1.5.dp, accent.copy(alpha = 0.45f), RoundedCornerShape(9.dp))
                                } else {
                                    Modifier
                                },
                            )
                            .alpha(if (isPastDay) 0.25f else if (outside) 0.32f else 1f)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                enabled = !isPastDay,
                                role = Role.Button,
                            ) { onPick(year, month, day) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            day.toString(),
                            color = if (isSelected) Color.White else fg,
                            fontSize = 14.7.sp,
                            fontWeight = when {
                                isSelected -> FontWeight.SemiBold
                                isToday -> FontWeight.Bold
                                else -> FontWeight.Normal
                            },
                        )
                    }
                }
            }
        }
    }
}

/** Negative when the first date is before the second. */
private fun compareDates(y1: Int, m1: Int, d1: Int, y2: Int, m2: Int, d2: Int): Int =
    compareValuesBy(Triple(y1, m1, d1), Triple(y2, m2, d2), { it.first }, { it.second }, { it.third })

@Composable
private fun CalendarArrow(contentDescription: String, rotation: Float, tint: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .semantics { this.contentDescription = contentDescription }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        ChevronDownIcon(modifier = Modifier.rotate(rotation), size = 18.dp, tint = tint)
    }
}

/** TimePicker (ReminderPicker.jsx:206-312): two editable numeric fields
 *  with their own chevrons - hours step by one, minutes by five, and
 *  both wrap - then the quick-time chips and their edit mode. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TimeSection(
    hour: Int,
    minute: Int,
    chips: List<String>,
    editing: Boolean,
    accent: Color,
    fg: Color,
    dark: Boolean,
    border: Color,
    onHourChange: (Int) -> Unit,
    onMinuteChange: (Int) -> Unit,
    onChipPicked: (Int, Int) -> Unit,
    onEditToggle: () -> Unit,
    onChipsCommitted: (List<String>) -> Unit,
) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(bottom = 9.dp),
        ) {
            TimeColumn(
                value = hour,
                max = 23,
                upDescription = stringResource(R.string.native_reminder_hour_up),
                downDescription = stringResource(R.string.native_reminder_hour_down),
                accent = accent,
                fg = fg,
                dark = dark,
                onStep = { delta -> onHourChange(hour + delta) },
                onSet = { onHourChange(it) },
            )
            Text(":", color = fg.copy(alpha = 0.45f), fontSize = 20.8.sp, fontWeight = FontWeight.Bold)
            TimeColumn(
                value = minute,
                max = 59,
                upDescription = stringResource(R.string.native_reminder_minute_up),
                downDescription = stringResource(R.string.native_reminder_minute_down),
                accent = accent,
                fg = fg,
                dark = dark,
                onStep = { delta -> onMinuteChange(minute + delta * 5) },
                onSet = { onMinuteChange(it) },
            )
        }

        if (editing) {
            ChipEditor(
                chips = chips,
                accent = accent,
                fg = fg,
                dark = dark,
                border = border,
                onCommit = onChipsCommitted,
            )
        } else {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally),
                verticalArrangement = Arrangement.spacedBy(5.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                chips.forEach { chip ->
                    val parts = chip.split(":")
                    val chipHour = parts.getOrNull(0)?.toIntOrNull() ?: 0
                    val chipMinute = parts.getOrNull(1)?.toIntOrNull() ?: 0
                    val active = chipHour == hour && chipMinute == minute
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(
                                when {
                                    active && dark -> accent.copy(alpha = 0.32f)
                                    active -> accent.copy(alpha = 0.16f)
                                    dark -> BtnHoverDark
                                    else -> BtnHoverLight
                                },
                            )
                            .border(
                                width = 1.dp,
                                color = if (active) accent else border,
                                shape = RoundedCornerShape(999.dp),
                            )
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                role = Role.Button,
                            ) { onChipPicked(chipHour, chipMinute) }
                            .padding(horizontal = 13.dp, vertical = 7.dp),
                    ) {
                        Text(
                            chip,
                            color = if (active) (if (dark) Color.White else accent) else fg,
                            fontSize = 13.8.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
                val editLabel = stringResource(R.string.native_reminder_edit_chips)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(if (dark) BtnHoverDark else BtnHoverLight)
                        .border(1.dp, border, RoundedCornerShape(999.dp))
                        .semantics { contentDescription = editLabel }
                        .gkTooltip(editLabel)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { onEditToggle() }
                        .padding(horizontal = 9.dp, vertical = 7.dp),
                ) {
                    PencilIcon(size = 14.dp, tint = fg)
                }
            }
        }
    }
}

@Composable
private fun TimeColumn(
    value: Int,
    max: Int,
    upDescription: String,
    downDescription: String,
    accent: Color,
    fg: Color,
    dark: Boolean,
    onStep: (Int) -> Unit,
    onSet: (Int) -> Unit,
) {
    var editingText by remember { mutableStateOf<String?>(null) }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        TimeStepButton(contentDescription = upDescription, rotation = 180f, dark = dark, tint = fg) { onStep(1) }
        BasicTextField(
            value = editingText ?: "%02d".format(value),
            onValueChange = { raw -> editingText = raw.filter { it.isDigit() }.take(2) },
            singleLine = true,
            textStyle = TextStyle(
                color = fg,
                fontSize = 20.8.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            ),
            cursorBrush = SolidColor(accent),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(
                onDone = {
                    val parsed = editingText?.toIntOrNull()
                    if (parsed != null) onSet(parsed.coerceIn(0, max))
                    editingText = null
                },
            ),
            modifier = Modifier
                .width(48.dp)
                .padding(vertical = 2.dp),
        )
        TimeStepButton(contentDescription = downDescription, rotation = 0f, dark = dark, tint = fg) { onStep(-1) }
    }
}

@Composable
private fun TimeStepButton(
    contentDescription: String,
    rotation: Float,
    dark: Boolean,
    tint: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .width(34.dp)
            .height(22.dp)
            .clip(RoundedCornerShape(7.dp))
            .background(if (dark) BtnHoverDark else BtnHoverLight)
            .semantics { this.contentDescription = contentDescription }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
            ) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        ChevronDownIcon(modifier = Modifier.rotate(rotation), size = 16.dp, tint = tint)
    }
}

/** The chips' inline edit mode: one field per chip, a dotted "+" while
 *  under five, and a Done button that normalises, de-duplicates and
 *  truncates the list (ReminderPicker.jsx:221-283). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipEditor(
    chips: List<String>,
    accent: Color,
    fg: Color,
    dark: Boolean,
    border: Color,
    onCommit: (List<String>) -> Unit,
) {
    val drafts = remember(chips) { mutableStateListOf<String>().apply { addAll(chips) } }
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(5.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        drafts.forEachIndexed { index, draft ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                BasicTextField(
                    value = draft,
                    onValueChange = { raw -> drafts[index] = formatChipInput(raw) },
                    singleLine = true,
                    textStyle = TextStyle(color = fg, fontSize = 13.1.sp, fontWeight = FontWeight.SemiBold),
                    cursorBrush = SolidColor(accent),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                    modifier = Modifier
                        .width(56.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (dark) BtnHoverDark else BtnHoverLight)
                        .padding(horizontal = 2.dp, vertical = 4.dp),
                )
                val deleteLabel = stringResource(R.string.native_reminder_delete_chip)
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .semantics { contentDescription = deleteLabel }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button,
                        ) { drafts.removeAt(index) },
                    contentAlignment = Alignment.Center,
                ) {
                    CloseIcon(size = 12.dp, tint = if (dark) PastHintDark else PastHintLight)
                }
            }
        }
        if (drafts.size < MaxTimeChips) {
            val addLabel = stringResource(R.string.native_reminder_add_chip)
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .border(1.dp, border, CircleShape)
                    .semantics { contentDescription = addLabel }
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Button,
                    ) { drafts.add("09:00") },
                contentAlignment = Alignment.Center,
            ) {
                PlusIcon(size = 14.dp, tint = fg)
            }
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(if (dark) accent.copy(alpha = 0.32f) else accent.copy(alpha = 0.14f))
                .border(1.dp, accent, RoundedCornerShape(999.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    role = Role.Button,
                ) { onCommit(normaliseChips(drafts)) }
                .padding(horizontal = 11.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            CheckmarkIcon(size = 14.dp, tint = if (dark) Color.White else accent)
            Text(
                stringResource(R.string.native_reminder_done),
                color = if (dark) Color.White else accent,
                fontSize = 12.8.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/** formatChipInput (ReminderPicker.jsx:64-67): digits only, with the
 *  colon inserted on its own after the second one. */
private fun formatChipInput(raw: String): String {
    val digits = raw.filter { it.isDigit() }.take(4)
    return if (digits.length <= 2) digits else digits.substring(0, 2) + ":" + digits.substring(2)
}

/** normalise + dedupe + truncate to five, falling back on the defaults
 *  when everything was emptied (ReminderPicker.jsx:221-232). */
private fun normaliseChips(drafts: List<String>): List<String> {
    val cleaned = drafts.mapNotNull { draft ->
        val parts = draft.split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: return@mapNotNull null
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        "%02d:%02d".format(h.coerceIn(0, 23), m.coerceIn(0, 59))
    }.distinct().take(MaxTimeChips)
    return cleaned.ifEmpty { DefaultTimeChips }
}
