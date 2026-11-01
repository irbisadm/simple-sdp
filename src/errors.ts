/**
 * Thrown by `sdpReader.parse` for a session description that does not follow
 * RFC 8866: a malformed line, an unknown line type, a line out of order, a missing
 * mandatory line, or a malformed value of a typed attribute.
 */
export class SdpParseError extends Error {
  /** The error description without the line reference */
  readonly reason: string;
  /** 1-based line number, or 0 when the error is not tied to a line (e.g. a missing line) */
  readonly lineNumber: number;
  /** The offending line, without the line terminator */
  readonly line: string;

  constructor(reason: string, lineNumber: number, line: string) {
    super(lineNumber > 0 ? `SDP line ${lineNumber} "${line}": ${reason}` : `SDP: ${reason}`);
    this.name = 'SdpParseError';
    this.reason = reason;
    this.lineNumber = lineNumber;
    this.line = line;
  }
}
