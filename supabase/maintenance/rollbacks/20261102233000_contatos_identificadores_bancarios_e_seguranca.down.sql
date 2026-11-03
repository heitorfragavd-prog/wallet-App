-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK: 20261102233000_contatos_identificadores_bancarios_e_seguranca.down.sql
-- ─────────────────────────────────────────────────────────────────────────────

drop trigger if exists trg_normalizar_contato_identificadores on public.contatos;
drop function if exists public.normalizar_contato_identificadores();

drop index if exists public.idx_contatos_workspace_pix_norm;
drop index if exists public.idx_contatos_workspace_doc_norm;
drop index if exists public.idx_contatos_workspace_cnpj_cpf;
drop index if exists public.idx_divipay_conciliacoes_contato;
drop index if exists public.idx_divipay_conciliacoes_colaborador;

alter table public.divipay_conciliacoes
  drop column if exists beneficiario_tipo,
  drop column if exists contato_id,
  drop column if exists colaborador_id,
  drop column if exists acerto_id,
  drop column if exists categoria_id,
  drop column if exists subcategoria_id,
  drop column if exists metodo_pagamento,
  drop column if exists origem_evidencia,
  drop column if exists linha_digitavel,
  drop column if exists codigo_barras,
  drop column if exists competencia,
  drop column if exists comprovante_url,
  drop column if exists valor_aplicado,
  drop column if exists saldo_remanescente,
  drop column if exists revisado_por,
  drop column if exists revisado_em,
  drop column if exists motivo_revisao;

alter table public.contatos
  drop column if exists nome_fantasia,
  drop column if exists categoria_padrao_id,
  drop column if exists subcategoria_padrao_id,
  drop column if exists ativo,
  drop column if exists pix_chave,
  drop column if exists pix_tipo,
  drop column if exists pix_chave_normalizada,
  drop column if exists beneficiario_documento,
  drop column if exists beneficiario_documento_normalizado,
  drop column if exists beneficiario_nome,
  drop column if exists chaves_pix_adicionais,
  drop column if exists identificadores_boletos,
  drop column if exists historico_identificadores,
  drop column if exists updated_at;
