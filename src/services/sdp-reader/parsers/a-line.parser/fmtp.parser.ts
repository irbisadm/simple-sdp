import {setOwn} from "./helpers";

/**
 * `a=fmtp:<format> <format specific parameters>` — RFC 8866 §6.15.
 * Parameters are `;`-separated `name=value` pairs; whitespace around `;` is dropped.
 * A parameter without `=` maps to null.
 */
export const fmtpParametersParser = (params: string): Record<string, string | null> => {
  const result: Record<string, string | null> = {};
  for (const raw of params.split(';')) {
    const param = raw.trim();
    if (param.length === 0) {
      continue;
    }
    const idx = param.indexOf('=');
    if (idx === -1) {
      setOwn(result, param, null);
    } else {
      setOwn(result, param.slice(0, idx), param.slice(idx + 1));
    }
  }
  return result;
}
