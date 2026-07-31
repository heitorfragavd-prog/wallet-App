-- Backfill: transações órfãs de workspace (vendas PDV Eyemobile e demais)
-- Regra: workspace empresarial (PJ) do dono; fallback para o workspace default.
-- Sem isso, 60k+ vendas ficavam invisíveis no Dashboard/Transações quando
-- um workspace estava ativo (filtro workspace_id = ativo).

UPDATE public.transacoes t
SET workspace_id = COALESCE(
  (SELECT w.id FROM public.workspaces w
   WHERE w.user_id = t.user_id AND w.tipo = 'PJ'
   ORDER BY w.created_at LIMIT 1),
  (SELECT w.id FROM public.workspaces w
   WHERE w.user_id = t.user_id AND w.is_default = true
   ORDER BY w.created_at LIMIT 1)
)
WHERE t.workspace_id IS NULL;
