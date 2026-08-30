-- ONE-TIME CLEANUP: run this once in Supabase SQL Editor to remove old
-- "Billed" orders that piled up before the auto-cleanup fix was deployed.
--
-- Safe to run: your revenue history is NOT affected — that lives in a
-- separate local sales log used by the Reports tab, not in this table.
-- This only removes old completed-order rows that were just sitting here
-- unused, taking up space and cluttering the "All" filter.

DELETE FROM orders WHERE status = 'Billed';
