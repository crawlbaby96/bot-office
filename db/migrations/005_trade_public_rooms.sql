-- Drop unguessable watch tokens; trade rooms are public by id.

ALTER TABLE trade_rooms DROP COLUMN IF EXISTS watch_token;
