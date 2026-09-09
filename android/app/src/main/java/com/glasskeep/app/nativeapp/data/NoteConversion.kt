package com.glasskeep.app.nativeapp.data

import java.util.UUID

/**
 * Turning a text note into a checklist and back, ported from
 * src/utils/noteConversion.js.
 *
 * Both directions are best-effort by design, which is why the web puts a
 * confirmation in front of them: the round trip preserves intent (what was
 * a task stays a task, what was a heading stays a section) but not
 * necessarily every character.
 */
object NoteConversion {
    private val HEADING = Regex("""^#{1,6}\s+(.+)$""")
    private val TASK = Regex("""^[-*+]\s+\[([ xX])]\s*(.*)$""")
    private val BULLET = Regex("""^[-*+]\s+(.*)$""")
    private val ORDERED = Regex("""^\d+[.)]\s+(.*)$""")
    private val QUOTE = Regex("""^>+\s*(.*)$""")

    /**
     * textToChecklistItems(): a free-form body becomes checklist entries.
     *
     *   - a Markdown heading becomes a section marker
     *   - `- [ ]` / `- [x]` becomes an item with its done state
     *   - a bullet, a numbered line or a quote becomes an unchecked item
     *   - any other non-empty line becomes an unchecked item
     *   - blank lines are dropped, a checklist has no empty rows
     *   - a task line that starts with whitespace is indented, unless it is
     *     the first row of the list or of its section (the same rule
     *     [ChecklistItems.normalize] enforces everywhere else)
     */
    fun textToChecklistEntries(text: String): List<ChecklistEntry> {
        if (text.isBlank()) return emptyList()
        val entries = mutableListOf<ChecklistEntry>()
        var atSectionStart = true
        for (raw in text.split("\n")) {
            val line = raw.trimEnd()
            val trimmed = line.trim()
            if (trimmed.isEmpty()) continue
            val indented = line.firstOrNull()?.isWhitespace() == true

            val heading = HEADING.matchEntire(trimmed)
            if (heading != null) {
                entries.add(ChecklistSectionData(newId(), heading.groupValues[1].trim()))
                atSectionStart = true
                continue
            }

            val task = TASK.matchEntire(trimmed)
            if (task != null) {
                entries.add(
                    ChecklistItemData(
                        id = newId(),
                        text = task.groupValues[2].trim(),
                        done = task.groupValues[1].equals("x", ignoreCase = true),
                        indent = if (indented && !atSectionStart) 1 else 0,
                    ),
                )
                atSectionStart = false
                continue
            }

            val plain = BULLET.matchEntire(trimmed)?.groupValues?.get(1)
                ?: ORDERED.matchEntire(trimmed)?.groupValues?.get(1)
                ?: QUOTE.matchEntire(trimmed)?.groupValues?.get(1)
                ?: trimmed
            val cleaned = plain.trim()
            if (cleaned.isNotEmpty()) {
                entries.add(ChecklistItemData(newId(), cleaned, done = false, indent = 0))
                atSectionStart = false
            }
        }
        return entries
    }

    /**
     * checklistItemsToText(): the Markdown-ish body a checklist becomes.
     * Sections turn into `## Title` (with a blank line above), items into
     * `- [ ]` / `- [x]`, and an indented item keeps its two-space prefix so
     * [textToChecklistEntries] reads it back as indented. Empty rows are
     * skipped so the result stays clean.
     */
    fun checklistEntriesToText(entries: List<ChecklistEntry>): String {
        val normalized = ChecklistItems.normalize(entries)
        val lines = mutableListOf<String>()
        for (entry in normalized) {
            when (entry) {
                is ChecklistSectionData -> {
                    val title = entry.title.trim()
                    if (title.isEmpty()) continue
                    if (lines.isNotEmpty() && lines.last().isNotEmpty()) lines.add("")
                    lines.add("## $title")
                }
                is ChecklistItemData -> {
                    val text = entry.text.trim()
                    if (text.isEmpty()) continue
                    val prefix = if (entry.indent > 0) "  " else ""
                    lines.add("$prefix- [${if (entry.done) "x" else " "}] $text")
                }
            }
        }
        return lines.joinToString("\n")
    }

    /**
     * The checklist as rich blocks, ready for [RichDoc.encode].
     *
     * The web gets there through Markdown (checklistItemsToText, then
     * marked, then generateJSON), which lands on a level-2 heading per
     * section and a task list of the items. This builds the same document
     * directly, with one deliberate difference: an indented item carries
     * the `indent` attribute this project's own Indent extension uses,
     * rather than a nested task list. Both render as one step of extra
     * margin, and the flat form is the one the native editor can edit.
     */
    fun checklistEntriesToRichBlocks(entries: List<ChecklistEntry>): List<RichBlock> {
        val normalized = ChecklistItems.normalize(entries)
        val blocks = mutableListOf<RichBlock>()
        for (entry in normalized) {
            when (entry) {
                is ChecklistSectionData -> {
                    val title = entry.title.trim()
                    if (title.isEmpty()) continue
                    blocks.add(RichDoc.newBlock(RichBlockKind.HEADING_2).copy(text = title))
                }
                is ChecklistItemData -> {
                    val text = entry.text.trim()
                    if (text.isEmpty()) continue
                    blocks.add(
                        RichDoc.newBlock(RichBlockKind.TASK_ITEM).copy(
                            text = text,
                            checked = entry.done,
                            indent = entry.indent.coerceIn(0, 1),
                        ),
                    )
                }
            }
        }
        return blocks
    }

    /**
     * The plain text a rich body converts FROM, matching what the web
     * feeds textToChecklistItems: richDocToPlain's output, one line per
     * block, with no Markdown markers left. A task list or a heading
     * therefore comes back as ordinary lines, which is exactly what the
     * web does too and why the confirmation warns the result may differ.
     */
    fun richBlocksToPlainText(blocks: List<RichBlock>): String =
        blocks.joinToString("\n") { it.text }
            .replace(Regex("\n{3,}"), "\n\n")
            .trim()

    private fun newId() = UUID.randomUUID().toString()
}
