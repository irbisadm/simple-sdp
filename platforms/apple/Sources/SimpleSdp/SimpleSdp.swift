import Foundation
import WasmKit

/// Offer/answer specific validation rules, e.g. `a=setup:actpass` is not allowed in an answer.
public enum SdpType: UInt32, Sendable {
    case offer = 1
    case answer = 2
}

/// The session description violates RFC 8866: a malformed or unknown line, wrong line order,
/// a missing mandatory line or a malformed typed attribute.
public struct SdpParseError: Error, Equatable, Sendable, CustomStringConvertible {
    /// The error description without the line reference
    public let reason: String
    /// 1-based line number, or 0 when the error is not tied to a line
    public let lineNumber: Int
    /// The offending line, without the line terminator
    public let line: String
    /// `SDP line <n> "<line>": <reason>`
    public let message: String

    public var description: String { message }
}

/// The model cannot be written or validated: invalid JSON, a field of the wrong type, missing `o=`/`t=`, …
public struct SdpModelError: Error, Equatable, Sendable, CustomStringConvertible {
    public let message: String

    public var description: String { message }
}

/// A rule violation reported by `SimpleSdp.validate`.
public struct SdpIssue: Codable, Equatable, Sendable {
    /// `error` or `warning`
    public let severity: String
    /// e.g. `missing-fingerprint`; the codes are listed in the README
    public let code: String
    public let message: String
    /// Index in `media`, if the issue belongs to a media section
    public let mediaIndex: Int?
    /// For `parse-error` and `lenient:*`: the line number reported by the parser
    public let lineNumber: Int?

    public init(severity: String, code: String, message: String, mediaIndex: Int? = nil, lineNumber: Int? = nil) {
        self.severity = severity
        self.code = code
        self.message = message
        self.mediaIndex = mediaIndex
        self.lineNumber = lineNumber
    }
}

/// A deviation from RFC 8866 found by `SimpleSdp.parseLenient`.
public struct SdpParseWarning: Codable, Equatable, Sendable {
    /// Stable machine-readable code, e.g. `out-of-order`; the codes are listed in the README
    public let code: String
    /// The same text that `parse` reports for the same problem
    public let reason: String
    /// 1-based line number, or 0 when the warning is not tied to a line (a missing line)
    public let lineNumber: Int
    /// The offending line as it appears in the input, without the terminator; empty when `lineNumber` is 0
    public let line: String
    /// What was done with the line: `kept`, `skipped`, `generic-attribute`, `first-kept` or `repaired`
    public let action: String

    public init(code: String, reason: String, lineNumber: Int, line: String, action: String) {
        self.code = code
        self.reason = reason
        self.lineNumber = lineNumber
        self.line = line
        self.action = action
    }
}

/// Failures of the WebAssembly runtime itself (not of the SDP).
public enum SimpleSdpRuntimeError: Error {
    case missingResource
    case missingExport(String)
    case unexpectedResult(String)
}

/// simple-sdp: parse, write and validate SDP (RFC 8866).
///
/// Runs the WebAssembly build of the library (the AssemblyScript port of the TypeScript
/// package) on the WasmKit interpreter. The model is the JSON form of the TypeScript `Sdp`
/// interface: use `parseJSON` and decode it with your own `Codable` types, or `parse` for a
/// `[String: Any]` dictionary.
///
/// An instance is thread-safe (calls are serialized). Create one and reuse it.
public final class SimpleSdp: @unchecked Sendable {
    private final class Runtime {
        let engine: Engine
        let store: Store
        let instance: Instance
        let memory: Memory
        let alloc, free, len, parse, parseLenient, write, validate, validateLenient, validateModel, version: Function

        init(module: Module) throws {
            engine = Engine()
            store = Store(engine: engine)
            instance = try module.instantiate(store: store)
            guard let memory = instance.exports[memory: "memory"] else {
                throw SimpleSdpRuntimeError.missingExport("memory")
            }
            self.memory = memory
            let exports = instance.exports
            func function(_ name: String) throws -> Function {
                guard let fn = exports[function: name] else {
                    throw SimpleSdpRuntimeError.missingExport(name)
                }
                return fn
            }
            alloc = try function("sdp_alloc")
            free = try function("sdp_free")
            len = try function("sdp_len")
            parse = try function("sdp_parse")
            parseLenient = try function("sdp_parse_lenient")
            validateLenient = try function("sdp_validate_lenient")
            write = try function("sdp_write")
            validate = try function("sdp_validate")
            validateModel = try function("sdp_validate_model")
            version = try function("sdp_version")
        }
    }

    private let module: Module
    private var runtime: Runtime?
    private let lock = NSLock()

    /// Loads the module bundled with the package.
    public convenience init() throws {
        guard let url = Bundle.module.url(forResource: "simple-sdp", withExtension: "wasm") else {
            throw SimpleSdpRuntimeError.missingResource
        }
        try self.init(wasm: Array(try Data(contentsOf: url)))
    }

    /// Loads a module from its bytes.
    public init(wasm: [UInt8]) throws {
        module = try parseWasm(bytes: wasm)
    }

    /// Calls `select(runtime)(ptr, len, extra...)` with UTF-8 input and returns the UTF-8 result.
    private func call(_ select: (Runtime) -> Function, _ input: String?, _ extra: [UInt32] = []) throws -> String {
        lock.lock()
        defer { lock.unlock() }
        let rt: Runtime
        if let existing = runtime {
            rt = existing
        } else {
            rt = try Runtime(module: module)
            runtime = rt
        }
        do {
            var args: [Value] = []
            if let input {
                let bytes = Array(input.utf8)
                let ptr = try rt.alloc([.i32(UInt32(bytes.count))])[0].i32
                rt.memory.withUnsafeMutableBufferPointer(offset: UInt(ptr), count: bytes.count) { buffer in
                    buffer.copyBytes(from: bytes)
                }
                args = [.i32(ptr), .i32(UInt32(bytes.count))] + extra.map { .i32($0) }
            }
            let result = try select(rt)(args)[0].i32
            if let ptr = args.first {
                _ = try rt.free([ptr])
            }
            let count = try Int(rt.len([.i32(result)])[0].i32)
            let output = rt.memory.withUnsafeBufferPointer(offset: UInt(result), count: count) { buffer in
                String(decoding: buffer, as: UTF8.self)
            }
            _ = try rt.free([.i32(result)])
            return output
        } catch {
            // A trap leaves the instance in an unknown state: start over on the next call
            runtime = nil
            throw error
        }
    }

    /// Decodes a result envelope, throwing its error if there is one.
    private func envelope(_ json: String) throws -> [String: Any] {
        guard let result = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] else {
            throw SimpleSdpRuntimeError.unexpectedResult(json)
        }
        guard let error = result["error"] as? [String: Any] else {
            return result
        }
        let message = error["message"] as? String ?? ""
        if let reason = error["reason"] as? String {
            throw SdpParseError(
                reason: reason,
                lineNumber: (error["lineNumber"] as? NSNumber)?.intValue ?? 0,
                line: error["line"] as? String ?? "",
                message: message
            )
        }
        throw SdpModelError(message: message)
    }

    /// Parses a session description into its model, as JSON.
    ///
    /// The JSON keeps the order of record keys (fmtp parameters, ssrc attributes, candidate
    /// extensions), so `write(json:)` of an unmodified result reproduces every line.
    /// Lines may be terminated by CRLF or LF.
    ///
    /// - Throws: `SdpParseError` if the description violates RFC 8866
    public func parseJSON(_ sdp: String) throws -> Data {
        let result = try call({ $0.parse }, sdp)
        // {"sdp":<model>} — the model is taken verbatim: a dictionary would lose the key order
        let prefix = #"{"sdp":"#
        guard result.hasPrefix(prefix), result.hasSuffix("}") else {
            _ = try envelope(result) // throws the parse error
            throw SimpleSdpRuntimeError.unexpectedResult(result)
        }
        return Data(result.utf8.dropFirst(prefix.utf8.count).dropLast())
    }

    /// Parses a session description into a dictionary.
    ///
    /// Swift dictionaries do not keep key order: writing this model back may reorder fmtp
    /// parameters, ssrc attributes and candidate extensions. Use `parseJSON` for a lossless
    /// round trip.
    ///
    /// - Throws: `SdpParseError` if the description violates RFC 8866
    public func parse(_ sdp: String) throws -> [String: Any] {
        guard let model = try JSONSerialization.jsonObject(with: try parseJSON(sdp)) as? [String: Any] else {
            throw SimpleSdpRuntimeError.unexpectedResult("parse")
        }
        return model
    }

    /// Parses a session description without failing on the SDP: every deviation from
    /// RFC 8866 that `parse` rejects is reported as a warning, and the model keeps what the
    /// text allows. Lines may be terminated by CRLF, LF or CR.
    ///
    /// The model is the JSON form of the TypeScript `SdpLenient`: like the strict model, but
    /// `protocolVersion`, `origin`, `sessionName`, `timing` and a media section's `port` and
    /// `proto` may be absent. Warnings are in line order; those with `lineNumber` 0 come last.
    ///
    /// - Throws: only `SimpleSdpRuntimeError` or a runtime trap, never `SdpParseError`
    public func parseLenientJSON(_ sdp: String) throws -> (sdp: Data, warnings: [SdpParseWarning]) {
        let result = try call({ $0.parseLenient }, sdp)
        // {"sdp":<model>,"warnings":[...]} — the model is taken verbatim to keep the key order.
        // String values escape their quotes, so the last `,"warnings":[` is the envelope's.
        let prefix = #"{"sdp":"#
        guard result.hasPrefix(prefix), result.hasSuffix("}"),
              let split = result.range(of: #","warnings":["#, options: .backwards) else {
            throw SimpleSdpRuntimeError.unexpectedResult(result)
        }
        let model = result[result.index(result.startIndex, offsetBy: prefix.count)..<split.lowerBound]
        let warnings = result[result.index(before: split.upperBound)..<result.index(before: result.endIndex)]
        return (
            Data(model.utf8),
            try JSONDecoder().decode([SdpParseWarning].self, from: Data(warnings.utf8))
        )
    }

    /// `parseLenientJSON` returning the model as a dictionary (see `parse` about key order).
    public func parseLenient(_ sdp: String) throws -> (sdp: [String: Any], warnings: [SdpParseWarning]) {
        let (json, warnings) = try parseLenientJSON(sdp)
        guard let model = try JSONSerialization.jsonObject(with: json) as? [String: Any] else {
            throw SimpleSdpRuntimeError.unexpectedResult("parseLenient")
        }
        return (model, warnings)
    }

    /// True if `parse` accepts the description.
    public func isValid(_ sdp: String) -> Bool {
        (try? parseJSON(sdp)) != nil
    }

    /// Serializes a model: RFC 8866 line order, CRLF line endings.
    ///
    /// - Throws: `SdpModelError` if the model is invalid or lacks `origin`/`timing`
    public func write(_ model: [String: Any]) throws -> String {
        try write(json: try JSONSerialization.data(withJSONObject: model))
    }

    /// `write` for a model given as JSON.
    public func write(json: Data) throws -> String {
        guard let text = try envelope(try call({ $0.write }, String(decoding: json, as: UTF8.self)))["sdp"] as? String else {
            throw SimpleSdpRuntimeError.unexpectedResult("write")
        }
        return text
    }

    /// Checks a session description against RFC 8866 and the WebRTC SDP rules.
    /// A parse failure is reported as a single `parse-error` issue.
    public func validate(_ sdp: String, type: SdpType? = nil) throws -> [SdpIssue] {
        try issues(try call({ $0.validate }, sdp, [type?.rawValue ?? 0]))
    }

    /// `validate` on a description parsed with `parseLenient`: each parse warning becomes a
    /// `lenient:<code>` issue with severity `warning`, then the other checks run on the model.
    public func validateLenient(_ sdp: String, type: SdpType? = nil) throws -> [SdpIssue] {
        try issues(try call({ $0.validateLenient }, sdp, [type?.rawValue ?? 0]))
    }

    /// Checks a model, e.g. after modifying it.
    ///
    /// - Throws: `SdpModelError` if a field has the wrong type
    public func validate(model: [String: Any], type: SdpType? = nil) throws -> [SdpIssue] {
        try validate(json: try JSONSerialization.data(withJSONObject: model), type: type)
    }

    /// `validate(model:)` for a model given as JSON.
    public func validate(json: Data, type: SdpType? = nil) throws -> [SdpIssue] {
        try issues(try call({ $0.validateModel }, String(decoding: json, as: UTF8.self), [type?.rawValue ?? 0]))
    }

    private func issues(_ json: String) throws -> [SdpIssue] {
        let result = try envelope(json)
        guard let list = result["issues"] else {
            throw SimpleSdpRuntimeError.unexpectedResult(json)
        }
        let data = try JSONSerialization.data(withJSONObject: list)
        return try JSONDecoder().decode([SdpIssue].self, from: data)
    }

    /// Version of the wasm module.
    public func version() throws -> String {
        try call({ $0.version }, nil)
    }
}
