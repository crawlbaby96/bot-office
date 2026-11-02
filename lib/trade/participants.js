/** Bots with no check-in for this long are hidden from the live lounge (still in history). */
export const PARTICIPANT_HIDE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isParticipantVisible(participant, now = new Date()) {
  if (participant.removedAt) return false;
  const last = Date.parse(participant.lastSeen);
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last < PARTICIPANT_HIDE_AFTER_MS;
}

export function filterVisibleParticipants(participants, now = new Date()) {
  return participants.filter((p) => isParticipantVisible(p, now));
}
