import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROSTER_PATH = join(process.cwd(), 'config', 'roster.json');

let cached = null;

export function getRoster() {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(ROSTER_PATH, 'utf8'));
  if (!Array.isArray(raw.bots) || !raw.lead) throw new Error('config/roster.json must have "lead" and "bots"');
  const bots = raw.bots.map((b) => ({
    id: String(b.id),
    name: String(b.name),
    title: String(b.title ?? ''),
    avatarColor: b.avatarColor ?? null,
    zone: String(b.zone),
    accessory: b.accessory ?? null,
  }));
  const ids = new Set(bots.map((b) => b.id));
  if (!ids.has(raw.lead)) throw new Error('config/roster.json lead id is not in bots');
  cached = { lead: raw.lead, bots, ids };
  return cached;
}

export function publicRoster() {
  const { lead, bots } = getRoster();
  return { lead, bots };
}
