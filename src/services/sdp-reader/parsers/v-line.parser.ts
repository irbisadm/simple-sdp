export const vLineParser = (line: string): number => {
  return parseInt(line.replace('v=', ''));
}