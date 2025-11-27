-- Migration: Optimize RLS policies for better performance
-- Issue: Using auth.uid() directly causes re-evaluation per row
-- Solution: Use (select auth.uid()) to evaluate once per query

-- =====================================================
-- CATEGORIAS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own categorias" ON public.categorias;
DROP POLICY IF EXISTS "Users can create their own categorias" ON public.categorias;
DROP POLICY IF EXISTS "Users can update their own categorias" ON public.categorias;
DROP POLICY IF EXISTS "Users can delete their own categorias" ON public.categorias;

CREATE POLICY "Users can view their own categorias" ON public.categorias
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own categorias" ON public.categorias
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own categorias" ON public.categorias
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own categorias" ON public.categorias
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- RECEITAS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own receitas" ON public.receitas;
DROP POLICY IF EXISTS "Users can create their own receitas" ON public.receitas;
DROP POLICY IF EXISTS "Users can update their own receitas" ON public.receitas;
DROP POLICY IF EXISTS "Users can delete their own receitas" ON public.receitas;

CREATE POLICY "Users can view their own receitas" ON public.receitas
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own receitas" ON public.receitas
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own receitas" ON public.receitas
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own receitas" ON public.receitas
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- DESPESAS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own despesas" ON public.despesas;
DROP POLICY IF EXISTS "Users can create their own despesas" ON public.despesas;
DROP POLICY IF EXISTS "Users can update their own despesas" ON public.despesas;
DROP POLICY IF EXISTS "Users can delete their own despesas" ON public.despesas;

CREATE POLICY "Users can view their own despesas" ON public.despesas
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own despesas" ON public.despesas
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own despesas" ON public.despesas
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own despesas" ON public.despesas
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- TRANSACOES
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own transacoes" ON public.transacoes;
DROP POLICY IF EXISTS "Users can create their own transacoes" ON public.transacoes;
DROP POLICY IF EXISTS "Users can update their own transacoes" ON public.transacoes;
DROP POLICY IF EXISTS "Users can delete their own transacoes" ON public.transacoes;

CREATE POLICY "Users can view their own transacoes" ON public.transacoes
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own transacoes" ON public.transacoes
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own transacoes" ON public.transacoes
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own transacoes" ON public.transacoes
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- DIVIDAS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own dividas" ON public.dividas;
DROP POLICY IF EXISTS "Users can create their own dividas" ON public.dividas;
DROP POLICY IF EXISTS "Users can update their own dividas" ON public.dividas;
DROP POLICY IF EXISTS "Users can delete their own dividas" ON public.dividas;

CREATE POLICY "Users can view their own dividas" ON public.dividas
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own dividas" ON public.dividas
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own dividas" ON public.dividas
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own dividas" ON public.dividas
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- CATEGORIAS_METAS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own categorias_metas" ON public.categorias_metas;
DROP POLICY IF EXISTS "Users can create their own categorias_metas" ON public.categorias_metas;
DROP POLICY IF EXISTS "Users can update their own categorias_metas" ON public.categorias_metas;
DROP POLICY IF EXISTS "Users can delete their own categorias_metas" ON public.categorias_metas;

CREATE POLICY "Users can view their own categorias_metas" ON public.categorias_metas
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own categorias_metas" ON public.categorias_metas
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own categorias_metas" ON public.categorias_metas
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own categorias_metas" ON public.categorias_metas
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- METAS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own metas" ON public.metas;
DROP POLICY IF EXISTS "Users can create their own metas" ON public.metas;
DROP POLICY IF EXISTS "Users can update their own metas" ON public.metas;
DROP POLICY IF EXISTS "Users can delete their own metas" ON public.metas;

CREATE POLICY "Users can view their own metas" ON public.metas
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own metas" ON public.metas
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own metas" ON public.metas
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own metas" ON public.metas
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- CATEGORIAS_MERCADO
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own categorias_mercado" ON public.categorias_mercado;
DROP POLICY IF EXISTS "Users can create their own categorias_mercado" ON public.categorias_mercado;
DROP POLICY IF EXISTS "Users can update their own categorias_mercado" ON public.categorias_mercado;
DROP POLICY IF EXISTS "Users can delete their own categorias_mercado" ON public.categorias_mercado;

CREATE POLICY "Users can view their own categorias_mercado" ON public.categorias_mercado
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own categorias_mercado" ON public.categorias_mercado
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own categorias_mercado" ON public.categorias_mercado
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own categorias_mercado" ON public.categorias_mercado
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- ITENS_MERCADO
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own itens_mercado" ON public.itens_mercado;
DROP POLICY IF EXISTS "Users can create their own itens_mercado" ON public.itens_mercado;
DROP POLICY IF EXISTS "Users can update their own itens_mercado" ON public.itens_mercado;
DROP POLICY IF EXISTS "Users can delete their own itens_mercado" ON public.itens_mercado;

CREATE POLICY "Users can view their own itens_mercado" ON public.itens_mercado
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own itens_mercado" ON public.itens_mercado
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own itens_mercado" ON public.itens_mercado
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own itens_mercado" ON public.itens_mercado
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- ORCAMENTOS_MERCADO
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own orcamentos_mercado" ON public.orcamentos_mercado;
DROP POLICY IF EXISTS "Users can create their own orcamentos_mercado" ON public.orcamentos_mercado;
DROP POLICY IF EXISTS "Users can update their own orcamentos_mercado" ON public.orcamentos_mercado;
DROP POLICY IF EXISTS "Users can delete their own orcamentos_mercado" ON public.orcamentos_mercado;

CREATE POLICY "Users can view their own orcamentos_mercado" ON public.orcamentos_mercado
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own orcamentos_mercado" ON public.orcamentos_mercado
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own orcamentos_mercado" ON public.orcamentos_mercado
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own orcamentos_mercado" ON public.orcamentos_mercado
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- VEICULOS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own veiculos" ON public.veiculos;
DROP POLICY IF EXISTS "Users can create their own veiculos" ON public.veiculos;
DROP POLICY IF EXISTS "Users can update their own veiculos" ON public.veiculos;
DROP POLICY IF EXISTS "Users can delete their own veiculos" ON public.veiculos;

CREATE POLICY "Users can view their own veiculos" ON public.veiculos
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own veiculos" ON public.veiculos
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own veiculos" ON public.veiculos
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own veiculos" ON public.veiculos
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- TIPOS_MANUTENCAO
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own tipos_manutencao" ON public.tipos_manutencao;
DROP POLICY IF EXISTS "Users can create their own tipos_manutencao" ON public.tipos_manutencao;
DROP POLICY IF EXISTS "Users can update their own tipos_manutencao" ON public.tipos_manutencao;
DROP POLICY IF EXISTS "Users can delete their own tipos_manutencao" ON public.tipos_manutencao;

CREATE POLICY "Users can view their own tipos_manutencao" ON public.tipos_manutencao
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own tipos_manutencao" ON public.tipos_manutencao
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own tipos_manutencao" ON public.tipos_manutencao
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own tipos_manutencao" ON public.tipos_manutencao
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- MANUTENCOES
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own manutencoes" ON public.manutencoes;
DROP POLICY IF EXISTS "Users can create their own manutencoes" ON public.manutencoes;
DROP POLICY IF EXISTS "Users can update their own manutencoes" ON public.manutencoes;
DROP POLICY IF EXISTS "Users can delete their own manutencoes" ON public.manutencoes;

CREATE POLICY "Users can view their own manutencoes" ON public.manutencoes
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own manutencoes" ON public.manutencoes
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own manutencoes" ON public.manutencoes
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own manutencoes" ON public.manutencoes
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- MANUTENCOES_CUSTOMIZADAS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own manutencoes_customizadas" ON public.manutencoes_customizadas;
DROP POLICY IF EXISTS "Users can create their own manutencoes_customizadas" ON public.manutencoes_customizadas;
DROP POLICY IF EXISTS "Users can update their own manutencoes_customizadas" ON public.manutencoes_customizadas;
DROP POLICY IF EXISTS "Users can delete their own manutencoes_customizadas" ON public.manutencoes_customizadas;

CREATE POLICY "Users can view their own manutencoes_customizadas" ON public.manutencoes_customizadas
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own manutencoes_customizadas" ON public.manutencoes_customizadas
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own manutencoes_customizadas" ON public.manutencoes_customizadas
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own manutencoes_customizadas" ON public.manutencoes_customizadas
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- PLANOS_MANUTENCAO_VEICULO
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own planos_manutencao_veiculo" ON public.planos_manutencao_veiculo;
DROP POLICY IF EXISTS "Users can create their own planos_manutencao_veiculo" ON public.planos_manutencao_veiculo;
DROP POLICY IF EXISTS "Users can update their own planos_manutencao_veiculo" ON public.planos_manutencao_veiculo;
DROP POLICY IF EXISTS "Users can delete their own planos_manutencao_veiculo" ON public.planos_manutencao_veiculo;

CREATE POLICY "Users can view their own planos_manutencao_veiculo" ON public.planos_manutencao_veiculo
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own planos_manutencao_veiculo" ON public.planos_manutencao_veiculo
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own planos_manutencao_veiculo" ON public.planos_manutencao_veiculo
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own planos_manutencao_veiculo" ON public.planos_manutencao_veiculo
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- LEMBRETES_MANUTENCAO
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own lembretes_manutencao" ON public.lembretes_manutencao;
DROP POLICY IF EXISTS "Users can create their own lembretes_manutencao" ON public.lembretes_manutencao;
DROP POLICY IF EXISTS "Users can update their own lembretes_manutencao" ON public.lembretes_manutencao;
DROP POLICY IF EXISTS "Users can delete their own lembretes_manutencao" ON public.lembretes_manutencao;

CREATE POLICY "Users can view their own lembretes_manutencao" ON public.lembretes_manutencao
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own lembretes_manutencao" ON public.lembretes_manutencao
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own lembretes_manutencao" ON public.lembretes_manutencao
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own lembretes_manutencao" ON public.lembretes_manutencao
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- IA_CONFIGURACOES
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own ia_configuracoes" ON public.ia_configuracoes;
DROP POLICY IF EXISTS "Users can create their own ia_configuracoes" ON public.ia_configuracoes;
DROP POLICY IF EXISTS "Users can update their own ia_configuracoes" ON public.ia_configuracoes;
DROP POLICY IF EXISTS "Users can delete their own ia_configuracoes" ON public.ia_configuracoes;

CREATE POLICY "Users can view their own ia_configuracoes" ON public.ia_configuracoes
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own ia_configuracoes" ON public.ia_configuracoes
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own ia_configuracoes" ON public.ia_configuracoes
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own ia_configuracoes" ON public.ia_configuracoes
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- IA_UPLOADS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own ia_uploads" ON public.ia_uploads;
DROP POLICY IF EXISTS "Users can create their own ia_uploads" ON public.ia_uploads;
DROP POLICY IF EXISTS "Users can update their own ia_uploads" ON public.ia_uploads;
DROP POLICY IF EXISTS "Users can delete their own ia_uploads" ON public.ia_uploads;

CREATE POLICY "Users can view their own ia_uploads" ON public.ia_uploads
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own ia_uploads" ON public.ia_uploads
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own ia_uploads" ON public.ia_uploads
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own ia_uploads" ON public.ia_uploads
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- IA_ANALYSIS_RESULTS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own ia_analysis_results" ON public.ia_analysis_results;
DROP POLICY IF EXISTS "Users can create their own ia_analysis_results" ON public.ia_analysis_results;
DROP POLICY IF EXISTS "Users can update their own ia_analysis_results" ON public.ia_analysis_results;
DROP POLICY IF EXISTS "Users can delete their own ia_analysis_results" ON public.ia_analysis_results;

CREATE POLICY "Users can view their own ia_analysis_results" ON public.ia_analysis_results
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own ia_analysis_results" ON public.ia_analysis_results
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own ia_analysis_results" ON public.ia_analysis_results
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own ia_analysis_results" ON public.ia_analysis_results
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- PROFILES
-- =====================================================
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "profiles_delete_own" ON public.profiles
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- CONTAS_USUARIO
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own accounts" ON public.contas_usuario;
DROP POLICY IF EXISTS "Users can create their own accounts" ON public.contas_usuario;
DROP POLICY IF EXISTS "Users can update their own accounts" ON public.contas_usuario;
DROP POLICY IF EXISTS "Users can delete their own accounts" ON public.contas_usuario;

CREATE POLICY "Users can view their own accounts" ON public.contas_usuario
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own accounts" ON public.contas_usuario
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own accounts" ON public.contas_usuario
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own accounts" ON public.contas_usuario
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- PAGAMENTOS_DIVIDAS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own debt payments" ON public.pagamentos_dividas;
DROP POLICY IF EXISTS "Users can create their own debt payments" ON public.pagamentos_dividas;
DROP POLICY IF EXISTS "Users can delete their own debt payments" ON public.pagamentos_dividas;

CREATE POLICY "Users can view their own debt payments" ON public.pagamentos_dividas
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own debt payments" ON public.pagamentos_dividas
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own debt payments" ON public.pagamentos_dividas
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- TAGS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own tags" ON public.tags;
DROP POLICY IF EXISTS "Users can create their own tags" ON public.tags;
DROP POLICY IF EXISTS "Users can update their own tags" ON public.tags;
DROP POLICY IF EXISTS "Users can delete their own tags" ON public.tags;

CREATE POLICY "Users can view their own tags" ON public.tags
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own tags" ON public.tags
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own tags" ON public.tags
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own tags" ON public.tags
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- ANEXOS_TRANSACOES
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own anexos" ON public.anexos_transacoes;
DROP POLICY IF EXISTS "Users can create their own anexos" ON public.anexos_transacoes;
DROP POLICY IF EXISTS "Users can delete their own anexos" ON public.anexos_transacoes;

CREATE POLICY "Users can view their own anexos" ON public.anexos_transacoes
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own anexos" ON public.anexos_transacoes
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own anexos" ON public.anexos_transacoes
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- TRANSACOES_RECORRENTES
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own recurring transactions" ON public.transacoes_recorrentes;
DROP POLICY IF EXISTS "Users can create their own recurring transactions" ON public.transacoes_recorrentes;
DROP POLICY IF EXISTS "Users can update their own recurring transactions" ON public.transacoes_recorrentes;
DROP POLICY IF EXISTS "Users can delete their own recurring transactions" ON public.transacoes_recorrentes;

CREATE POLICY "Users can view their own recurring transactions" ON public.transacoes_recorrentes
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own recurring transactions" ON public.transacoes_recorrentes
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own recurring transactions" ON public.transacoes_recorrentes
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own recurring transactions" ON public.transacoes_recorrentes
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- DEBT_REMINDERS
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own debt_reminders" ON public.debt_reminders;
DROP POLICY IF EXISTS "Users can create their own debt_reminders" ON public.debt_reminders;
DROP POLICY IF EXISTS "Users can update their own debt_reminders" ON public.debt_reminders;
DROP POLICY IF EXISTS "Users can delete their own debt_reminders" ON public.debt_reminders;

CREATE POLICY "Users can view their own debt_reminders" ON public.debt_reminders
  FOR SELECT USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create their own debt_reminders" ON public.debt_reminders
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users can update their own debt_reminders" ON public.debt_reminders
  FOR UPDATE USING (user_id = (select auth.uid()));
CREATE POLICY "Users can delete their own debt_reminders" ON public.debt_reminders
  FOR DELETE USING (user_id = (select auth.uid()));

-- =====================================================
-- SUBSCRIPTION_PAYMENTS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own payments" ON public.subscription_payments;

CREATE POLICY "Users can view own payments" ON public.subscription_payments
  FOR SELECT USING (user_id = (select auth.uid()));

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 41: All RLS policies optimized with (select auth.uid())';
END $$;
