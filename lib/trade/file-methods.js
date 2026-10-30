import { hashGuestKey } from './keys.js';
import { newGuestKeyPlaintext, newKeyId, newOfferId, newParticipantId, newRoomId } from './ids.js';
import { LIMITS } from './limits.js';
import { transitionAccept, transitionCounter, transitionReject, validateOfferPayload } from './offers.js';

function emptyTrade() {
  return { rooms: {}, keys: {}, participants: {}, messages: [], offers: {}, nextMessageId: 1 };
}

export function tradeFromFileData(data) {
  if (!data.trade) data.trade = emptyTrade();
  return data.trade;
}

export function createTradeFileMethods(reload, getData, save) {
  const t = () => tradeFromFileData(getData());
  const wrap = (fn) => async (...args) => {
    reload();
    return fn(...args);
  };

  return {
    listRooms: wrap(async () => Object.values(t().rooms).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))),

    createRoom: wrap(async (name) => {
      const id = newRoomId();
      const room = { id, name, createdAt: new Date().toISOString() };
      t().rooms[id] = room;
      save();
      return room;
    }),

    deleteRoom: wrap(async (roomId) => {
      const tr = t();
      if (!tr.rooms[roomId]) return null;
      delete tr.rooms[roomId];
      tr.keys = Object.fromEntries(Object.entries(tr.keys).filter(([, k]) => k.roomId !== roomId));
      tr.participants = Object.fromEntries(Object.entries(tr.participants).filter(([, p]) => p.roomId !== roomId));
      tr.messages = tr.messages.filter((m) => m.roomId !== roomId);
      tr.offers = Object.fromEntries(Object.entries(tr.offers).filter(([, o]) => o.roomId !== roomId));
      save();
      return roomId;
    }),

    getRoomById: wrap(async (roomId) => t().rooms[roomId] ?? null),

    listKeys: wrap(async (roomId) =>
      Object.values(t().keys)
        .filter((k) => k.roomId === roomId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    ),

    createKey: wrap(async (roomId, label) => {
      const plaintext = newGuestKeyPlaintext();
      const id = newKeyId();
      const key = {
        id,
        roomId,
        label,
        keyHash: hashGuestKey(plaintext),
        createdAt: new Date().toISOString(),
        revokedAt: null,
      };
      t().keys[id] = key;
      save();
      return { key, plaintext };
    }),

    revokeKey: wrap(async (roomId, keyId) => {
      const k = t().keys[keyId];
      if (!k || k.roomId !== roomId || k.revokedAt) return null;
      k.revokedAt = new Date().toISOString();
      save();
      return { ...k };
    }),

    listActiveKeyRows: wrap(async () => Object.values(t().keys).filter((k) => !k.revokedAt)),

    getKeyRow: wrap(async (keyId) => t().keys[keyId] ?? null),

    joinParticipant: wrap(async (roomId, name) => {
      const tr = t();
      const id = newParticipantId();
      const p = {
        id,
        roomId,
        name,
        status: 'online',
        joinedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      };
      tr.participants[id] = p;
      tr.messages.push({
        id: tr.nextMessageId++,
        roomId,
        participantId: id,
        kind: 'system',
        body: { text: `${name} joined` },
        createdAt: new Date().toISOString(),
      });
      save();
      return p;
    }),

    getParticipant: wrap(async (id, roomId) => {
      const p = t().participants[id];
      return p && p.roomId === roomId ? p : null;
    }),

    setParticipantStatus: wrap(async (roomId, participantId, status) => {
      const p = t().participants[participantId];
      if (!p || p.roomId !== roomId) return null;
      p.status = status;
      p.lastSeen = new Date().toISOString();
      save();
      return { ...p };
    }),

    listParticipants: wrap(async (roomId) =>
      Object.values(t().participants)
        .filter((p) => p.roomId === roomId)
        .sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt)),
    ),

    messageCount: wrap(async (roomId) => t().messages.filter((m) => m.roomId === roomId).length),

    appendChat: wrap(async (roomId, participantId, text) => {
      const tr = t();
      const msg = {
        id: tr.nextMessageId++,
        roomId,
        participantId,
        kind: 'chat',
        body: { text },
        createdAt: new Date().toISOString(),
      };
      tr.messages.push(msg);
      save();
      return msg;
    }),

    appendOfferMessage: wrap(async (roomId, participantId, offerId) => {
      const tr = t();
      const msg = {
        id: tr.nextMessageId++,
        roomId,
        participantId,
        kind: 'offer',
        body: { offerId },
        createdAt: new Date().toISOString(),
      };
      tr.messages.push(msg);
      save();
      return msg;
    }),

    readMessages: wrap(async (roomId, sinceId = 0) => t().messages.filter((m) => m.roomId === roomId && m.id > sinceId).slice(0, 200)),

    createOffer: wrap(async (roomId, fromParticipantId, { give, want, parentOfferId = null, messageId = null }) => {
      const id = newOfferId();
      const now = new Date().toISOString();
      const offer = {
        id,
        roomId,
        messageId,
        fromParticipantId,
        give,
        want,
        state: 'open',
        parentOfferId,
        createdAt: now,
        updatedAt: now,
      };
      t().offers[id] = offer;
      save();
      return offer;
    }),

    getOffer: wrap(async (roomId, offerId) => {
      const o = t().offers[offerId];
      return o && o.roomId === roomId ? o : null;
    }),

    updateOfferState: wrap(async (roomId, offerId, state, now = new Date()) => {
      const o = t().offers[offerId];
      if (!o || o.roomId !== roomId) return null;
      o.state = state;
      o.updatedAt = now.toISOString();
      save();
      return { ...o };
    }),

    listOffers: wrap(async (roomId) =>
      Object.values(t().offers)
        .filter((o) => o.roomId === roomId)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    ),

    roomSnapshot: wrap(async (roomId) => {
      const tr = t();
      const room = tr.rooms[roomId];
      if (!room) return null;
      return {
        room: { id: room.id, name: room.name },
        participants: Object.values(tr.participants)
          .filter((p) => p.roomId === roomId)
          .sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt)),
        messages: tr.messages.filter((m) => m.roomId === roomId).slice(0, 200),
        offers: Object.values(tr.offers)
          .filter((o) => o.roomId === roomId)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      };
    }),

    validateOfferPayload,
    transitionAccept,
    transitionReject,
    transitionCounter,
    limits: LIMITS,
  };
}
