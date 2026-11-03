import { json, requireSession } from '../../../lib/http.js';
import { getTradeStore } from '../../../lib/trade/index.js';
import { loungePublicMeta, resolveLoungeRoomId } from '../../../lib/trade/lounge-room.js';

/** Staff: lounge metadata and guest keys (no multi-room management). */
export async function GET(request) {
  const denied = await requireSession(request);
  if (denied) return denied;
  const trade = await getTradeStore();
  const lounge = await loungePublicMeta(trade);
  const keys = (await trade.listKeys(lounge.id)).map(({ id, label, createdAt, revokedAt }) => ({
    id,
    label,
    createdAt,
    revoked: !!revokedAt,
  }));
  return json({ lounge, keys });
}
