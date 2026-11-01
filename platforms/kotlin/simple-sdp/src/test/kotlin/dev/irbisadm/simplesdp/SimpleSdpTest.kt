package dev.irbisadm.simplesdp

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SimpleSdpTest {
    private val sdp = SimpleSdp()
    private val fixtures: List<File> = File(System.getProperty("fixtures")).listFiles { f -> f.name.endsWith(".sdp") }!!
        .sortedBy { it.name }

    private fun lines(vararg l: String) = l.joinToString("\r\n") + "\r\n"

    @Test
    fun `every fixture parses, validates and round-trips`() {
        assertTrue(fixtures.size >= 30)
        for (file in fixtures) {
            val text = file.readText()
            val model = sdp.parse(text)
            val type = if (file.name.contains("answer")) SdpType.ANSWER else SdpType.OFFER
            assertEquals(emptyList(), sdp.validate(text, type), file.name)
            assertEquals(emptyList(), sdp.validate(model, type), file.name)
            val written = sdp.write(model)
            assertEquals(model, sdp.parse(written), file.name)
            assertEquals(written, sdp.write(sdp.parse(written)), file.name)
        }
    }

    @Test
    fun `typed fields of a Chrome offer`() {
        val model = sdp.parse(File(fixtures.first().parentFile, "chrome-audio-video-offer.sdp").readText())
        val group = model["group"]!!.jsonArray[0].jsonObject
        assertEquals("BUNDLE", group["semantics"]!!.jsonPrimitive.content)
        val audio = model["media"]!!.jsonArray[0].jsonObject
        assertEquals("audio", audio["type"]!!.jsonPrimitive.content)
        val opus = audio["codecs"]!!.jsonArray[0].jsonObject
        assertEquals("opus", opus["encodingName"]!!.jsonPrimitive.content)
        assertEquals(48000, opus["clockRate"]!!.jsonPrimitive.int)
    }

    @Test
    fun `parse errors carry the line`() {
        val e = assertFailsWith<SdpParseException> {
            sdp.parse(lines("v=0", "s=-", "o=- 1 1 IN IP4 127.0.0.1", "t=0 0"))
        }
        assertEquals(3, e.lineNumber)
        assertEquals("o=- 1 1 IN IP4 127.0.0.1", e.line)
        assertEquals("line is out of order (session order: v o s i u e p c b t r z k a)", e.reason)
        assertEquals("SDP line 3 \"o=- 1 1 IN IP4 127.0.0.1\": ${e.reason}", e.message)

        val missing = assertFailsWith<SdpParseException> { sdp.parse("") }
        assertEquals(0, missing.lineNumber)
        assertEquals("SDP: missing mandatory \"v=\" line", missing.message)
        assertFalse(sdp.isValid("v=1\r\n"))
    }

    @Test
    fun `non-ASCII text survives the UTF-8 boundary`() {
        val text = lines("v=0", "o=- 1 1 IN IP4 h", "s=Grüße 🎉 Привет", "t=0 0", "a=x-note:ü\u0000end")
        val model = sdp.parse(text)
        assertEquals("Grüße 🎉 Привет", model["sessionName"]!!.jsonPrimitive.content)
        assertEquals(text, sdp.write(model))
    }

    @Test
    fun `model errors`() {
        assertEquals(
            "origin (o=) is required",
            assertFailsWith<SdpModelException> { sdp.write("""{"timing":[{"startTime":0,"stopTime":0}],"media":[]}""") }.message,
        )
        assertEquals(
            "invalid SDP model: sdp.media[0].port must be a number, got a string",
            assertFailsWith<SdpModelException> { sdp.validateModel("""{"media":[{"type":"audio","port":"9","proto":"RTP/AVP"}]}""") }.message,
        )
        assertFailsWith<SdpModelException> { sdp.write("{") }
    }

    @Test
    fun `validation of a modified model`() {
        val text = File(fixtures.first().parentFile, "chrome-audio-video-offer.sdp").readText()
        val model = sdp.parse(text)
        val media = model["media"]!!.jsonArray
        val video = JsonObject(media[1].jsonObject - "mid")
        val edited = JsonObject(model + ("media" to kotlinx.serialization.json.JsonArray(listOf(media[0], video))))
        assertEquals(listOf("group-unknown-mid", "bundle-missing-mid"), sdp.validate(edited).map { it.code })
        assertEquals(listOf("setup-actpass-in-answer", "setup-actpass-in-answer"), sdp.validate(text, SdpType.ANSWER).map { it.code })
        assertEquals(
            listOf(SdpIssue("error", "parse-error", "SDP: missing mandatory \"o=\" line", lineNumber = 0)),
            sdp.validate(lines("v=0", "s=-")),
        )
    }

    @Test
    fun `memory is reclaimed across many calls`() {
        val text = fixtures.maxByOrNull { it.length() }!!.readText()
        repeat(1000) { sdp.write(sdp.parse(text)) }
        // a leak of the inputs/results (~40 KB per call) would need >40 MB
        val pages = SimpleSdp::class.java.getDeclaredField("runtime").let { field ->
            field.isAccessible = true
            val runtime = field.get(sdp)!!
            val instance = runtime.javaClass.getDeclaredField("instance").also { it.isAccessible = true }.get(runtime)
            (instance as com.dylibso.chicory.runtime.Instance).memory().pages()
        }
        assertTrue(pages < 200, "memory grew to $pages pages")
    }

    @Test
    fun `concurrent calls`() {
        val text = File(fixtures.first().parentFile, "firefox-simulcast-offer.sdp").readText()
        val expected = sdp.write(sdp.parse(text))
        val pool = Executors.newFixedThreadPool(8)
        val results = (1..200).map { pool.submit<String> { sdp.write(sdp.parse(text)) } }
        pool.shutdown()
        assertTrue(pool.awaitTermination(2, TimeUnit.MINUTES))
        results.forEach { assertEquals(expected, it.get()) }
    }

    @Test
    fun `the interpreter gives the same results as the compiled module`() {
        val interpreted = SimpleSdp(File(System.getProperty("wasm")).readBytes())
        for (name in listOf("chrome-simulcast-offer", "sip-itsp-gateway-offer")) {
            val text = File(fixtures.first().parentFile, "$name.sdp").readText()
            assertEquals(sdp.parse(text), interpreted.parse(text))
            assertEquals(sdp.write(sdp.parse(text)), interpreted.write(interpreted.parse(text)))
            assertEquals(sdp.validate(text, SdpType.ANSWER), interpreted.validate(text, SdpType.ANSWER))
        }
    }

    @Test
    fun version() {
        assertEquals("1.1.0", sdp.version)
        assertEquals(JsonPrimitive(0), sdp.parse(lines("v=0", "o=- 1 1 IN IP4 h", "s=-", "t=0 0"))["protocolVersion"])
    }
}
