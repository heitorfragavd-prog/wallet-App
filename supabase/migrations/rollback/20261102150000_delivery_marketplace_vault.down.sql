-- ==============================================================================
-- ROLLBACK: 20261102150000_delivery_marketplace_vault.down.sql
-- Submódulo: Delivery Marketplaces (iFood / 99Food)
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.record_delivery_channel_test_atomic(UUID, TEXT, TEXT, BOOLEAN, INT, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.save_delivery_channel_vault_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.disconnect_delivery_marketplace(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_delivery_channel_metadata(UUID, TEXT);
DROP TABLE IF EXISTS public.delivery_channel_secrets CASCADE;

COMMIT;
