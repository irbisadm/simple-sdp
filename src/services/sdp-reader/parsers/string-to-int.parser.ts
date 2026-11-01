const isDigits = /^\d+$/;

/** Parses a non-negative decimal integer, rejecting anything else (`"1a"`, `""`, `"-1"`, `"1.5"`). */
const stringToIntParser = (input: string, what = 'value'): number => {
  if (!isDigits.test(input)) {
    throw new Error(`${what} "${input}" is not a non-negative integer`);
  }
  return parseInt(input, 10);
}

export {stringToIntParser}
