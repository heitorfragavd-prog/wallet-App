-- ==============================================================================
-- ROLLBACK: 20261102140000_delivery_marketplace_vault.down.sql
-- Submódulo: Delivery Marketplaces (iFood / 99Food)
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.disconnect_delivery_marketplace(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_delivery_channel_metadata(UUID, TEXT);
DROP TABLE IF EXISTS public.delivery_channel_secrets CASCADE;

COMMIT;
