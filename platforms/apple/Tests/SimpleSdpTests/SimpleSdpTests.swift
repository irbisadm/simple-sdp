import Foundation
import XCTest
@testable import SimpleSdp

private final class Atomic: @unchecked Sendable {
    private let lock = NSLock()
    private var count: Int

    init(_ value: Int) { count = value }

    func increment() { lock.lock(); count += 1; lock.unlock() }

    var value: Int { lock.lock(); defer { lock.unlock() }; return count }
}

final class SimpleSdpTests: XCTestCase {
    private var sdp: SimpleSdp!
    private let fixtures = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().appendingPathComponent("../../../../test/fixtures").standardizedFileURL

    override func setUpWithError() throws {
        sdp = try SimpleSdp()
    }

    private func fixture(_ name: String) throws -> String {
        try String(contentsOf: fixtures.appendingPathComponent("\(name).sdp"), encoding: .utf8)
    }

    private func lines(_ l: String...) -> String {
        l.joined(separator: "\r\n") + "\r\n"
    }

    func testEveryFixtureParsesValidatesAndRoundTrips() throws {
        let names = try FileManager.default.contentsOfDirectory(atPath: fixtures.path).filter { $0.hasSuffix(".sdp") }
        XCTAssertGreaterThanOrEqual(names.count, 30)
        for name in names {
            let text = try String(contentsOf: fixtures.appendingPathComponent(name), encoding: .utf8)
            let type: SdpType = name.contains("answer") ? .answer : .offer
            let json = try sdp.parseJSON(text)
            XCTAssertEqual(try sdp.validate(text, type: type), [], name)
            XCTAssertEqual(try sdp.validate(json: json, type: type), [], name)
            XCTAssertEqual(try sdp.validate(model: try sdp.parse(text), type: type), [], name)
            // lossless: parseJSON keeps the key order
            let written = try sdp.write(json: json)
            XCTAssertEqual(try sdp.write(json: try sdp.parseJSON(written)), written, name)
            // a dictionary may reorder record keys, but the description stays equivalent
            let fromDictionary = try sdp.write(try sdp.parse(text))
            XCTAssertEqual(try sdp.parse(fromDictionary) as NSDictionary, try sdp.parse(text) as NSDictionary, name)
        }
    }

    func testTypedFieldsOfAChromeOffer() throws {
        let model = try sdp.parse(try fixture("chrome-audio-video-offer"))
        let group = (model["group"] as? [[String: Any]])?.first
        XCTAssertEqual(group?["semantics"] as? String, "BUNDLE")
        let audio = (model["media"] as? [[String: Any]])?.first
        let opus = (audio?["codecs"] as? [[String: Any]])?.first
        XCTAssertEqual(opus?["encodingName"] as? String, "opus")
        XCTAssertEqual((opus?["clockRate"] as? NSNumber)?.intValue, 48000)
    }

    func testParseErrorsCarryTheLine() throws {
        XCTAssertThrowsError(try sdp.parse(lines("v=0", "s=-", "o=- 1 1 IN IP4 127.0.0.1", "t=0 0"))) { error in
            XCTAssertEqual(error as? SdpParseError, SdpParseError(
                reason: "line is out of order (session order: v o s i u e p c b t r z k a)",
                lineNumber: 3,
                line: "o=- 1 1 IN IP4 127.0.0.1",
                message: "SDP line 3 \"o=- 1 1 IN IP4 127.0.0.1\": line is out of order (session order: v o s i u e p c b t r z k a)"
            ))
        }
        XCTAssertFalse(sdp.isValid("v=1\r\n"))
        XCTAssertThrowsError(try sdp.parseJSON("")) { error in
            XCTAssertEqual((error as? SdpParseError)?.message, "SDP: missing mandatory \"v=\" line")
        }
    }

    func testNonAsciiTextSurvivesTheUtf8Boundary() throws {
        let text = lines("v=0", "o=- 1 1 IN IP4 h", "s=Grüße 🎉 Привет", "t=0 0")
        let model = try sdp.parse(text)
        XCTAssertEqual(model["sessionName"] as? String, "Grüße 🎉 Привет")
        XCTAssertEqual(try sdp.write(model), text)
        XCTAssertEqual(try sdp.write(json: try sdp.parseJSON(text)), text)
    }

    func testModelErrors() throws {
        XCTAssertThrowsError(try sdp.write(json: Data(#"{"timing":[{"startTime":0,"stopTime":0}],"media":[]}"#.utf8))) { error in
            XCTAssertEqual(error as? SdpModelError, SdpModelError(message: "origin (o=) is required"))
        }
    }

    func testValidationOfAModifiedModel() throws {
        let text = try fixture("chrome-audio-video-offer")
        var model = try sdp.parse(text)
        var media = model["media"] as! [[String: Any]]
        media[1].removeValue(forKey: "mid")
        model["media"] = media
        XCTAssertEqual(try sdp.validate(model: model).map(\.code), ["group-unknown-mid", "bundle-missing-mid"])
        XCTAssertEqual(try sdp.validate(text, type: .answer).map(\.code), ["setup-actpass-in-answer", "setup-actpass-in-answer"])
    }

    func testManyCalls() throws {
        let text = try fixture("chrome-2023-renegotiation-4-offer")
        let expected = try sdp.write(json: try sdp.parseJSON(text))
        for _ in 0..<300 {
            XCTAssertEqual(try sdp.write(json: try sdp.parseJSON(text)), expected)
        }
    }

    func testConcurrentCalls() throws {
        let text = try fixture("firefox-simulcast-offer")
        let expected = try sdp.write(json: try sdp.parseJSON(text))
        let sdp = self.sdp!
        let failures = Atomic(0)
        DispatchQueue.concurrentPerform(iterations: 64) { _ in
            if (try? sdp.write(json: try sdp.parseJSON(text))) != expected {
                failures.increment()
            }
        }
        XCTAssertEqual(failures.value, 0)
    }

    func testVersion() throws {
        XCTAssertEqual(try sdp.version(), "1.1.0")
    }
}
