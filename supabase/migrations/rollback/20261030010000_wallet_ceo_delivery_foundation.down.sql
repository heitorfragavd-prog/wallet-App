-- ==============================================================================
-- ROLLBACK: 20261030010000_wallet_ceo_delivery_foundation.down.sql
-- ==============================================================================

BEGIN;

DROP TABLE IF EXISTS public.delivery_order_items CASCADE;
DROP TABLE IF EXISTS public.delivery_orders CASCADE;
DROP TABLE IF EXISTS public.delivery_catalog_items CASCADE;
DROP TABLE IF EXISTS public.delivery_channels CASCADE;
DROP TABLE IF EXISTS public.wallet_commercial_experiments CASCADE;
DROP TABLE IF EXISTS public.wallet_growth_opportunities CASCADE;

COMMIT;
