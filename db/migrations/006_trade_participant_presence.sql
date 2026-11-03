-- Soft-remove lounge bots; auto-hide uses last_seen (updated on bot check-in).

ALTER TABLE trade_participants ADD COLUMN IF NOT EXISTS removed_at timestamptz;
