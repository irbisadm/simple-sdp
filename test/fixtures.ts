import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, 'fixtures');

/** Names (without .sdp) of all fixtures */
export const fixtureNames = (): string[] =>
  fs.readdirSync(dir).filter(f => f.endsWith('.sdp')).map(f => f.replace(/\.sdp$/, '')).sort();

export const loadFixture = (name: string): string => fs.readFileSync(path.join(dir, `${name}.sdp`), 'utf8');
