-- REPLICA IDENTITY FULL ensures DELETE (and UPDATE) realtime events include
-- the complete old row, not just the primary key. Without this, Postgres'
-- default behavior only guarantees the primary key column is present in a
-- DELETE event's payload — any other column read from it (like table_number)
-- can silently be undefined, breaking realtime delete sync across devices.

ALTER TABLE orders REPLICA IDENTITY FULL;
