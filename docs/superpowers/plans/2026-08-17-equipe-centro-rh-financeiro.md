# Equipe — Centro de RH e Financeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o módulo Equipe com isolamento por workspace, acertos atômicos, obrigações mensais e semanais, conciliação Divipay por Pix e uma interface consistente e responsiva.

**Architecture:** O Supabase será a autoridade para segurança, transições de estado e atomicidade. Regras de cálculo e correspondência serão funções puras TypeScript compartilhadas por hooks e componentes; operações financeiras usarão RPCs transacionais e o webhook Divipay fará baixa idempotente.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase/PostgreSQL RLS/RPC, Supabase Edge Functions, Vitest, Testing Library, Tailwind e Radix UI.

---

## Estrutura de arquivos

- `supabase/migrations/75_equipe_centro_rh_financeiro.sql`: correções do schema legado, membros, novas entidades, RLS, restrições e RPCs semanais.
- `supabase/migrations/76_equipe_obrigacoes_mensais.sql`: salários, pró-labores e agendamento mensal idempotente.
- `supabase/tests/equipe_centro_rh_financeiro.sql`: verificações SQL de RLS, atomicidade, duplicidade e transições.
- `src/domains/finance/services/equipeCalculations.ts`: calendário, dinheiro, experiência e composição de acertos.
- `src/domains/finance/services/equipeCalculations.test.ts`: testes puros de cálculos.
- `src/domains/finance/services/equipePrivacy.ts`: normalização/mascaramento de Pix e dados pessoais.
- `src/domains/finance/services/equipePrivacy.test.ts`: testes de privacidade.
- `supabase/functions/_shared/equipe-conciliacao.ts`: seleção determinística de acerto para pagamento externo.
- `src/domains/finance/services/equipeConciliacao.test.ts`: testes Vitest do módulo compartilhado da Edge Function.
- `src/domains/finance/hooks/useEquipeAcertos.ts`: consultas e mutações de acertos/RPCs.
- `src/domains/finance/hooks/useEquipeResumo.ts`: indicadores da tela principal.
- `src/domains/finance/components/equipe/`: cards, status, resumo, acerto semanal, composição e dados sensíveis.
- `src/pages/Equipe.tsx`: painel principal.
- `src/pages/EquipeDetalhe.tsx`: perfil por abas.
- `src/domains/divipay/services/DivipayService.ts`: solicitação de pagamento de acerto com chave de idempotência.
- `supabase/functions/divipay-webhook/index.ts`: baixa de pagamento interno e conciliação de pagamento externo.
- `src/integrations/supabase/types.ts`: tipos das novas tabelas e RPCs.

### Task 1: Blindar schema legado e criar o ledger da Equipe

**Files:**
- Create: `supabase/migrations/75_equipe_centro_rh_financeiro.sql`
- Create: `supabase/tests/equipe_centro_rh_financeiro.sql`

- [ ] **Step 1: Escrever o teste SQL que reproduz as falhas atuais**

O teste deve criar dois usuários e dois workspaces, executar consultas com `SET LOCAL ROLE authenticated` e verificar que um usuário não enxerga colaboradores do outro workspace. Também deve verificar que `folguista` é aceito, que uma escala duplicada é recusada e que um acerto pago não pode voltar para pendente.

```sql
begin;
select plan(6);

select policies_are(
  'public', 'colaboradores',
  array['equipe_colaboradores_select','equipe_colaboradores_insert','equipe_colaboradores_update','equipe_colaboradores_delete']
);

select col_is_unique('public', 'colaborador_pagamentos', 'divipay_external_id');
select has_table('public', 'colaborador_acertos');
select has_table('public', 'colaborador_acerto_itens');
select has_table('public', 'colaborador_ajustes');
select function_returns('public', 'gerar_acerto_semanal', array['uuid','date','date','jsonb'], 'uuid');

select * from finish();
rollback;
```

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `supabase test db supabase/tests/equipe_centro_rh_financeiro.sql`

Expected: FAIL porque tabelas, políticas e RPC ainda não existem. Se o CLI/Docker local não estiver disponível, registrar a limitação e executar o arquivo contra o projeto Supabase de desenvolvimento antes da publicação.

- [ ] **Step 3: Criar o schema e corrigir as restrições legadas**

A migration deve:

```sql
alter table public.colaboradores drop constraint if exists colaboradores_tipo_check;
alter table public.colaboradores
  add constraint colaboradores_tipo_check check (tipo in ('funcionario','socio','folguista'));

alter table public.colaboradores
  add column if not exists foto_posicao text default '50% 15%',
  add column if not exists dia_pagamento smallint,
  add column if not exists pix_chave_normalizada text generated always as
    (lower(regexp_replace(coalesce(pix_chave,''), '[^a-zA-Z0-9@+.]', '', 'g'))) stored;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

insert into public.workspace_members (workspace_id, user_id, role)
select id, user_id, 'admin' from public.workspaces
on conflict (workspace_id, user_id) do nothing;

create table public.colaborador_acertos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  tipo text not null check (tipo in ('semanal_funcionario','semanal_folguista','salario','pro_labore')),
  periodo_inicio date not null,
  periodo_fim date not null,
  vencimento date not null,
  status text not null default 'rascunho' check
    (status in ('rascunho','pendente','processando','pago','falhou','cancelado','ajustado')),
  valor_total numeric(12,2) not null default 0 check (valor_total >= 0),
  pix_chave_snapshot text,
  despesa_id uuid references public.despesas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (colaborador_id, tipo, periodo_inicio, periodo_fim)
);

create table public.colaborador_acerto_itens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  acerto_id uuid not null references public.colaborador_acertos(id) on delete cascade,
  escala_id uuid references public.colaborador_escalas(id) on delete restrict,
  natureza text not null check (natureza in ('transporte','meta','diaria','salario','pro_labore','ajuste')),
  descricao text not null,
  valor numeric(12,2) not null check (valor <> 0),
  categoria_id uuid references public.categorias(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.colaborador_pagamentos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  acerto_id uuid not null references public.colaborador_acertos(id) on delete restrict,
  status text not null check (status in ('pendente','processando','pago','falhou','cancelado')),
  origem text not null check (origem in ('wallet_divipay','divipay_externo','manual')),
  valor numeric(12,2) not null check (valor > 0),
  taxa numeric(12,2) not null default 0,
  idempotency_key text not null unique,
  divipay_external_id text unique,
  comprovante_url text,
  erro_codigo text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table public.colaborador_ajustes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  acerto_origem_id uuid references public.colaborador_acertos(id) on delete restrict,
  valor numeric(12,2) not null check (valor <> 0),
  motivo text not null,
  aplicado_em_acerto_id uuid references public.colaborador_acertos(id) on delete restrict,
  created_at timestamptz not null default now()
);
```

Adicionar `workspace_id not null` em custos, índices compostos e `unique(colaborador_id,data,turno)` em escalas depois de consolidar duplicados existentes de forma determinística.

- [ ] **Step 4: Criar helper seguro e políticas RLS**

Usar o proprietário do workspace como membro administrador inicial e permitir extensão para membros ativos sem abrir acesso global:

```sql
create or replace function public.tem_acesso_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.user_id = auth.uid()
  ) or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.active
      and wm.role = 'admin'
  );
$$;

create policy equipe_colaboradores_select on public.colaboradores
for select using (public.tem_acesso_workspace(workspace_id));
create policy equipe_colaboradores_insert on public.colaboradores
for insert with check (public.tem_acesso_workspace(workspace_id));
create policy equipe_colaboradores_update on public.colaboradores
for update using (public.tem_acesso_workspace(workspace_id))
with check (public.tem_acesso_workspace(workspace_id));
create policy equipe_colaboradores_delete on public.colaboradores
for delete using (public.tem_acesso_workspace(workspace_id));
```

Repetir políticas equivalentes para custos, presenças, escalas, acertos, itens, pagamentos e ajustes, validando relações cruzadas em triggers `before insert or update`. Proteger `workspace_members`: administradores enxergam os membros do próprio workspace, mas somente o proprietário cadastra, desativa ou remove um administrador.

- [ ] **Step 5: Criar RPCs atômicas**

Implementar `gerar_acerto_semanal`, `cancelar_escala_e_recalcular_acerto`, `iniciar_pagamento_acerto`, `confirmar_pagamento_acerto` e `registrar_falha_pagamento`. Todas devem validar `tem_acesso_workspace`, usar bloqueio `for update`, criar a despesa pendente e retornar IDs estáveis em repetição idempotente.

- [ ] **Step 6: Executar teste SQL e confirmar GREEN**

Run: `supabase test db supabase/tests/equipe_centro_rh_financeiro.sql`

Expected: 6 assertions PASS e zero políticas permissivas globais nas tabelas da Equipe.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/75_equipe_centro_rh_financeiro.sql supabase/tests/equipe_centro_rh_financeiro.sql
git commit -m "feat(equipe): criar ledger financeiro seguro e atomico"
```

### Task 2: Centralizar cálculos, calendário e privacidade

**Files:**
- Create: `src/domains/finance/services/equipeCalculations.test.ts`
- Create: `src/domains/finance/services/equipeCalculations.ts`
- Create: `src/domains/finance/services/equipePrivacy.test.ts`
- Create: `src/domains/finance/services/equipePrivacy.ts`
- Modify: `src/domains/finance/hooks/useColaboradorCalculos.ts`

- [ ] **Step 1: Escrever testes RED para dinheiro e calendário**

```ts
import { describe, expect, it } from 'vitest';
import { quintoDiaUtil, calcularAcertoFuncionario, calcularFimExperiencia } from './equipeCalculations';

describe('quintoDiaUtil', () => {
  it('ignora fins de semana e feriados', () => {
    expect(quintoDiaUtil(2026, 8, ['2026-08-07'])).toBe('2026-08-10');
  });
});

it('agrupa Uber e passagem em transporte e mantém meta separada', () => {
  const r = calcularAcertoFuncionario([
    { trabalhou: true, uberCentavos: 1200, uberBaseCentavos: 1200, passagemCentavos: 625, metaCentavos: 2000 },
  ]);
  expect(r).toEqual({ transporteCentavos: 1825, metaCentavos: 2000, totalCentavos: 3825 });
});

it('usa dias_experiencia configurável', () => {
  expect(calcularFimExperiencia('2026-08-01', 45)).toBe('2026-09-15');
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run src/domains/finance/services/equipeCalculations.test.ts`

Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Implementar funções puras em centavos**

```ts
export type DiaAcertoFuncionario = {
  trabalhou: boolean;
  uberCentavos: number;
  uberBaseCentavos: number;
  passagemCentavos: number;
  metaCentavos: number;
};

export function calcularAcertoFuncionario(dias: DiaAcertoFuncionario[]) {
  return dias.reduce((total, dia) => {
    if (!dia.trabalhou) return total;
    const transporte = dia.uberBaseCentavos + dia.passagemCentavos
      + Math.max(0, dia.uberCentavos - dia.uberBaseCentavos);
    total.transporteCentavos += transporte;
    total.metaCentavos += dia.metaCentavos;
    total.totalCentavos += transporte + dia.metaCentavos;
    return total;
  }, { transporteCentavos: 0, metaCentavos: 0, totalCentavos: 0 });
}
```

Implementar também `quintoDiaUtil`, `calcularFimExperiencia`, `calcularCustoColaborador`, `calcularAcertoFolguista`, `centavosParaDecimal` e `decimalParaCentavos`.

- [ ] **Step 4: Escrever testes RED de mascaramento e Pix**

```ts
expect(normalizePixKey('123.456.789-00')).toBe('12345678900');
expect(maskCpf('12345678900')).toBe('***.456.789-**');
expect(maskPixKey('heitor@email.com', 'email')).toBe('h***@email.com');
expect(maskBankAccount('123456-7')).toBe('***456-7');
```

- [ ] **Step 5: Implementar privacidade e confirmar GREEN**

Run: `npx vitest run src/domains/finance/services/equipeCalculations.test.ts src/domains/finance/services/equipePrivacy.test.ts`

Expected: todos os testes PASS.

- [ ] **Step 6: Fazer `useColaboradorCalculos` delegar ao serviço puro**

Remover fórmulas duplicadas do hook e manter somente adaptação de dados e memoização.

- [ ] **Step 7: Commit**

```bash
git add src/domains/finance/services src/domains/finance/hooks/useColaboradorCalculos.ts
git commit -m "refactor(equipe): centralizar calculos e privacidade"
```

### Task 3: Implementar geração e consulta de acertos no frontend

**Files:**
- Create: `src/domains/finance/hooks/useEquipeAcertos.test.tsx`
- Create: `src/domains/finance/hooks/useEquipeAcertos.ts`
- Create: `src/domains/finance/hooks/useEquipeResumo.ts`
- Modify: `src/domains/finance/hooks/useFolguistaEscalas.ts`

- [ ] **Step 1: Escrever teste RED das mutações**

Mockar somente a fronteira Supabase e afirmar que `gerarAcerto` chama `rpc('gerar_acerto_semanal', ...)`, que cancelamento chama a RPC atômica e que as queries de acertos e resumo são invalidadas após sucesso.

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run src/domains/finance/hooks/useEquipeAcertos.test.tsx`

Expected: FAIL porque o hook não existe.

- [ ] **Step 3: Implementar contratos do hook**

```ts
export type AcertoStatus = 'rascunho'|'pendente'|'processando'|'pago'|'falhou'|'cancelado'|'ajustado';

export function useEquipeAcertos(colaboradorId: string | null) {
  const gerarAcerto = useMutation({
    mutationFn: (input: GerarAcertoInput) => supabase.rpc('gerar_acerto_semanal', {
      p_colaborador_id: input.colaboradorId,
      p_periodo_inicio: input.periodoInicio,
      p_periodo_fim: input.periodoFim,
      p_itens: input.itens,
    }),
  });
  return { gerarAcerto };
}
```

O hook completo deve consultar acerto com itens/pagamentos, iniciar pagamento, tentar novamente e cancelar escala.

- [ ] **Step 4: Remover gravações financeiras diretas do hook de escalas**

`useFolguistaEscalas` deixa de inserir/excluir `colaborador_custos` diretamente. Toda alteração passa pelas RPCs e retorna erro sem deixar estado parcial.

- [ ] **Step 5: Confirmar GREEN e commit**

Run: `npx vitest run src/domains/finance/hooks/useEquipeAcertos.test.tsx`

```bash
git add src/domains/finance/hooks
git commit -m "feat(equipe): integrar acertos atomicos no frontend"
```

### Task 4: Implementar conciliação externa por Pix

**Files:**
- Create: `supabase/functions/_shared/equipe-conciliacao.ts`
- Create: `src/domains/finance/services/equipeConciliacao.test.ts`
- Modify: `supabase/functions/divipay-webhook/index.ts`
- Modify: `src/domains/divipay/services/ConciliacaoDivipayService.ts`

- [ ] **Step 1: Escrever testes RED do matcher**

```ts
it('faz match automático somente quando há um candidato exato', () => {
  const result = matchEquipePayment({ pix: '123.456.789-00', valorCentavos: 10950, data: '2026-08-24' }, [
    { id: 'a', pix: '12345678900', valorCentavos: 10950, vencimento: '2026-08-24', status: 'pendente' },
  ]);
  expect(result).toEqual({ kind: 'matched', acertoId: 'a' });
});

it('não escolhe entre candidatos ambíguos', () => {
  const result = matchEquipePayment(movimento, [candidatoA, candidatoB]);
  expect(result.kind).toBe('ambiguous');
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run src/domains/finance/services/equipeConciliacao.test.ts`

- [ ] **Step 3: Implementar matcher determinístico**

Filtrar na ordem: status elegível, Pix normalizado exato, valor exato em centavos e data dentro de sete dias do vencimento. Retornar `none`, `matched` ou `ambiguous`, sem heurística silenciosa por nome.

- [ ] **Step 4: Integrar ao webhook**

Antes do motor genérico de dívidas, consultar acertos pendentes/processando do mesmo workspace pela chave de destinatário. Em `matched`, chamar `confirmar_pagamento_acerto` com `divipay_external_id`; em `ambiguous`, criar `divipay_conciliacoes` pendente; em `none`, continuar o fluxo existente.

Nunca escrever Pix, CPF ou conta em `console.log/error`.

- [ ] **Step 5: Confirmar GREEN e commit**

Run: `npx vitest run src/domains/finance/services/equipeConciliacao.test.ts src/domains/divipay/services/conciliacaoMatcher.test.ts`

```bash
git add supabase/functions src/domains/finance/services/equipeConciliacao.test.ts src/domains/divipay/services/ConciliacaoDivipayService.ts
git commit -m "feat(equipe): conciliar pagamentos externos por pix"
```

### Task 5: Implementar pagamento pendente e confirmação Divipay

**Files:**
- Create: `src/domains/finance/components/equipe/AcertoPaymentDialog.test.tsx`
- Create: `src/domains/finance/components/equipe/AcertoPaymentDialog.tsx`
- Modify: `src/domains/divipay/services/DivipayService.ts`
- Modify: `src/domains/divipay/types.ts`

- [ ] **Step 1: Escrever teste RED do diálogo**

Testar que o diálogo mostra colaborador, período, transporte, metas, total e Pix mascarado; exige confirmação; desabilita ação sem Pix; e apresenta falha sem marcar como pago.

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run src/domains/finance/components/equipe/AcertoPaymentDialog.test.tsx`

- [ ] **Step 3: Implementar pagamento idempotente**

O componente chama primeiro `iniciar_pagamento_acerto`, recebe `pagamento_id` e `idempotency_key`, e depois chama `DivipayService.createWithdraw` com metadata `{ acerto_id, pagamento_id, workspace_id }`. O status permanece `processando` até o webhook.

- [ ] **Step 4: Confirmar GREEN e commit**

```bash
npx vitest run src/domains/finance/components/equipe/AcertoPaymentDialog.test.tsx
git add src/domains/finance/components/equipe src/domains/divipay
git commit -m "feat(equipe): pagar acertos pendentes pelo divipay"
```

### Task 6: Substituir acertos semanais legados

**Files:**
- Create: `src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx`
- Create: `src/domains/finance/components/equipe/AcertoSemanalFuncionario.tsx`
- Create: `src/domains/finance/components/equipe/AcertoSemanalFolguista.test.tsx`
- Create: `src/domains/finance/components/equipe/AcertoSemanalFolguista.tsx`
- Delete: `src/domains/finance/components/AcertoSemanal.tsx`
- Delete: `src/domains/finance/components/EscalaFolguista.tsx`

- [ ] **Step 1: Escrever testes RED dos dois fluxos**

Funcionário: uma obrigação com itens `transporte` e `meta`. Folguista: uma obrigação com itens por escala, bônus e ajustes. Ambos devem mostrar composição e criar somente `pendente`.

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run src/domains/finance/components/equipe/AcertoSemanal*.test.tsx`

- [ ] **Step 3: Implementar componentes responsivos**

Extrair componentes compartilhados `WeekGrid`, `SettlementSummary`, `SettlementStatusBadge` e `SensitiveValue`. Em telas estreitas, cada dia vira uma linha rolável sem cortar valores ou ações.

- [ ] **Step 4: Confirmar GREEN e commit**

```bash
npx vitest run src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx src/domains/finance/components/equipe/AcertoSemanalFolguista.test.tsx
git add src/domains/finance/components
git commit -m "refactor(equipe): unificar acertos semanais auditaveis"
```

### Task 7: Automatizar salários e pró-labore

**Files:**
- Create: `supabase/migrations/76_equipe_obrigacoes_mensais.sql`
- Create: `src/domains/finance/services/equipeObrigacoes.test.ts`

- [ ] **Step 1: Escrever testes RED de vencimentos**

Cobrir funcionário no quinto dia útil e sócios com `dia_pagamento=16` e `25`, incluindo mês com fim de semana e feriado.

- [ ] **Step 2: Criar RPC idempotente `gerar_obrigacoes_mensais_equipe`**

A função percorre colaboradores ativos, gera salários e pró-labores não existentes, cria despesa pendente e mantém classificação `salario`/`pro_labore`. Agendar execução diária via `pg_cron` quando a extensão estiver disponível; o frontend também chama a RPC ao abrir Equipe como fallback idempotente.

- [ ] **Step 3: Executar testes e commit**

```bash
npx vitest run src/domains/finance/services/equipeObrigacoes.test.ts
git add supabase/migrations/76_equipe_obrigacoes_mensais.sql src/domains/finance/services/equipeObrigacoes.test.ts
git commit -m "feat(equipe): gerar salarios e pro labore automaticamente"
```

### Task 8: Reconstruir painel principal e perfil por abas

**Files:**
- Create: `src/pages/Equipe.test.tsx`
- Modify: `src/pages/Equipe.tsx`
- Create: `src/pages/EquipeDetalhe.test.tsx`
- Modify: `src/pages/EquipeDetalhe.tsx`
- Create: `src/domains/finance/components/equipe/EquipeSummaryCards.tsx`
- Create: `src/domains/finance/components/equipe/ColaboradorCard.tsx`
- Create: `src/domains/finance/components/equipe/SensitiveValue.tsx`

- [ ] **Step 1: Escrever testes RED do painel**

Testar filtros Todos/Sócios/Funcionários/Folguistas, contagens globais independentes do filtro, resumo financeiro, alerta de experiência, dados incompletos e custo calculado pela mesma função do detalhe.

- [ ] **Step 2: Escrever testes RED do perfil**

Testar abas `Visão geral`, `Acertos`, `Escalas`, `Financeiro`, `Dados pessoais`; conteúdo específico por tipo; Pix/CPF/conta mascarados; e ações financeiras ausentes para usuário sem permissão.

- [ ] **Step 3: Implementar painel e perfil**

Remover fórmulas inline de `Equipe.tsx`. Usar `useEquipeResumo`, `useColaboradorCalculos` e componentes focados. Manter cores do tema Wallet, hierarquia de informação e estados vazios/erro/carregamento.

- [ ] **Step 4: Testar responsividade por classes e estrutura**

Garantir `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` nos resumos, cards `sm:grid-cols-2 xl:grid-cols-3` e tabelas com alternativa móvel acessível.

- [ ] **Step 5: Confirmar GREEN e commit**

```bash
npx vitest run src/pages/Equipe.test.tsx src/pages/EquipeDetalhe.test.tsx
git add src/pages/Equipe.tsx src/pages/EquipeDetalhe.tsx src/pages/*.test.tsx src/domains/finance/components/equipe
git commit -m "feat(equipe): entregar painel e perfil completos"
```

### Task 9: Atualizar cadastro, edição, tipos e relatórios

**Files:**
- Modify: `src/pages/EquipeNovo.tsx`
- Modify: `src/pages/EquipeEditar.tsx`
- Modify: `src/domains/finance/hooks/useColaboradores.ts`
- Modify: `src/contexts/WorkspaceContext.tsx`
- Modify: `src/integrations/supabase/types.ts`
- Modify: `src/pages/Relatorios.tsx`
- Create: `src/domains/finance/components/equipe/EquipeForm.test.tsx`

- [ ] **Step 1: Escrever teste RED de validação cadastral**

Validar nome, tipo, Pix compatível com `pix_tipo`, dia de pró-labore entre 1 e 28 e campos financeiros não negativos. Confirmar padrões Heitor=16, Viviane=25 somente por configuração de dados, sem nomes codificados na regra.

- [ ] **Step 2: Implementar formulário por tipo**

Funcionário mostra salário/experiência/transporte; folguista mostra diária/transporte; sócio mostra pró-labore/dia de pagamento. Dados bancários usam máscaras de entrada e não são enviados para logs.

- [ ] **Step 3: Atualizar tipos Supabase**

Adicionar Row/Insert/Update de membros, acertos, itens, pagamentos e ajustes, `workspace_id` ausente nas tabelas legadas e assinaturas das RPCs em `Functions`. Atualizar `WorkspaceContext` para carregar workspaces de que o usuário é proprietário ou membro administrador, sem criar workspaces novos quando ele já possui acesso por associação.

- [ ] **Step 4: Integrar relatórios**

Relatórios somam `transporte` e `meta` por itens do acerto; taxa Divipay vem do pagamento/categoria bancária; transferência única não deve colapsar a classificação contábil.

- [ ] **Step 5: Confirmar GREEN e commit**

```bash
npx vitest run src/domains/finance/components/equipe/EquipeForm.test.tsx
git add src/pages/EquipeNovo.tsx src/pages/EquipeEditar.tsx src/pages/Relatorios.tsx src/domains/finance/hooks/useColaboradores.ts src/contexts/WorkspaceContext.tsx src/integrations/supabase/types.ts src/domains/finance/components/equipe/EquipeForm.test.tsx
git commit -m "feat(equipe): validar cadastro e integrar relatorios"
```

### Task 10: Verificação de segurança, regressão e experiência visual

**Files:**
- Modify: tests as required by failures only
- Create: `docs/qa/equipe-centro-rh-financeiro.md`

- [ ] **Step 1: Executar verificação de migração/RLS**

Run: `supabase db reset && supabase test db`

Expected: migrations aplicam do zero, testes SQL passam e não existe `USING (true)` nas tabelas da Equipe.

- [ ] **Step 2: Executar testes focados**

Run: `npx vitest run src/domains/finance/services src/domains/finance/hooks/useEquipeAcertos.test.tsx src/domains/finance/components/equipe src/pages/Equipe.test.tsx src/pages/EquipeDetalhe.test.tsx`

Expected: todos PASS, sem warnings inesperados.

- [ ] **Step 3: Executar suíte completa, TypeScript, lint e build**

```bash
npx vitest run
npx tsc --noEmit
npm run lint
npm run build
```

Expected: exit code 0 em todos. Warnings preexistentes devem ser registrados separadamente; nenhum warning novo da Equipe é aceito.

- [ ] **Step 4: Testar manualmente com dois workspaces**

Criar colaborador em workspace A, trocar para B e confirmar ausência completa. Validar cadastro dos três tipos, geração pendente, pagamento Divipay em sandbox, webhook repetido, pagamento externo exato, ambiguidade e cancelamentos antes/depois do pagamento.

- [ ] **Step 5: Testar interface**

Validar 375×812, 768×1024 e 1440×900: sem conteúdo cortado, controles acessíveis por teclado, contraste legível, carregamento/erro/vazio, Pix mascarado e composição contábil clara. Registrar evidências em `docs/qa/equipe-centro-rh-financeiro.md`.

- [ ] **Step 6: Auditoria final da especificação**

Comparar cada requisito de `docs/superpowers/specs/2026-08-17-equipe-centro-rh-financeiro-design.md` com código, teste e evidência. Não marcar concluído se Supabase remoto, Divipay sandbox ou teste visual estiverem indisponíveis; listar o bloqueio explicitamente.

- [ ] **Step 7: Commit final de QA**

```bash
git add docs/qa/equipe-centro-rh-financeiro.md
git commit -m "test(equipe): documentar validacao completa do modulo"
```
