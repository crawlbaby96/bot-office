-- Usage/cost readings from the AI providers' official admin APIs (Cursor, OpenAI, Anthropic), written by the hourly
-- usage cron. One row per fetch attempt per provider. `metrics` holds the aggregated totals only. Safe to re-run.

CREATE TABLE IF NOT EXISTS provider_usage_readings (
  id        bigserial PRIMARY KEY,
  provider  text NOT NULL CHECK (provider IN ('cursor', 'openai', 'anthropic')),
  outcome   text NOT NULL CHECK (outcome IN ('ok', 'refused', 'error')),
  detail    text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 200),
  metrics   jsonb,
  read_at   timestamptz NOT NULL,
  CONSTRAINT provider_usage_readings_ok_has_metrics CHECK (outcome <> 'ok' OR metrics IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS provider_usage_readings_provider_idx ON provider_usage_readings (provider, read_at DESC, id DESC);
