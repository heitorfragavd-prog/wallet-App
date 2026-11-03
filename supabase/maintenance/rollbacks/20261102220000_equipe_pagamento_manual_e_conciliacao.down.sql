-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: 20261102220000_equipe_pagamento_manual_e_conciliacao.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.registrar_pagamento_colaborador_manual(
  uuid, text, date, date, numeric, timestamptz, text, text, text, text, uuid, uuid
);

alter table public.colaborador_acertos
  drop constraint if exists colaborador_acertos_tipo_check;

alter table public.colaborador_acertos
  add constraint colaborador_acertos_tipo_check check (
    tipo in ('semanal_funcionario', 'semanal_folguista', 'salario', 'pro_labore')
  );
