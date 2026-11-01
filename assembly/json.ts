// Minimal JSON support: a DOM parser (for model input) and an object builder (for output).

import {fail, fmtNum, isDigit} from './util';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const HEX = '0123456789abcdef';

/** `JSON.stringify(s)`. Escapes are collected as parts: `out +=` per escape would copy the
 * output once per line of an SDP text (quadratic). */
export function quote(s: string): string {
  let parts: string[] | null = null;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x20 && c != 0x22 && c != 0x5c && (c < 0xd800 || c > 0xdfff)) {
      continue;
    }
    let esc: string | null = null;
    if (c == 0x22) {
      esc = '\\"';
    } else if (c == 0x5c) {
      esc = '\\\\';
    } else if (c == 0x08) {
      esc = '\\b';
    } else if (c == 0x0c) {
      esc = '\\f';
    } else if (c == 0x0a) {
      esc = '\\n';
    } else if (c == 0x0d) {
      esc = '\\r';
    } else if (c == 0x09) {
      esc = '\\t';
    } else if (c < 0x20 || isLoneSurrogate(s, i)) {
      esc = '\\u' + HEX.charAt((c >> 12) & 15) + HEX.charAt((c >> 8) & 15) + HEX.charAt((c >> 4) & 15) + HEX.charAt(c & 15);
    }
    if (esc !== null) {
      if (parts === null) {
        parts = ['"'];
      }
      parts.push(s.slice(start, i));
      parts.push(esc);
      start = i + 1;
    }
  }
  if (parts === null) {
    return '"' + s + '"';
  }
  parts.push(s.slice(start));
  parts.push('"');
  return parts.join('');
}

function isLoneSurrogate(s: string, i: i32): bool {
  const c = s.charCodeAt(i);
  if (c >= 0xd800 && c <= 0xdbff) {
    const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
    return !(next >= 0xdc00 && next <= 0xdfff);
  }
  if (c >= 0xdc00 && c <= 0xdfff) {
    const prev = i > 0 ? s.charCodeAt(i - 1) : 0;
    return !(prev >= 0xd800 && prev <= 0xdbff);
  }
  return false;
}

/** Builds a JSON object; fields are added in call order */
export class JsonObject {
  private parts: string[] = [];

  raw(key: string, json: string): JsonObject {
    this.parts.push(quote(key) + ':' + json);
    return this;
  }

  str(key: string, value: string): JsonObject {
    return this.raw(key, quote(value));
  }

  /** Skipped if null */
  optStr(key: string, value: string | null): JsonObject {
    return value === null ? this : this.str(key, value);
  }

  num(key: string, value: f64): JsonObject {
    return this.raw(key, fmtNum(value));
  }

  /** Skipped if NaN (absent) */
  optNum(key: string, value: f64): JsonObject {
    return isNaN(value) ? this : this.num(key, value);
  }

  /** Written as `true` if set, skipped otherwise */
  flag(key: string, value: bool): JsonObject {
    return value ? this.raw(key, 'true') : this;
  }

  /** Skipped if null */
  optRaw(key: string, json: string | null): JsonObject {
    return json === null ? this : this.raw(key, json);
  }

  toString(): string {
    return '{' + this.parts.join(',') + '}';
  }
}

export function strArray(list: string[]): string {
  const parts = new Array<string>(list.length);
  for (let i = 0; i < list.length; i++) {
    parts[i] = quote(list[i]);
  }
  return '[' + parts.join(',') + ']';
}

export function numArray(list: f64[]): string {
  const parts = new Array<string>(list.length);
  for (let i = 0; i < list.length; i++) {
    parts[i] = fmtNum(list[i]);
  }
  return '[' + parts.join(',') + ']';
}

export function jsonArray(items: string[]): string {
  return '[' + items.join(',') + ']';
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const enum Kind {
  Null,
  Bool,
  Num,
  Str,
  Arr,
  Obj,
}

export class JsonValue {
  kind: Kind = Kind.Null;
  b: bool = false;
  n: f64 = 0;
  s: string = '';
  items: JsonValue[] = [];
  keys: string[] = [];
  values: JsonValue[] = [];

  /** Member of an object; null if absent or if this is not an object */
  get(key: string): JsonValue | null {
    const idx = this.keys.indexOf(key);
    return idx == -1 ? null : this.values[idx];
  }

  kindName(): string {
    switch (this.kind) {
      case Kind.Null: return 'null';
      case Kind.Bool: return 'a boolean';
      case Kind.Num: return 'a number';
      case Kind.Str: return 'a string';
      case Kind.Arr: return 'an array';
      default: return 'an object';
    }
  }
}

const MAX_DEPTH = 256;

class JsonParser {
  pos: i32 = 0;

  constructor(public text: string) {}

  error(what: string): JsonValue | null {
    fail(`invalid JSON: ${what} at position ${this.pos}`);
    return null;
  }

  ws(): void {
    while (this.pos < this.text.length) {
      const c = this.text.charCodeAt(this.pos);
      if (c != 0x20 && c != 0x09 && c != 0x0a && c != 0x0d) {
        break;
      }
      this.pos++;
    }
  }

  peek(): i32 {
    return this.pos < this.text.length ? this.text.charCodeAt(this.pos) : -1;
  }

  literal(word: string): bool {
    if (this.text.substr(this.pos, word.length) == word) {
      this.pos += word.length;
      return true;
    }
    return false;
  }

  value(depth: i32): JsonValue | null {
    if (depth > MAX_DEPTH) {
      return this.error('nesting too deep');
    }
    this.ws();
    const c = this.peek();
    const v = new JsonValue();
    if (c == 0x7b) { // {
      v.kind = Kind.Obj;
      this.pos++;
      this.ws();
      if (this.peek() == 0x7d) {
        this.pos++;
        return v;
      }
      while (true) {
        this.ws();
        if (this.peek() != 0x22) {
          return this.error('expected a string key');
        }
        const key = this.string();
        if (key === null) {
          return null;
        }
        this.ws();
        if (this.peek() != 0x3a) {
          return this.error('expected ":"');
        }
        this.pos++;
        const member = this.value(depth + 1);
        if (member === null) {
          return null;
        }
        const idx = v.keys.indexOf(key);
        if (idx == -1) {
          v.keys.push(key);
          v.values.push(member);
        } else {
          v.values[idx] = member;
        }
        this.ws();
        const next = this.peek();
        this.pos++;
        if (next == 0x7d) {
          return v;
        }
        if (next != 0x2c) {
          this.pos--;
          return this.error('expected "," or "}"');
        }
      }
    }
    if (c == 0x5b) { // [
      v.kind = Kind.Arr;
      this.pos++;
      this.ws();
      if (this.peek() == 0x5d) {
        this.pos++;
        return v;
      }
      while (true) {
        const item = this.value(depth + 1);
        if (item === null) {
          return null;
        }
        v.items.push(item);
        this.ws();
        const next = this.peek();
        this.pos++;
        if (next == 0x5d) {
          return v;
        }
        if (next != 0x2c) {
          this.pos--;
          return this.error('expected "," or "]"');
        }
      }
    }
    if (c == 0x22) {
      const s = this.string();
      if (s === null) {
        return null;
      }
      v.kind = Kind.Str;
      v.s = s;
      return v;
    }
    if (this.literal('true')) {
      v.kind = Kind.Bool;
      v.b = true;
      return v;
    }
    if (this.literal('false')) {
      v.kind = Kind.Bool;
      return v;
    }
    if (this.literal('null')) {
      return v;
    }
    if (c == 0x2d || isDigit(c)) {
      return this.number();
    }
    return this.error('unexpected character');
  }

  number(): JsonValue | null {
    const start = this.pos;
    if (this.peek() == 0x2d) {
      this.pos++;
    }
    if (this.peek() == 0x30) {
      this.pos++;
    } else if (isDigit(this.peek())) {
      while (isDigit(this.peek())) this.pos++;
    } else {
      return this.error('invalid number');
    }
    if (this.peek() == 0x2e) {
      this.pos++;
      if (!isDigit(this.peek())) {
        return this.error('invalid number');
      }
      while (isDigit(this.peek())) this.pos++;
    }
    if (this.peek() == 0x65 || this.peek() == 0x45) {
      this.pos++;
      if (this.peek() == 0x2b || this.peek() == 0x2d) {
        this.pos++;
      }
      if (!isDigit(this.peek())) {
        return this.error('invalid number');
      }
      while (isDigit(this.peek())) this.pos++;
    }
    const v = new JsonValue();
    v.kind = Kind.Num;
    v.n = parseFloat(this.text.slice(start, this.pos));
    return v;
  }

  /** Parses a string starting at the opening quote */
  string(): string | null {
    this.pos++;
    let out = '';
    let start = this.pos;
    while (true) {
      if (this.pos >= this.text.length) {
        this.error('unterminated string');
        return null;
      }
      const c = this.text.charCodeAt(this.pos);
      if (c == 0x22) {
        out += this.text.slice(start, this.pos);
        this.pos++;
        return out;
      }
      if (c < 0x20) {
        this.error('control character in string');
        return null;
      }
      if (c != 0x5c) {
        this.pos++;
        continue;
      }
      out += this.text.slice(start, this.pos);
      this.pos++;
      const e = this.peek();
      this.pos++;
      if (e == 0x22) out += '"';
      else if (e == 0x5c) out += '\\';
      else if (e == 0x2f) out += '/';
      else if (e == 0x62) out += '\b';
      else if (e == 0x66) out += '\f';
      else if (e == 0x6e) out += '\n';
      else if (e == 0x72) out += '\r';
      else if (e == 0x74) out += '\t';
      else if (e == 0x75) {
        let code = 0;
        for (let k = 0; k < 4; k++) {
          const h = this.peek();
          let d = -1;
          if (h >= 0x30 && h <= 0x39) d = h - 0x30;
          else if (h >= 0x41 && h <= 0x46) d = h - 0x41 + 10;
          else if (h >= 0x61 && h <= 0x66) d = h - 0x61 + 10;
          if (d < 0) {
            this.error('invalid \\u escape');
            return null;
          }
          code = code * 16 + d;
          this.pos++;
        }
        out += String.fromCharCode(code);
      } else {
        this.pos--;
        this.error('invalid escape');
        return null;
      }
      start = this.pos;
    }
  }
}

/** Parses a JSON document; returns null and calls fail() on error */
export function parseJson(text: string): JsonValue | null {
  const parser = new JsonParser(text);
  const v = parser.value(0);
  if (v === null) {
    return null;
  }
  parser.ws();
  if (parser.pos != text.length) {
    return parser.error('unexpected trailing data');
  }
  return v;
}
