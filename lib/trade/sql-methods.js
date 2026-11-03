import { hashGuestKey } from './keys.js';
import { newGuestKeyPlaintext, newKeyId, newOfferId, newParticipantId, newRoomId } from './ids.js';
import { LIMITS } from './limits.js';
import { transitionAccept, transitionCounter, transitionReject, validateOfferPayload } from './offers.js';
import { filterVisibleParticipants } from './participants.js';

const iso = (v) => (v == null ? null : new Date(v).toISOString());
const PARTICIPANT_COLS =
  'id, room_id, name, status, joined_at, last_seen, removed_at, guest_key_id, manager_photo';
const jsonValue = (v) => (typeof v === 'string' ? JSON.parse(v) : v ?? null);

function roomRow(r) {
  return { id: r.id, name: r.name, createdAt: iso(r.created_at) };
}

function keyRow(r) {
  return {
    id: r.id,
    roomId: r.room_id,
    label: r.label,
    keyHash: r.key_hash,
    createdAt: iso(r.created_at),
    revokedAt: iso(r.revoked_at),
    managerPhoto: r.manager_photo ?? null,
  };
}

function participantRow(r) {
  return {
    id: r.id,
    roomId: r.room_id,
    name: r.name,
    status: r.status,
    joinedAt: iso(r.joined_at),
    lastSeen: iso(r.last_seen),
    removedAt: iso(r.removed_at),
    guestKeyId: r.guest_key_id ?? null,
    managerPhoto: r.manager_photo ?? null,
  };
}

function messageRow(r) {
  return {
    id: Number(r.id),
    roomId: r.room_id,
    participantId: r.participant_id,
    kind: r.kind,
    body: jsonValue(r.body) ?? {},
    createdAt: iso(r.created_at),
  };
}

function offerRow(r) {
  return {
    id: r.id,
    roomId: r.room_id,
    messageId: r.message_id == null ? null : Number(r.message_id),
    fromParticipantId: r.from_participant_id,
    give: jsonValue(r.give) ?? [],
    want: jsonValue(r.want) ?? [],
    state: r.state,
    parentOfferId: r.parent_offer_id,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export function createTradeSqlMethods(sql) {
  return {
    async listRooms() {
      const rows = await sql`SELECT id, name, created_at FROM trade_rooms ORDER BY created_at DESC`;
      return rows.map(roomRow);
    },

    async createRoom(name) {
      const id = newRoomId();
      const rows = await sql`
        INSERT INTO trade_rooms (id, name)
        VALUES (${id}, ${name})
        RETURNING id, name, created_at`;
      return roomRow(rows[0]);
    },

    async deleteRoom(roomId) {
      const rows = await sql`DELETE FROM trade_rooms WHERE id = ${roomId} RETURNING id`;
      return rows[0]?.id ?? null;
    },

    async getRoomById(roomId) {
      const rows = await sql`SELECT id, name, created_at FROM trade_rooms WHERE id = ${roomId}`;
      return rows[0] ? roomRow(rows[0]) : null;
    },

    async listKeys(roomId) {
      const rows = await sql`
        SELECT id, room_id, label, key_hash, created_at, revoked_at, manager_photo
        FROM trade_room_keys WHERE room_id = ${roomId} ORDER BY created_at DESC`;
      return rows.map(keyRow);
    },

    async createKey(roomId, label) {
      const plaintext = newGuestKeyPlaintext();
      const id = newKeyId();
      const keyHash = hashGuestKey(plaintext);
      const rows = await sql`
        INSERT INTO trade_room_keys (id, room_id, label, key_hash)
        VALUES (${id}, ${roomId}, ${label}, ${keyHash})
        RETURNING id, room_id, label, key_hash, created_at, revoked_at, manager_photo`;
      return { key: keyRow(rows[0]), plaintext };
    },

    async revokeKey(roomId, keyId) {
      const rows = await sql`
        UPDATE trade_room_keys SET revoked_at = now()
        WHERE id = ${keyId} AND room_id = ${roomId} AND revoked_at IS NULL
        RETURNING id, room_id, label, key_hash, created_at, revoked_at, manager_photo`;
      return rows[0] ? keyRow(rows[0]) : null;
    },

    async listActiveKeyRows() {
      const rows = await sql`
        SELECT id, room_id, label, key_hash, created_at, revoked_at, manager_photo
        FROM trade_room_keys WHERE revoked_at IS NULL`;
      return rows.map(keyRow);
    },

    async getKeyRow(keyId) {
      const rows = await sql`
        SELECT id, room_id, label, key_hash, created_at, revoked_at, manager_photo FROM trade_room_keys WHERE id = ${keyId}`;
      return rows[0] ? keyRow(rows[0]) : null;
    },

    async joinParticipant(roomId, name, { guestKeyId = null, managerPhoto = null } = {}) {
      const id = newParticipantId();
      const rows = await sql`
        INSERT INTO trade_participants (id, room_id, name, guest_key_id, manager_photo)
        VALUES (${id}, ${roomId}, ${name}, ${guestKeyId}, ${managerPhoto})
        RETURNING id, room_id, name, status, joined_at, last_seen, removed_at, guest_key_id, manager_photo`;
      await sql`
        INSERT INTO trade_messages (room_id, participant_id, kind, body)
        VALUES (${roomId}, ${id}, 'system', ${JSON.stringify({ text: `${name} joined` })}::jsonb)`;
      return participantRow(rows[0]);
    },

    async getParticipant(id, roomId) {
      const rows = await sql.unsafe(
        `SELECT ${PARTICIPANT_COLS} FROM trade_participants WHERE id = $1 AND room_id = $2`,
        [id, roomId],
      );
      return rows[0] ? participantRow(rows[0]) : null;
    },

    async touchParticipant(roomId, participantId) {
      const rows = await sql.unsafe(
        `UPDATE trade_participants SET last_seen = now(), removed_at = NULL
         WHERE id = $1 AND room_id = $2
         RETURNING ${PARTICIPANT_COLS}`,
        [participantId, roomId],
      );
      return rows[0] ? participantRow(rows[0]) : null;
    },

    async removeParticipant(roomId, participantId) {
      const rows = await sql.unsafe(
        `UPDATE trade_participants SET removed_at = now()
         WHERE id = $1 AND room_id = $2 AND removed_at IS NULL
         RETURNING ${PARTICIPANT_COLS}`,
        [participantId, roomId],
      );
      return rows[0] ? participantRow(rows[0]) : null;
    },

    async setParticipantManager(roomId, participantId, managerPhoto) {
      const existing = await this.getParticipant(participantId, roomId);
      if (!existing) return null;
      const rows = await sql.unsafe(
        `UPDATE trade_participants SET manager_photo = $1
         WHERE id = $2 AND room_id = $3
         RETURNING ${PARTICIPANT_COLS}`,
        [managerPhoto, participantId, roomId],
      );
      if (existing.guestKeyId) {
        await sql`UPDATE trade_room_keys SET manager_photo = ${managerPhoto} WHERE id = ${existing.guestKeyId}`;
      }
      return rows[0] ? participantRow(rows[0]) : null;
    },

    async setParticipantStatus(roomId, participantId, status) {
      const rows = await sql.unsafe(
        `UPDATE trade_participants SET status = $1, last_seen = now(), removed_at = NULL
         WHERE id = $2 AND room_id = $3
         RETURNING ${PARTICIPANT_COLS}`,
        [status, participantId, roomId],
      );
      return rows[0] ? participantRow(rows[0]) : null;
    },

    async listParticipants(roomId) {
      const rows = await sql.unsafe(
        `SELECT ${PARTICIPANT_COLS} FROM trade_participants WHERE room_id = $1 ORDER BY joined_at ASC`,
        [roomId],
      );
      return rows.map(participantRow);
    },

    async listVisibleParticipants(roomId, now = new Date()) {
      const all = await this.listParticipants(roomId);
      return filterVisibleParticipants(all, now);
    },

    async messageCount(roomId) {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM trade_messages WHERE room_id = ${roomId}`;
      return n;
    },

    async appendChat(roomId, participantId, text) {
      const rows = await sql`
        INSERT INTO trade_messages (room_id, participant_id, kind, body)
        VALUES (${roomId}, ${participantId}, 'chat', ${JSON.stringify({ text })}::jsonb)
        RETURNING id, room_id, participant_id, kind, body, created_at`;
      return messageRow(rows[0]);
    },

    async appendOfferMessage(roomId, participantId, offerId) {
      const rows = await sql`
        INSERT INTO trade_messages (room_id, participant_id, kind, body)
        VALUES (${roomId}, ${participantId}, 'offer', ${JSON.stringify({ offerId })}::jsonb)
        RETURNING id, room_id, participant_id, kind, body, created_at`;
      return messageRow(rows[0]);
    },

    async readMessages(roomId, sinceId = 0) {
      const rows = await sql`
        SELECT id, room_id, participant_id, kind, body, created_at
        FROM trade_messages WHERE room_id = ${roomId} AND id > ${sinceId}
        ORDER BY id ASC LIMIT 200`;
      return rows.map(messageRow);
    },

    async createOffer(roomId, fromParticipantId, { give, want, parentOfferId = null, messageId = null }) {
      const id = newOfferId();
      const rows = await sql`
        INSERT INTO trade_offers (id, room_id, message_id, from_participant_id, give, want, state, parent_offer_id)
        VALUES (${id}, ${roomId}, ${messageId}, ${fromParticipantId}, ${JSON.stringify(give)}::jsonb, ${JSON.stringify(want)}::jsonb, 'open', ${parentOfferId})
        RETURNING id, room_id, message_id, from_participant_id, give, want, state, parent_offer_id, created_at, updated_at`;
      return offerRow(rows[0]);
    },

    async getOffer(roomId, offerId) {
      const rows = await sql`
        SELECT id, room_id, message_id, from_participant_id, give, want, state, parent_offer_id, created_at, updated_at
        FROM trade_offers WHERE id = ${offerId} AND room_id = ${roomId}`;
      return rows[0] ? offerRow(rows[0]) : null;
    },

    async updateOfferState(roomId, offerId, state, now = new Date()) {
      const rows = await sql`
        UPDATE trade_offers SET state = ${state}, updated_at = ${now.toISOString()}::timestamptz
        WHERE id = ${offerId} AND room_id = ${roomId}
        RETURNING id, room_id, message_id, from_participant_id, give, want, state, parent_offer_id, created_at, updated_at`;
      return rows[0] ? offerRow(rows[0]) : null;
    },

    async listOffers(roomId) {
      const rows = await sql`
        SELECT id, room_id, message_id, from_participant_id, give, want, state, parent_offer_id, created_at, updated_at
        FROM trade_offers WHERE room_id = ${roomId} ORDER BY created_at ASC`;
      return rows.map(offerRow);
    },

    async roomSnapshot(roomId) {
      const [room, participants, messages, offers] = await Promise.all([
        this.getRoomById(roomId),
        this.listVisibleParticipants(roomId),
        this.readMessages(roomId, 0),
        this.listOffers(roomId),
      ]);
      if (!room) return null;
      return { room: { id: room.id, name: room.name }, participants, messages, offers };
    },

    validateOfferPayload,
    transitionAccept,
    transitionReject,
    transitionCounter,
    limits: LIMITS,
  };
}
