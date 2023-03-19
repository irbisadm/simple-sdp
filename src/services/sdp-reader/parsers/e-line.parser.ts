export const eLineParser = (line: string): string => {
  return line.replace('e=', '');
}