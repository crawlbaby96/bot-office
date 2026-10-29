-- Cursor Cloud Agents snapshots ("contractors"), written by the 5-minute heartbeat cron. One row per fetch attempt.
-- Only short, sanitized fields are stored per agent: id, short title, repo name, run state, start time.
-- Prompts, branches, PR links and summaries are never stored. Safe to re-run.

CREATE TABLE IF NOT EXISTS cloud_agent_snapshots (
  id              bigserial PRIMARY KEY,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  outcome         text NOT NULL CHECK (outcome IN ('ok', 'refused', 'error')),
  detail          text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 200),
  running         integer CHECK (running >= 0),
  running_at_least boolean NOT NULL DEFAULT false,
  agents          jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS cloud_agent_snapshots_checked_at_idx ON cloud_agent_snapshots (checked_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS cloud_agent_snapshots_ok_idx ON cloud_agent_snapshots (checked_at DESC, id DESC) WHERE outcome = 'ok';
