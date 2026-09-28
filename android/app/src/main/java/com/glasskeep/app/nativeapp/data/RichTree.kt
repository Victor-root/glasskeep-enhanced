package com.glasskeep.app.nativeapp.data

import com.glasskeep.app.nativeapp.data.pm.PmAddMarkStep
import com.glasskeep.app.nativeapp.data.pm.PmMapping
import com.glasskeep.app.nativeapp.data.pm.PmMark
import com.glasskeep.app.nativeapp.data.pm.PmNode
import com.glasskeep.app.nativeapp.data.pm.PmRemoveMarkStep
import com.glasskeep.app.nativeapp.data.pm.PmSchema
import com.glasskeep.app.nativeapp.data.pm.PmStep
import com.glasskeep.app.nativeapp.data.pm.PmTransform
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The note's blocks as the web editor's own document (data/pm), which a
 * paste and the formatting bar's commands run on as the web runs them,
 * and the way back to blocks.
 *
 * The flat block model cannot hold a quote inside a list item, which the
 * web can build; such a quote is lifted, its blocks staying in the item
 * without the card. It holds no lettered-list type either, so an
 * `<ol type="a">` becomes an ordinary numbered list.
 */
internal class RichTree(val blocks: List<RichBlock>) {
    val doc: PmNode = PmSchema.nodeFromJson(RichDoc.encodeDoc(blocks))
    private val starts = blockStarts(doc)

    /** Where [offset] of block [index] is in [doc]. */
    fun position(index: Int, offset: Int) = starts[index] + offset

    /**
     * [result], a document [doc] became, as the editor's state: its blocks,
     * those left as they were keeping their ids and what they carry beyond
     * the document, the selection from [anchor] to [head], and
     * [pendingMarks]. Null when it holds what the blocks cannot.
     */
    fun editing(result: PmNode, anchor: Int, head: Int, pendingMarks: List<PendingMark> = emptyList()): RichEditing? {
        val resultStarts = blockStarts(result)
        val parsed = RichDoc.parseDocJson(flatModel(result.toJson()).single()) ?: return null
        val kept = keepUnchanged(blocks, parsed)
        fun at(position: Int): RichPos {
            val index = resultStarts.indexOfLast { it <= position }
            return RichPos(kept[index].id, position - resultStarts[index])
        }
        return RichEditing(kept, RichSelection(at(anchor), at(head)), pendingMarks = pendingMarks)
    }

    companion object {
        /** Where each block's text starts (a rule: where the rule is), in
         *  document order: every block is one textblock or one rule. */
        fun blockStarts(doc: PmNode): List<Int> {
            val starts = mutableListOf<Int>()
            doc.descendants { node, pos, _, _ ->
                when {
                    node.isTextblock -> {
                        starts.add(pos + 1)
                        false
                    }
                    node.type === PmSchema.horizontalRule -> {
                        starts.add(pos)
                        false
                    }
                    else -> true
                }
            }
            return starts
        }

        /** A quote inside a list item gives its blocks to the item; an
         *  ordered list loses its type. */
        fun flatModel(node: JsonObject, inItem: Boolean = false): List<JsonObject> {
            val type = (node["type"] as? JsonPrimitive)?.content
            val children = (node["content"] as? JsonArray)?.map { it as JsonObject }
            if (type == "blockquote" && inItem) return children.orEmpty().flatMap { flatModel(it, inItem = true) }
            val nested = inItem || type == "listItem" || type == "taskItem"
            val fields = node.toMutableMap()
            if (children != null) fields["content"] = JsonArray(children.flatMap { flatModel(it, nested) })
            if (type == "orderedList") (node["attrs"] as? JsonObject)?.let { fields["attrs"] = JsonObject(it + ("type" to JsonNull)) }
            return listOf(JsonObject(fields))
        }

        /** [new], parsed afresh, keeping what [old] carries beyond the
         *  document on the blocks left as they were at either end: their
         *  ids, a checked state, language or list their kind does not show,
         *  and their lists' ids, each list of [new] taking the one its first
         *  such block had unless another list took it first. */
        private fun keepUnchanged(old: List<RichBlock>, new: List<RichBlock>): List<RichBlock> {
            fun comparable(block: RichBlock) = block.copy(
                id = "",
                quotes = block.quotes.map { it.copy(id = "") },
                checked = block.checked.takeIf { block.kind == RichBlockKind.TASK_ITEM } ?: false,
                language = block.language.takeIf { block.kind == RichBlockKind.CODE_BLOCK },
                listId = null,
            )
            var prefix = 0
            while (prefix < old.size && prefix < new.size && comparable(old[prefix]) == comparable(new[prefix])) prefix++
            var suffix = 0
            while (suffix < old.size - prefix && suffix < new.size - prefix &&
                comparable(old[old.size - 1 - suffix]) == comparable(new[new.size - 1 - suffix])
            ) {
                suffix++
            }
            val previous = new.indices.map { i ->
                when {
                    i < prefix -> old[i]
                    i >= new.size - suffix -> old[old.size - (new.size - i)]
                    else -> null
                }
            }
            val lists = HashMap<String, String?>()
            new.forEachIndexed { i, block ->
                val fresh = block.listId ?: return@forEachIndexed
                val kept = previous[i]?.listId ?: return@forEachIndexed
                if (fresh !in lists) lists[fresh] = kept.takeIf { it !in lists.values }
            }
            return new.mapIndexed { i, block ->
                val listId = block.listId?.let { lists[it] ?: it }
                val kept = previous[i] ?: return@mapIndexed block.copy(listId = listId)
                block.copy(
                    id = kept.id,
                    checked = if (block.kind == RichBlockKind.TASK_ITEM) block.checked else kept.checked,
                    language = if (block.kind == RichBlockKind.CODE_BLOCK) block.language else kept.language,
                    listId = if (block.kind.isListItem) listId else kept.listId,
                )
            }
        }
    }
}

/** [state]'s armed marks as the web's stored marks: null when none is
 *  armed, else every mark what is typed at its caret takes. */
internal fun storedMarks(state: RichEditing): List<PmMark>? {
    if (state.pendingMarks.isEmpty() || !state.selection.collapsed) return null
    val head = state.selection.head
    val block = state.blocks.firstOrNull { it.id == head.blockId } ?: return null
    val typing = RichTyping.typingMarks(block, head.offset, state.pendingMarks).map { RichMark(0, 1, it.type, it.value, it.color) }
    return PmMark.setFrom(RichDoc.encodeMarks(typing).map(PmSchema::markFromJson))
}

/** The web's [stored] marks as what [state]'s caret arms: each one unlike
 *  the mark of its type around the caret, and the absence of each mark
 *  around it they lack. None when [stored] is null. */
internal fun pendingMarks(stored: List<PmMark>?, state: RichEditing): List<PendingMark> {
    if (stored == null || !state.selection.collapsed) return emptyList()
    val head = state.selection.head
    val block = state.blocks.firstOrNull { it.id == head.blockId } ?: return emptyList()
    val around = RichDoc.marksAtCaret(block.marks, block.text.length, head.offset)
    val typed = stored.flatMap { RichDoc.parseMark(it.toJson(), 0, 1).orEmpty() }
    return RichMarkType.entries.mapNotNull { type ->
        val wanted = typed.firstOrNull { it.type == type }
        val present = around.firstOrNull { it.type == type }
        when {
            wanted == null -> present?.let { PendingMark(type, remove = true) }
            present != null && present.value == wanted.value && present.color == wanted.color -> null
            else -> PendingMark(type, wanted.value, wanted.color)
        }
    }
}

/** getMarksBetween(): every mark of the nodes in `[from, to)`, with where
 *  its node ends. */
internal fun marksBetween(doc: PmNode, from: Int, to: Int): List<Pair<PmMark, Int>> {
    val marks = mutableListOf<Pair<PmMark, Int>>()
    doc.nodesBetween(from, to, { node, pos, _, _ ->
        node.marks.forEach { marks.add(it to pos + node.nodeSize) }
        true
    })
    return marks
}

/** A range [steps] changed, before and after them (getChangedRanges). */
private data class Change(val oldFrom: Int, val oldTo: Int, val newFrom: Int, val newTo: Int)

/** getChangedRanges(): what each step changed, as it stands once all
 *  have run, every range once and none another one holds. A mark step
 *  changed the range it marked. */
private fun changedRanges(steps: List<PmStep>): List<Change> {
    val maps = steps.map { it.getMap() }
    val mapping = PmMapping(maps)
    val inverse = mapping.invert()
    val changes = mutableListOf<Change>()
    maps.forEachIndexed { index, map ->
        val ranges = mutableListOf<Pair<Int, Int>>()
        if (map.ranges.isEmpty()) {
            when (val step = steps[index]) {
                is PmAddMarkStep -> ranges += step.from to step.to
                is PmRemoveMarkStep -> ranges += step.from to step.to
                else -> return@forEachIndexed
            }
        } else {
            map.forEach { oldStart, oldEnd, _, _ -> ranges += oldStart to oldEnd }
        }
        val after = mapping.slice(index)
        for ((from, to) in ranges) {
            val newStart = after.map(from, -1)
            val newEnd = after.map(to)
            changes += Change(inverse.map(newStart, -1), inverse.map(newEnd), newStart, newEnd)
        }
    }
    val unique = changes.distinct()
    if (unique.size == 1) return unique
    return unique.filterIndexed { index, change ->
        unique.indices.none { other ->
            other != index && unique[other].let {
                change.oldFrom >= it.oldFrom && change.oldTo <= it.oldTo && change.newFrom >= it.newFrom && change.newTo <= it.newTo
            }
        }
    }
}

/**
 * The Link extension's autolink after [steps] took [oldDoc] to [doc], as
 * it follows every edit on the web: in each range they changed, the last
 * word of the first textblock when the range spans several, or the last
 * word before the range's end when the range ends with whitespace, becomes
 * a link when linkify finds an address there ([RichLinks.lastWordLinks])
 * not in inline code nor already in a link. Null when nothing is linked.
 */
internal fun autolink(oldDoc: PmNode, doc: PmNode, steps: List<PmStep>): PmTransform? {
    if (steps.isEmpty() || oldDoc.eq(doc)) return null
    val tr = PmTransform(doc)
    for (change in changedRanges(steps)) {
        val textblocks = mutableListOf<Pair<PmNode, Int>>()
        doc.nodesBetween(change.newFrom, change.newTo, { node, pos, _, _ ->
            if (node.isTextblock) textblocks += node to pos
            true
        })
        val (block, pos) = textblocks.firstOrNull() ?: continue
        val text = if (textblocks.size > 1) {
            doc.textBetween(pos, pos + block.nodeSize, null, " ")
        } else {
            if (!RichLinks.endsWithWhitespace(doc.textBetween(change.newFrom, change.newTo, " ", " "))) continue
            doc.textBetween(pos, change.newTo, null, " ")
        }
        for (link in RichLinks.lastWordLinks(text)) {
            val from = pos + link.start + 1
            val to = pos + link.end + 1
            if (doc.rangeHasMark(from, to, PmSchema.code)) continue
            if (marksBetween(doc, from, to).any { it.first.type === PmSchema.link }) continue
            tr.addMark(from, to, PmSchema.link.create(mapOf("href" to link.href)))
        }
    }
    return tr.takeIf { it.steps.isNotEmpty() }
}
