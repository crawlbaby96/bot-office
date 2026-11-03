import { json, requireSession } from '../../../lib/http.js';
import { getTradeStore } from '../../../lib/trade/index.js';
import { listManagers } from '../../../lib/trade/managers.js';
import { isParticipantVisible } from '../../../lib/trade/participants.js';
import { loungePublicMeta } from '../../../lib/trade/lounge-room.js';

/** Staff: lounge metadata, guest keys, and lounge participants. */
export async function GET(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const trade = await getTradeStore();
  const lounge = await loungePublicMeta(trade);
  const now = new Date();
  const keys = (await trade.listKeys(lounge.id)).map(({ id, label, createdAt, revokedAt }) => ({
    id,
    label,
    createdAt,
    revoked: !!revokedAt,
  }));
  const participants = (await trade.listParticipants(lounge.id)).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    lastSeen: p.lastSeen,
    joinedAt: p.joinedAt,
    removed: !!p.removedAt,
    visible: isParticipantVisible(p, now),
    managerPhoto: p.managerPhoto ?? null,
  }));
  return json({ lounge, keys, participants, managers: listManagers() });
}
