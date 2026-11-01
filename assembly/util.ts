// AssemblyScript has no exceptions (`throw` aborts the instance), so errors are
// reported through a single error slot: a failing function calls `fail()` and returns
// a placeholder; every caller checks `failed()` right after the call and returns early.

export class Err {
  static msg: string | null = null;
}

/** Records an error. The first error wins, like a thrown exception. */
export function fail(msg: string): void {
  if (Err.msg === null) {
    Err.msg = msg;
  }
}

export function failed(): bool {
  return Err.msg !== null;
}

/** Replaces the default `env.abort` import (asconfig `use`), so the module has no imports */
export function abortStub(message: string | null, fileName: string | null, line: u32, column: u32): void {
  unreachable();
}

export function resetError(): void {
  Err.msg = null;
}

export function takeError(): string {
  const msg = Err.msg;
  Err.msg = null;
  return msg === null ? '' : msg;
}

// ---------------------------------------------------------------------------
// Numbers. The model keeps every number as f64, like JavaScript; NaN means "absent".
// ---------------------------------------------------------------------------

export const ABSENT: f64 = NaN;

export function present(n: f64): bool {
  return !isNaN(n);
}

/** `String(n)` of JavaScript for the values the library produces */
export function fmtNum(n: f64): string {
  if (isNaN(n)) {
    return 'NaN';
  }
  if (n == Infinity) {
    return 'Infinity';
  }
  if (n == -Infinity) {
    return '-Infinity';
  }
  if (n == 0) {
    return '0';
  }
  if (Math.floor(n) == n && Math.abs(n) < 18446744073709551616.0) {
    return n < 0 ? '-' + (<u64>(-n)).toString() : (<u64>n).toString();
  }
  return n.toString();
}

export function isDigit(c: i32): bool {
  return c >= 0x30 && c <= 0x39;
}

/** `/^\d+$/` */
export function isDigits(s: string): bool {
  if (s.length == 0) {
    return false;
  }
  for (let i = 0; i < s.length; i++) {
    if (!isDigit(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

/** Parses a non-negative decimal integer, rejecting anything else (`"1a"`, `""`, `"-1"`, `"1.5"`). */
export function stringToInt(input: string, what: string = 'value'): f64 {
  if (!isDigits(input)) {
    fail(`${what} "${input}" is not a non-negative integer`);
    return ABSENT;
  }
  return parseFloat(input);
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

/** `[head, rest]` split at the first space; `rest` is null if there is no space */
export class Split {
  constructor(public head: string, public rest: string | null) {}
}

export function splitFirst(value: string, sep: string = ' '): Split {
  const idx = value.indexOf(sep);
  return idx == -1 ? new Split(value, null) : new Split(value.slice(0, idx), value.slice(idx + sep.length));
}

/** JavaScript truthiness of an optional string */
export function truthy(s: string | null): bool {
  return s !== null && s.length > 0;
}

export function joinNums(nums: f64[], sep: string): string {
  const parts = new Array<string>(nums.length);
  for (let i = 0; i < nums.length; i++) {
    parts[i] = fmtNum(nums[i]);
  }
  return parts.join(sep);
}

// ---------------------------------------------------------------------------
// Ordered string map (a JavaScript object used as a record: `Record<string, string | null>`)
// ---------------------------------------------------------------------------

export class Params {
  keys: string[] = [];
  values: Array<string | null> = [];

  get size(): i32 {
    return this.keys.length;
  }

  has(key: string): bool {
    return this.keys.indexOf(key) != -1;
  }

  get(key: string): string | null {
    const idx = this.keys.indexOf(key);
    return idx == -1 ? null : this.values[idx];
  }

  /** Like `obj[key] = value`: an existing key keeps its position */
  set(key: string, value: string | null): void {
    const idx = this.keys.indexOf(key);
    if (idx == -1) {
      this.keys.push(key);
      this.values.push(value);
    } else {
      this.values[idx] = value;
    }
  }

  delete(key: string): void {
    const idx = this.keys.indexOf(key);
    if (idx != -1) {
      this.keys.splice(idx, 1);
      this.values.splice(idx, 1);
    }
  }

  /**
   * Indices in JavaScript property order (`Object.entries`): array-index keys
   * ascending, then the other keys in insertion order.
   */
  order(): i32[] {
    const indexKeys: i32[] = [];
    const other: i32[] = [];
    for (let i = 0; i < this.keys.length; i++) {
      if (isArrayIndex(this.keys[i])) {
        indexKeys.push(i);
      } else {
        other.push(i);
      }
    }
    if (indexKeys.length > 1) {
      const keys = this.keys;
      // insertion sort: the lists are tiny
      for (let i = 1; i < indexKeys.length; i++) {
        const cur = indexKeys[i];
        const curValue = parseFloat(keys[cur]);
        let j = i - 1;
        while (j >= 0 && parseFloat(keys[indexKeys[j]]) > curValue) {
          indexKeys[j + 1] = indexKeys[j];
          j--;
        }
        indexKeys[j + 1] = cur;
      }
    }
    return indexKeys.concat(other);
  }
}

/** Canonical array index: "0" or digits without a leading zero, below 2^32 - 1 */
function isArrayIndex(key: string): bool {
  if (!isDigits(key) || (key.length > 1 && key.charCodeAt(0) == 0x30) || key.length > 10) {
    return false;
  }
  return parseFloat(key) < 4294967295.0;
}

// ---------------------------------------------------------------------------
// Text builder
// ---------------------------------------------------------------------------

/**
 * Appends lines to a raw UTF-16 buffer. A growing `string[]` is slow under the incremental
 * GC (a large array that keeps changing is rescanned again and again); the buffer holds no
 * references, so the collector never scans it.
 */
export class Lines {
  private buffer: ArrayBuffer = new ArrayBuffer(4096);
  private length: i32 = 0;

  private append(s: string): void {
    const bytes = s.length << 1;
    if (this.length + bytes > this.buffer.byteLength) {
      let capacity = this.buffer.byteLength << 1;
      while (capacity < this.length + bytes) {
        capacity <<= 1;
      }
      const grown = new ArrayBuffer(capacity);
      memory.copy(changetype<usize>(grown), changetype<usize>(this.buffer), <usize>this.length);
      this.buffer = grown;
    }
    memory.copy(changetype<usize>(this.buffer) + <usize>this.length, changetype<usize>(s), <usize>bytes);
    this.length += bytes;
  }

  /** Appends `line` and CRLF */
  push(line: string): void {
    this.append(line);
    this.append('\r\n');
  }

  toString(): string {
    return String.UTF16.decodeUnsafe(changetype<usize>(this.buffer), <usize>this.length);
  }
}
