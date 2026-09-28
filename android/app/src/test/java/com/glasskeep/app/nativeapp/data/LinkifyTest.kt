package com.glasskeep.app.nativeapp.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Texts cut by the web's own linkifyjs (linkify/web-linkify.json): chosen
 * ones and ones generated from the pieces addresses are made of. Each run
 * is its kind (text, url, email, nl), where it starts and ends and, for an
 * address, its href; the port must cut every text the same way.
 */
class LinkifyTest {
    private val codes = mapOf(
        Linkify.Kind.TEXT to "t",
        Linkify.Kind.URL to "u",
        Linkify.Kind.EMAIL to "e",
        Linkify.Kind.NL to "n",
    )

    private fun runs(text: String): String = Linkify.tokenize(text).joinToString(" ") {
        listOfNotNull(codes.getValue(it.kind), it.start, it.end, it.href.takeIf { _ -> it.isLink }).joinToString(",")
    }

    @Test
    fun cutsTextsAsTheWebDoes() {
        val json = requireNotNull(javaClass.classLoader!!.getResource("linkify/web-linkify.json")).readText()
        val failures = (Json.parseToJsonElement(json) as JsonArray).mapNotNull { case ->
            val input = case.jsonObject.getValue("in").jsonPrimitive.content
            val expected = case.jsonObject.getValue("out").jsonArray.joinToString(" ") { run ->
                run.jsonArray.joinToString(",") { it.jsonPrimitive.content }
            }
            val actual = runs(input)
            if (actual == expected) null else "${JsonPrimitive(input)}\n  web:  $expected\n  app:  $actual"
        }
        assertEquals(failures.take(40).joinToString("\n"), 0, failures.size)
    }

    @Test
    fun findKeepsTheAddressesOnly() {
        val found = Linkify.find("Mail me@example.org or see WWW.Example.com/a, (https://x.io/b).")
        assertEquals(
            listOf("me@example.org" to "mailto:me@example.org", "WWW.Example.com/a" to "http://WWW.Example.com/a", "https://x.io/b" to "https://x.io/b"),
            found.map { it.value to it.href },
        )
    }
}
