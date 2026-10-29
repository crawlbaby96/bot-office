-- Bot Office schema. Run with `npm run db:migrate` (or paste into the Neon SQL editor).
-- Tables start empty: the office only ever shows statuses and usage readings that were actually pushed.

CREATE TABLE IF NOT EXISTS bot_status (
  bot_id      text PRIMARY KEY,
  state       text NOT NULL CHECK (state IN ('working', 'waiting', 'error', 'done', 'idle')),
  message     text NOT NULL DEFAULT '' CHECK (char_length(message) <= 80),
  handoff_to  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS status_events (
  id          bigserial PRIMARY KEY,
  bot_id      text NOT NULL,
  state       text NOT NULL,
  message     text NOT NULL DEFAULT '',
  handoff_to  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS status_events_created_at_idx ON status_events (created_at DESC);

CREATE TABLE IF NOT EXISTS usage_readings (
  id           bigserial PRIMARY KEY,
  percent_left numeric(5, 2) NOT NULL CHECK (percent_left >= 0 AND percent_left <= 100),
  used         numeric,
  usage_limit  numeric,
  resets_at    timestamptz,
  read_at      timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_readings_read_at_idx ON usage_readings (read_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS feed_heartbeats (
  id            bigserial PRIMARY KEY,
  checked_at    timestamptz NOT NULL DEFAULT now(),
  ok            boolean NOT NULL,
  last_push_at  timestamptz,
  detail        text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS feed_heartbeats_checked_at_idx ON feed_heartbeats (checked_at DESC, id DESC);
