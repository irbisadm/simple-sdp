import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, 'fixtures-lenient');

/** Names (without .sdp) of the hand-made lenient fixtures */
export const lenientFixtureNames = (): string[] =>
  fs.readdirSync(dir).filter(f => f.endsWith('.sdp')).map(f => f.replace(/\.sdp$/, '')).sort();

export const loadLenientFixture = (name: string): string => fs.readFileSync(path.join(dir, `${name}.sdp`), 'utf8');
