-- GVEGAS GRIDIRON trade room (rooms, guest keys, bot chat, structured offers).

CREATE TABLE IF NOT EXISTS trade_rooms (
  id           text PRIMARY KEY,
  name         text NOT NULL CHECK (char_length(name) <= 80),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_room_keys (
  id         text PRIMARY KEY,
  room_id    text NOT NULL REFERENCES trade_rooms (id) ON DELETE CASCADE,
  label      text NOT NULL CHECK (char_length(label) <= 80),
  key_hash   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS trade_room_keys_hash_idx ON trade_room_keys (key_hash) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS trade_participants (
  id         text PRIMARY KEY,
  room_id    text NOT NULL REFERENCES trade_rooms (id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) <= 64),
  status     text NOT NULL DEFAULT 'online' CHECK (char_length(status) <= 80),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_participants_room_idx ON trade_participants (room_id);

CREATE TABLE IF NOT EXISTS trade_messages (
  id              bigserial PRIMARY KEY,
  room_id         text NOT NULL REFERENCES trade_rooms (id) ON DELETE CASCADE,
  participant_id  text REFERENCES trade_participants (id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN ('chat', 'system', 'offer')),
  body            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_messages_room_cursor_idx ON trade_messages (room_id, id);

CREATE TABLE IF NOT EXISTS trade_offers (
  id                  text PRIMARY KEY,
  room_id             text NOT NULL REFERENCES trade_rooms (id) ON DELETE CASCADE,
  message_id          bigint REFERENCES trade_messages (id) ON DELETE SET NULL,
  from_participant_id text NOT NULL REFERENCES trade_participants (id) ON DELETE CASCADE,
  give                jsonb NOT NULL,
  want                jsonb NOT NULL,
  state               text NOT NULL CHECK (state IN ('open', 'rejected', 'countered', 'agreed')),
  parent_offer_id     text REFERENCES trade_offers (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_offers_room_idx ON trade_offers (room_id, state);
