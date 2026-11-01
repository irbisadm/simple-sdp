import {stringToIntParser} from "./string-to-int.parser";

export const lineTimeParser = (lTime: string): number => {
  const allowedSfx = {'d': 86400, 'h': 3600, 'm': 60, 's': 1} as const; // RFC 8866 §5.10, Table 1
  if(Object.keys(allowedSfx).includes(lTime.slice(-1))){
    const sfx = lTime.slice(-1) as keyof typeof allowedSfx;
    const timeString = lTime.slice(0,lTime.length-1);
    const timeData = stringToIntParser(timeString);
    return allowedSfx[sfx]*timeData;
  }
  return stringToIntParser(lTime);
}