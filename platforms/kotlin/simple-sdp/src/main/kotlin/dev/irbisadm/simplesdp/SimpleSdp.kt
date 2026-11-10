package dev.irbisadm.simplesdp

import com.dylibso.chicory.runtime.ExportFunction
import com.dylibso.chicory.runtime.Instance
import com.dylibso.chicory.runtime.Machine
import com.dylibso.chicory.wasm.ChicoryException
import com.dylibso.chicory.wasm.Parser
import com.dylibso.chicory.wasm.WasmModule
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import dev.irbisadm.simplesdp.internal.SimpleSdpModule

/** Offer/answer specific validation rules, e.g. `a=setup:actpass` is not allowed in an answer */
enum class SdpType(internal val code: Long) { OFFER(1), ANSWER(2) }

/**
 * The session description violates RFC 8866: a malformed or unknown line, wrong line order,
 * a missing mandatory line or a malformed typed attribute.
 */
class SdpParseException(
    /** The error description without the line reference */
    val reason: String,
    /** 1-based line number, or 0 when the error is not tied to a line */
    val lineNumber: Int,
    /** The offending line, without the line terminator */
    val line: String,
    message: String,
) : Exception(message)

/** The model cannot be written or validated: invalid JSON, a field of the wrong type, missing `o=`/`t=`, … */
class SdpModelException(message: String) : IllegalArgumentException(message)

/** A rule violation reported by [SimpleSdp.validate] */
@Serializable
data class SdpIssue(
    /** `error` or `warning` */
    val severity: String,
    /** e.g. `missing-fingerprint`; the codes are listed in the README */
    val code: String,
    val message: String,
    /** Index in `media`, if the issue belongs to a media section */
    val mediaIndex: Int? = null,
    /** For `parse-error` and `lenient:*`: the line number reported by the parser */
    val lineNumber: Int? = null,
)

/** A deviation from RFC 8866 found by [SimpleSdp.parseLenient] */
@Serializable
data class SdpParseWarning(
    /** Stable machine-readable code, e.g. `out-of-order`; the codes are listed in the README */
    val code: String,
    /** The same text that [SimpleSdp.parse] reports for the same problem */
    val reason: String,
    /** 1-based line number, or 0 when the warning is not tied to a line (a missing line) */
    val lineNumber: Int,
    /** The offending line as it appears in the input, without the terminator; empty when [lineNumber] is 0 */
    val line: String,
    /** What was done with the line: `kept`, `skipped`, `generic-attribute`, `first-kept` or `repaired` */
    val action: String,
)

/** The result of [SimpleSdp.parseLenient] */
data class SdpLenientResult(
    /**
     * The model (the JSON form of the TypeScript `SdpLenient`): like the strict model, but
     * `protocolVersion`, `origin`, `sessionName`, `timing` and a media section's `port` and
     * `proto` may be absent
     */
    val sdp: JsonObject,
    /** In line order; warnings with `lineNumber` 0 come last */
    val warnings: List<SdpParseWarning>,
)

/**
 * simple-sdp: parse, write, validate, resolve and negotiate SDP (RFC 8866, RFC 3264).
 *
 * Runs the WebAssembly build of the library (the AssemblyScript port of the TypeScript
 * package) with Chicory. The module is compiled to JVM bytecode when this library is built,
 * so it works on the JVM and on Android without native code or run-time code generation.
 * The model is the JSON form of the TypeScript `Sdp` interface.
 *
 * An instance is thread-safe (calls are serialized). Create one and reuse it: loading the
 * module takes a few milliseconds.
 */
class SimpleSdp private constructor(
    private val module: WasmModule,
    private val machineFactory: ((Instance) -> Machine)?,
) {
    /** Uses the module bundled with the library, compiled to bytecode */
    constructor() : this(SimpleSdpModule.load(), SimpleSdpModule::create)

    /** Runs another build of the module (e.g. a debug build) on the Chicory interpreter */
    constructor(wasm: ByteArray) : this(Parser.parse(wasm), null)

    private class Runtime(module: WasmModule, machineFactory: ((Instance) -> Machine)?) {
        val instance: Instance = Instance.builder(module)
            .apply { if (machineFactory != null) withMachineFactory(machineFactory) }
            .build()
        val alloc: ExportFunction = instance.export("sdp_alloc")
        val free: ExportFunction = instance.export("sdp_free")
        val len: ExportFunction = instance.export("sdp_len")
        val parse: ExportFunction = instance.export("sdp_parse")
        val parseLenient: ExportFunction = instance.export("sdp_parse_lenient")
        val validateLenient: ExportFunction = instance.export("sdp_validate_lenient")
        val write: ExportFunction = instance.export("sdp_write")
        val validate: ExportFunction = instance.export("sdp_validate")
        val validateModel: ExportFunction = instance.export("sdp_validate_model")
        val resolve: ExportFunction = instance.export("sdp_resolve")
        val negotiate: ExportFunction = instance.export("sdp_negotiate")
        val version: ExportFunction = instance.export("sdp_version")
    }

    private var runtime: Runtime? = null

    /** Calls `fn(ptr, len, *extra)` with UTF-8 input and returns the UTF-8 result */
    private fun call(select: (Runtime) -> ExportFunction, input: String?, vararg extra: Long): String =
        call(select, listOfNotNull(input), *extra)

    /** Calls `fn(ptr1, len1, ptr2, len2, …, *extra)` with UTF-8 inputs and returns the UTF-8 result */
    @Synchronized
    private fun call(select: (Runtime) -> ExportFunction, inputs: List<String>, vararg extra: Long): String {
        val rt = runtime ?: Runtime(module, machineFactory).also { runtime = it }
        try {
            val memory = rt.instance.memory()
            val buffers = inputs.map { input ->
                val bytes = input.toByteArray(Charsets.UTF_8)
                val ptr = rt.alloc.apply(bytes.size.toLong())[0]
                memory.write(ptr.toInt(), bytes)
                longArrayOf(ptr, bytes.size.toLong())
            }
            val res = select(rt).apply(*buffers.flatMap { it.asList() }.toLongArray(), *extra)[0]
            buffers.forEach { rt.free.apply(it[0]) }
            val size = rt.len.apply(res)[0].toInt()
            val out = memory.readBytes(res.toInt(), size)
            rt.free.apply(res)
            return out.toString(Charsets.UTF_8)
        } catch (e: ChicoryException) {
            // A trap leaves the instance in an unknown state: start over on the next call
            runtime = null
            throw IllegalStateException("simple-sdp wasm trapped", e)
        }
    }

    private fun envelope(json: String): JsonObject {
        val result = Json.parseToJsonElement(json).jsonObject
        val error = result["error"]?.jsonObject ?: return result
        val message = error["message"]!!.jsonPrimitive.content
        val reason = error["reason"]
        if (reason != null) {
            throw SdpParseException(
                reason.jsonPrimitive.content,
                error["lineNumber"]!!.jsonPrimitive.int,
                error["line"]!!.jsonPrimitive.content,
                message,
            )
        }
        throw SdpModelException(message)
    }

    /**
     * Parses a session description into its model (the JSON form of the TypeScript `Sdp`).
     * Lines may be terminated by CRLF or LF.
     *
     * @throws SdpParseException if the description violates RFC 8866
     */
    fun parse(sdp: String): JsonObject = envelope(call({ it.parse }, sdp))["sdp"]!!.jsonObject

    /**
     * Parses a session description without failing: every deviation from RFC 8866 that
     * [parse] rejects is reported as a warning, and the model keeps what the text allows.
     * Lines may be terminated by CRLF, LF or CR.
     */
    fun parseLenient(sdp: String): SdpLenientResult {
        val result = envelope(call({ it.parseLenient }, sdp))
        return SdpLenientResult(
            result["sdp"]!!.jsonObject,
            result["warnings"]!!.jsonArray.map { Json.decodeFromJsonElement<SdpParseWarning>(it) },
        )
    }

    /** [parse] returning the model as a JSON string */
    fun parseToJson(sdp: String): String = parse(sdp).toString()

    /** True if [parse] accepts the description */
    fun isValid(sdp: String): Boolean = try {
        parse(sdp)
        true
    } catch (e: SdpParseException) {
        false
    }

    /**
     * Serializes a model: RFC 8866 line order, CRLF line endings.
     *
     * @throws SdpModelException if the model is invalid or lacks `origin`/`timing`
     */
    fun write(model: JsonObject): String = write(model.toString())

    /** [write] for a model given as a JSON string */
    fun write(modelJson: String): String =
        envelope(call({ it.write }, modelJson))["sdp"]!!.jsonPrimitive.content

    /**
     * Checks a session description against RFC 8866 and the WebRTC SDP rules. A parse
     * failure is reported as a single `parse-error` issue.
     */
    fun validate(sdp: String, type: SdpType? = null): List<SdpIssue> =
        issues(call({ it.validate }, sdp, type?.code ?: 0))

    /**
     * [validate] on a description parsed with [parseLenient]: each parse warning becomes a
     * `lenient:<code>` issue with severity `warning`, then the other checks run on the model.
     */
    fun validateLenient(sdp: String, type: SdpType? = null): List<SdpIssue> =
        issues(call({ it.validateLenient }, sdp, type?.code ?: 0))

    /**
     * Checks a model, e.g. after modifying it.
     *
     * @throws SdpModelException if the model is not valid JSON or a field has the wrong type
     */
    fun validate(model: JsonObject, type: SdpType? = null): List<SdpIssue> = validateModel(model.toString(), type)

    /** [validate] for a model given as a JSON string */
    fun validateModel(modelJson: String, type: SdpType? = null): List<SdpIssue> =
        issues(call({ it.validateModel }, modelJson, type?.code ?: 0))

    /**
     * The effective view of a model (strict or lenient): what applies to each media section,
     * with session-level values inherited and static payload types named. The JSON form of the
     * TypeScript `SdpResolved`.
     *
     * @throws SdpModelException if the model is not valid JSON or a field has the wrong type
     */
    fun resolve(model: JsonObject): JsonObject = resolve(model.toString())

    /** [resolve] for a model given as a JSON string */
    fun resolve(modelJson: String): JsonObject =
        envelope(call({ it.resolve }, modelJson))["resolved"]!!.jsonObject

    /**
     * RFC 3264 offer/answer: what the two sides agreed on, per media section of the answer.
     * The JSON form of the TypeScript `SdpNegotiation`.
     *
     * @throws SdpModelException if a model is not valid JSON or a field has the wrong type
     */
    fun negotiate(offer: JsonObject, answer: JsonObject): JsonObject = negotiate(offer.toString(), answer.toString())

    /** [negotiate] for models given as JSON strings */
    fun negotiate(offerJson: String, answerJson: String): JsonObject =
        envelope(call({ it.negotiate }, listOf(offerJson, answerJson)))["negotiation"]!!.jsonObject

    private fun issues(json: String): List<SdpIssue> =
        envelope(json)["issues"]!!.jsonArray.map { Json.decodeFromJsonElement<SdpIssue>(it) }

    /** Version of the wasm module */
    val version: String by lazy { call({ it.version }, null) }

}
