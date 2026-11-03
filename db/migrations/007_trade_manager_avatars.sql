-- Link bots to guest keys and optional GVEGAS manager portrait.

ALTER TABLE trade_room_keys ADD COLUMN IF NOT EXISTS manager_photo text;

ALTER TABLE trade_participants ADD COLUMN IF NOT EXISTS guest_key_id text REFERENCES trade_room_keys (id) ON DELETE SET NULL;
ALTER TABLE trade_participants ADD COLUMN IF NOT EXISTS manager_photo text;
