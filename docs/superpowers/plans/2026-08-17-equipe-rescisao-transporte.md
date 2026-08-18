# Equipe — Custos MEI, Simulador de Rescisão e Transporte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o custo de funcionário para o regime MEI, resolver contratos de experiência expirados, criar um simulador auditável de desligamento e restaurar a diferença do Uber no acerto semanal.

**Architecture:** Regras monetárias e trabalhistas ficarão em funções puras, com centavos inteiros e datas UTC. A configuração legal será lida do workspace e os componentes React apenas coletarão entradas e apresentarão a composição; o simulador será estritamente somente leitura.

**Tech Stack:** React 18, TypeScript, date-fns 4, TanStack Query, Supabase/PostgreSQL, Vitest, Testing Library, Tailwind e Radix UI.

---

## Estrutura de arquivos

- `supabase/migrations/20260817140000_equipe_configuracao_trabalhista.sql`: configura regime e referência coletiva por workspace.
- `supabase/tests/equipe_centro_rh_financeiro.sql`: comprova as colunas, restrições e isolamento da configuração.
- `src/contexts/WorkspaceContext.tsx`: expõe regime, piso e referência coletiva no workspace ativo.
- `src/integrations/supabase/types.ts`: tipa os novos campos do banco.
- `src/domains/finance/services/equipeCalculations.ts`: custo MEI, composição do transporte e estado derivado do contrato.
- `src/domains/finance/services/equipeCalculations.test.ts`: testes dos cálculos-base.
- `src/domains/finance/services/equipeRescisao.ts`: motor puro de estimativas de desligamento.
- `src/domains/finance/services/equipeRescisao.test.ts`: cenários legais, datas-limite e fontes estimada/confirmada.
- `src/domains/finance/hooks/useColaboradorCalculos.ts`: adapta colaborador, custos e configuração do workspace ao domínio puro.
- `src/domains/finance/components/equipe/EmployeeCostBreakdown.tsx`: composição mensal e alerta de piso.
- `src/domains/finance/components/equipe/EmployeeCostBreakdown.test.tsx`: apresentação correta dos encargos MEI.
- `src/domains/finance/components/equipe/TerminationSimulator.tsx`: formulário e resultado do simulador somente leitura.
- `src/domains/finance/components/equipe/TerminationSimulator.test.tsx`: cenários, detalhamento e ausência de mutações.
- `src/domains/finance/components/equipe/AcertoSemanalFuncionario.tsx`: restaura Uber base, passagem e diferença visíveis.
- `src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx`: garante a composição visual e contábil.
- `src/domains/finance/components/equipe/ColaboradorCard.tsx`: usa o regime do workspace e o estado contratual derivado.
- `src/pages/Equipe.tsx`: passa a configuração do workspace aos cards.
- `src/pages/EquipeDetalhe.tsx`: integra custos, alertas, status contratual e simulador.
- `src/pages/EquipeDetalhe.test.tsx`: fluxo completo do perfil financeiro.
- `docs/qa/equipe-rescisao-transporte.md`: evidências de testes e conferência visual.

### Task 1: Configurar regime MEI e referência coletiva no workspace

**Files:**
- Create: `supabase/migrations/20260817140000_equipe_configuracao_trabalhista.sql`
- Modify: `supabase/tests/equipe_centro_rh_financeiro.sql`
- Modify: `src/contexts/WorkspaceContext.tsx:5-13`
- Modify: `src/integrations/supabase/types.ts:17-50`

- [ ] **Step 1: Escrever as asserções SQL que falham antes da migration**

Adicionar antes de `finish()`:

```sql
select has_column('public', 'workspaces', 'regime_encargos', 'Workspace guarda o regime de encargos');
select has_column('public', 'workspaces', 'piso_categoria', 'Workspace guarda o piso coletivo');
select has_column('public', 'workspaces', 'convencao_mte', 'Workspace guarda a referencia da CCT');
select col_has_check('public', 'workspaces', 'regime_encargos', 'Regime aceita somente valores conhecidos');
```

- [ ] **Step 2: Executar o teste SQL e confirmar RED**

Run: `supabase test db supabase/tests/equipe_centro_rh_financeiro.sql`

Expected: FAIL nas quatro asserções novas porque as colunas ainda não existem. Se o banco local estiver indisponível, aplicar a migration num banco de desenvolvimento antes de publicar e registrar a limitação no QA.

- [ ] **Step 3: Criar a migration de configuração trabalhista**

```sql
begin;

alter table public.workspaces
  add column if not exists regime_encargos text not null default 'geral',
  add column if not exists piso_categoria numeric(12,2),
  add column if not exists piso_vigencia_inicio date,
  add column if not exists convencao_mte text,
  add column if not exists convencao_fonte_url text;

alter table public.workspaces
  drop constraint if exists workspaces_regime_encargos_check;
alter table public.workspaces
  add constraint workspaces_regime_encargos_check
  check (regime_encargos in ('mei', 'geral'));

update public.workspaces
set regime_encargos = 'mei',
    piso_categoria = 1681.18,
    piso_vigencia_inicio = date '2026-01-01',
    convencao_mte = 'MR009846/2026',
    convencao_fonte_url = 'https://mediador.trabalho.gov.br/sistemas/mediador/Resumo/ResumoVisualizar?NrSolicitacao=MR009846%2F2026'
where tipo = 'PJ' and lower(trim(nome)) = 'conta rodo point';

commit;
```

- [ ] **Step 4: Tipar os novos campos**

Adicionar a `Workspace` e às formas `Row`, `Insert` e `Update` de `workspaces`:

```ts
regime_encargos: "mei" | "geral";
piso_categoria: number | null;
piso_vigencia_inicio: string | null;
convencao_mte: string | null;
convencao_fonte_url: string | null;
```

Nos tipos `Insert` e `Update`, usar propriedades opcionais, mantendo os valores `null` aceitos onde aplicável.

- [ ] **Step 5: Executar TypeScript e o teste SQL**

Run: `npx tsc --noEmit`

Expected: PASS.

Run: `supabase test db supabase/tests/equipe_centro_rh_financeiro.sql`

Expected: PASS, inclusive as quatro novas asserções.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260817140000_equipe_configuracao_trabalhista.sql supabase/tests/equipe_centro_rh_financeiro.sql src/contexts/WorkspaceContext.tsx src/integrations/supabase/types.ts
git commit -m "feat(equipe): configurar regras trabalhistas por workspace"
```

### Task 2: Corrigir custo MEI, transporte e estado contratual no domínio

**Files:**
- Modify: `src/domains/finance/services/equipeCalculations.test.ts`
- Modify: `src/domains/finance/services/equipeCalculations.ts`
- Modify: `src/domains/finance/hooks/useColaboradorCalculos.ts`

- [ ] **Step 1: Escrever testes RED para o custo MEI e a composição do transporte**

```ts
it('calcula funcionario MEI com 3% patronal e 8% de FGTS', () => {
  const result = calcularCustoColaborador({
    tipo: 'funcionario',
    regimeEncargos: 'mei',
    salarioCentavos: 162_100,
    diasTrabalhoMes: 26,
  });

  expect(result).toMatchObject({
    inssEmpresaCentavos: 4_863,
    fgtsCentavos: 12_968,
    decimoTerceiroCentavos: 13_508,
    feriasCentavos: 18_011,
    totalCentavos: 211_450,
    custoDiaCentavos: 8_133,
  });
});

it('detalha Uber base, passagem e somente a diferenca positiva', () => {
  expect(calcularAcertoFuncionario([{
    trabalhou: true,
    uberCentavos: 1_392,
    uberBaseCentavos: 1_200,
    passagemCentavos: 625,
    metaCentavos: 15_000,
  }])).toEqual({
    uberRealCentavos: 1_392,
    uberBaseCentavos: 1_200,
    passagensCentavos: 625,
    diferencaUberCentavos: 192,
    transporteCentavos: 2_017,
    metaCentavos: 15_000,
    totalCentavos: 17_017,
  });
});
```

- [ ] **Step 2: Escrever testes RED para o estado do contrato**

```ts
it('resolve experiencia expirada e ativa como prazo indeterminado', () => {
  expect(resolverEstadoContrato({
    statusPersistido: 'experiencia',
    dataAdmissao: '2026-02-23',
    diasExperiencia: 90,
    dataReferencia: '2026-08-17',
    dataDemissao: null,
  })).toMatchObject({ estado: 'indeterminado', diasRestantes: null });
});

it('mantem decisao pendente exatamente na data final', () => {
  expect(resolverEstadoContrato({
    statusPersistido: 'experiencia',
    dataAdmissao: '2026-08-01',
    diasExperiencia: 45,
    dataReferencia: '2026-09-15',
    dataDemissao: null,
  }).estado).toBe('decisao');
});
```

- [ ] **Step 3: Executar os testes e confirmar RED**

Run: `npx vitest run src/domains/finance/services/equipeCalculations.test.ts`

Expected: FAIL porque `regimeEncargos`, os novos campos do acerto e `resolverEstadoContrato` ainda não existem.

- [ ] **Step 4: Implementar os contratos de domínio**

```ts
export type RegimeEncargos = 'mei' | 'geral';

export type EstadoContrato =
  | { estado: 'experiencia'; diasRestantes: number; dataFim: string }
  | { estado: 'decisao'; diasRestantes: 0; dataFim: string }
  | { estado: 'indeterminado'; diasRestantes: null; dataFim: string | null }
  | { estado: 'inativo'; diasRestantes: null; dataFim: string | null };

export type CustoColaboradorInput = {
  tipo: TipoColaborador;
  regimeEncargos?: RegimeEncargos;
  salarioCentavos: number;
  proLaboreCentavos?: number;
  transporteCentavos?: number;
  beneficiosCentavos?: number;
  variaveisCentavos?: number;
  diasTrabalhoMes: number;
};
```

No custo do funcionário, substituir a alíquota fixa:

```ts
const aliquotaInss = input.regimeEncargos === 'mei' ? 0.03 : 0.2;
const inssEmpresa = hasLaborCharges ? Math.round(salario * aliquotaInss) : 0;
```

No acerto, acumular explicitamente cada parcela:

```ts
const diferenca = Math.max(0, uberReal - uberBase);
total.uberRealCentavos += uberReal;
total.uberBaseCentavos += uberBase;
total.passagensCentavos += passagem;
total.diferencaUberCentavos += diferenca;
total.transporteCentavos += uberBase + passagem + diferenca;
total.metaCentavos += meta;
total.totalCentavos += uberBase + passagem + diferenca + meta;
```

Implementar `resolverEstadoContrato` comparando strings ISO válidas e usando `calcularFimExperiencia`; data de demissão prevalece, a data final retorna `decisao` e data posterior com vínculo ativo retorna `indeterminado`.

- [ ] **Step 5: Passar o regime do workspace ao hook**

Alterar a assinatura:

```ts
export function useColaboradorCalculos(
  colaborador: Colaborador | null,
  custos: ColaboradorCusto[],
  presencas: ColaboradorPresenca[],
  mesRef?: string,
  regimeEncargos: RegimeEncargos = 'geral',
): CalculosColaborador
```

Passar `regimeEncargos` para `calcularCustoColaborador` e acrescentar `estadoContrato` ao retorno. Remover `daysUntil` e a lógica que força valores negativos a zero, pois ela é a causa de contratos expirados aparecerem como “faltam 0 dias”.

- [ ] **Step 6: Confirmar GREEN**

Run: `npx vitest run src/domains/finance/services/equipeCalculations.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domains/finance/services/equipeCalculations.ts src/domains/finance/services/equipeCalculations.test.ts src/domains/finance/hooks/useColaboradorCalculos.ts
git commit -m "fix(equipe): calcular encargos MEI e estado contratual"
```

### Task 3: Criar o motor puro de estimativa de rescisão

**Files:**
- Create: `src/domains/finance/services/equipeRescisao.ts`
- Create: `src/domains/finance/services/equipeRescisao.test.ts`

- [ ] **Step 1: Escrever testes RED dos três cenários principais**

```ts
const base = {
  dataAdmissao: '2026-02-23',
  dataDesligamento: '2026-08-17',
  salarioCentavos: 162_100,
  aviso: 'indenizado' as const,
  saldoFgtsCentavos: null,
  fgtsHistoricoEstimadoCentavos: 129_708,
  feriasVencidasPeriodos: 0,
  mediasRemuneratoriasCentavos: 0,
  descontosCentavos: 0,
};

it('estima sem justa causa com aviso, proporcionais e multa de 40%', () => {
  const result = calcularRescisao({ ...base, motivo: 'sem_justa_causa' });
  expect(result.avisoPrevioCentavos).toBe(162_100);
  expect(result.percentualMultaFgts).toBe(0.4);
  expect(result.fonteSaldoFgts).toBe('estimada');
  expect(result.totalEmpresaCentavos).toBeGreaterThan(0);
});

it('usa metade do aviso e multa de 20% no acordo', () => {
  const result = calcularRescisao({ ...base, motivo: 'acordo' });
  expect(result.avisoPrevioCentavos).toBe(81_050);
  expect(result.percentualMultaFgts).toBe(0.2);
});

it('nao aplica multa no pedido e permite desconto de aviso', () => {
  const result = calcularRescisao({ ...base, motivo: 'pedido_demissao', aviso: 'nao_cumprido' });
  expect(result.multaFgtsCentavos).toBe(0);
  expect(result.descontoAvisoCentavos).toBe(162_100);
});
```

- [ ] **Step 2: Testar avos, saldo confirmado e prazo legal**

```ts
it('conta avo somente quando o mes tem pelo menos quinze dias computaveis', () => {
  expect(calcularAvos('2026-08-01', '2026-08-14')).toBe(0);
  expect(calcularAvos('2026-08-01', '2026-08-15')).toBe(1);
});

it('prefere o saldo de FGTS confirmado', () => {
  const result = calcularRescisao({ ...base, motivo: 'sem_justa_causa', saldoFgtsCentavos: 150_000 });
  expect(result.fonteSaldoFgts).toBe('confirmada');
  expect(result.multaFgtsCentavos).toBe(60_000);
});

it('informa quitacao em dez dias corridos', () => {
  expect(calcularRescisao({ ...base, motivo: 'sem_justa_causa' }).dataLimitePagamento).toBe('2026-08-27');
});
```

- [ ] **Step 3: Executar os testes e confirmar RED**

Run: `npx vitest run src/domains/finance/services/equipeRescisao.test.ts`

Expected: FAIL porque o serviço ainda não existe.

- [ ] **Step 4: Implementar tipos e validação**

```ts
export type MotivoRescisao = 'sem_justa_causa' | 'acordo' | 'pedido_demissao';
export type TipoAviso = 'indenizado' | 'trabalhado' | 'dispensado' | 'nao_cumprido';

export type RescisaoInput = {
  motivo: MotivoRescisao;
  dataAdmissao: string;
  dataDesligamento: string;
  salarioCentavos: number;
  aviso: TipoAviso;
  saldoFgtsCentavos: number | null;
  fgtsHistoricoEstimadoCentavos: number;
  feriasVencidasPeriodos: number;
  mediasRemuneratoriasCentavos: number;
  descontosCentavos: number;
};

export type RescisaoResultado = {
  saldoSalarioCentavos: number;
  avisoPrevioCentavos: number;
  descontoAvisoCentavos: number;
  decimoTerceiroCentavos: number;
  feriasVencidasCentavos: number;
  feriasProporcionaisComTercoCentavos: number;
  fgtsRescisorioCentavos: number;
  multaFgtsCentavos: number;
  percentualMultaFgts: 0 | 0.2 | 0.4;
  fonteSaldoFgts: 'estimada' | 'confirmada';
  totalEmpresaCentavos: number;
  totalLiquidoEstimadoCentavos: number;
  dataLimitePagamento: string;
};
```

Datas inválidas, desligamento anterior à admissão, salário negativo e quantidades negativas devem lançar `RangeError`.

- [ ] **Step 5: Implementar fórmulas em centavos**

```ts
const salarioBase = salarioCentavos + mediasRemuneratoriasCentavos;
const saldoSalario = Math.round((salarioBase / 30) * diaDoDesligamento);
const diasAviso = Math.min(90, 30 + Math.max(0, anosCompletos - 1) * 3);
const avisoIntegral = Math.round((salarioBase / 30) * diasAviso);
const avisoPrevio = motivo === 'acordo'
  ? Math.round(avisoIntegral / 2)
  : motivo === 'sem_justa_causa' && aviso === 'indenizado'
    ? avisoIntegral
    : 0;
const descontoAviso = motivo === 'pedido_demissao' && aviso === 'nao_cumprido'
  ? avisoIntegral
  : 0;
const percentualMulta = motivo === 'sem_justa_causa' ? 0.4 : motivo === 'acordo' ? 0.2 : 0;
const baseMulta = saldoFgtsCentavos ?? fgtsHistoricoEstimadoCentavos;
const multaFgts = Math.round(baseMulta * percentualMulta);
```

Projetar a data final pelo aviso indenizado antes de calcular avos. `calcularAvos` conta cada mês civil com pelo menos 15 dias computáveis, limitado a 12 por período. FGTS rescisório usa 8% das verbas com incidência configuradas no serviço e fica separado da multa. Somar todas as verbas positivas e subtrair descontos para obter o total líquido; `totalEmpresaCentavos` inclui depósitos rescisórios e multa.

- [ ] **Step 6: Confirmar GREEN**

Run: `npx vitest run src/domains/finance/services/equipeRescisao.test.ts`

Expected: PASS em todos os cenários e bordas de data.

- [ ] **Step 7: Commit**

```bash
git add src/domains/finance/services/equipeRescisao.ts src/domains/finance/services/equipeRescisao.test.ts
git commit -m "feat(equipe): criar simulador puro de rescisao"
```

### Task 4: Restaurar a diferença do Uber na interface semanal

**Files:**
- Modify: `src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx`
- Modify: `src/domains/finance/components/equipe/AcertoSemanalFuncionario.tsx`

- [ ] **Step 1: Escrever o teste RED da composição visível**

```ts
it('mostra Uber base, passagem, diferenca e meta sem misturar o relatorio', () => {
  render(<AcertoSemanalFuncionario
    colaboradorId="colaborador-1"
    colaboradorNome="Shuellen Pereira Santos"
    valorPassagem={6.25}
    uberBase={12}
    weekStart="2026-08-17"
  />);

  fireEvent.change(screen.getByLabelText('Uber real de Segunda'), { target: { value: '13.92' } });
  expect(screen.getByText('Diferença')).toBeInTheDocument();
  expect(screen.getByText('R$ 1,92')).toBeInTheDocument();
  expect(screen.getByText('Uber base')).toBeInTheDocument();
  expect(screen.getByText('Passagens')).toBeInTheDocument();
});
```

No teste existente de geração, manter a expectativa de somente dois itens contábeis: `transporte` e `meta`.

- [ ] **Step 2: Executar e confirmar RED**

Run: `npx vitest run src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx`

Expected: FAIL porque `Diferença`, Uber base e passagens não aparecem.

- [ ] **Step 3: Restaurar a coluna por dia**

Dentro de `renderFields`, calcular:

```ts
const diferenca = inputs[index].trabalhou ? Math.max(0, inputs[index].uber - uberBase) : 0;
```

Renderizar quatro campos/valores, preservando `Meta`:

```tsx
<div className="grid min-w-[620px] grid-cols-4 gap-3 sm:min-w-0">
  {/* Uber real */}
  <div className="text-xs text-muted-foreground">Passagem<p>{formatMoney(valorPassagem)}</p></div>
  <div className="text-xs text-muted-foreground">Diferença<p>{formatMoney(diferenca)}</p></div>
  {/* Meta */}
</div>
```

Usar uma função local `formatMoney` com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, sem concatenar casas decimais manualmente.

- [ ] **Step 4: Expandir o resumo sem alterar o lançamento**

```tsx
<SettlementSummary
  lines={[
    { label: 'Uber real', value: centavosParaDecimal(totals.uberRealCentavos) },
    { label: 'Uber base', value: centavosParaDecimal(totals.uberBaseCentavos) },
    { label: 'Passagens', value: centavosParaDecimal(totals.passagensCentavos) },
    { label: 'Diferença', value: centavosParaDecimal(totals.diferencaUberCentavos), tone: 'warning' },
    { label: 'Metas', value: centavosParaDecimal(totals.metaCentavos), tone: 'accent' },
  ]}
  total={centavosParaDecimal(totals.totalCentavos)}
/>
```

Se `SettlementSummary` não aceitar `warning`, adicionar esse tom ao tipo e mapear para a cor âmbar já usada no projeto.

- [ ] **Step 5: Confirmar GREEN**

Run: `npx vitest run src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx src/domains/finance/services/equipeCalculations.test.ts`

Expected: PASS e geração de apenas uma obrigação com transporte e meta separados.

- [ ] **Step 6: Commit**

```bash
git add src/domains/finance/components/equipe/AcertoSemanalFuncionario.tsx src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx src/domains/finance/components/equipe/SettlementSummary.tsx
git commit -m "fix(equipe): restaurar diferenca do uber no acerto"
```

### Task 5: Construir composição mensal e simulador na aba Financeiro

**Files:**
- Create: `src/domains/finance/components/equipe/EmployeeCostBreakdown.tsx`
- Create: `src/domains/finance/components/equipe/EmployeeCostBreakdown.test.tsx`
- Create: `src/domains/finance/components/equipe/TerminationSimulator.tsx`
- Create: `src/domains/finance/components/equipe/TerminationSimulator.test.tsx`
- Modify: `src/domains/finance/components/equipe/ColaboradorCard.tsx`
- Modify: `src/pages/Equipe.tsx`
- Modify: `src/pages/EquipeDetalhe.tsx`
- Modify: `src/pages/EquipeDetalhe.test.tsx`

- [ ] **Step 1: Escrever teste RED da composição de custo**

```tsx
it('mostra encargos MEI e piso apenas como alerta', () => {
  render(<EmployeeCostBreakdown
    salarioCentavos={162_100}
    inssEmpresaCentavos={4_863}
    fgtsCentavos={12_968}
    decimoTerceiroCentavos={13_508}
    feriasCentavos={18_011}
    pisoCategoriaCentavos={168_118}
    convencaoMte="MR009846/2026"
    fonteUrl="https://mediador.trabalho.gov.br/exemplo"
  />);

  expect(screen.getByText('3%')).toBeInTheDocument();
  expect(screen.getByText('R$ 48,63')).toBeInTheDocument();
  expect(screen.getByText(/diferença informativa de R\$ 60,18/i)).toBeInTheDocument();
  expect(screen.getByText('R$ 1.621,00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Escrever teste RED do simulador somente leitura**

```tsx
it('troca o cenário e nunca chama uma mutação', () => {
  render(<TerminationSimulator
    dataAdmissao="2026-02-23"
    salarioCentavos={162_100}
    fgtsHistoricoEstimadoCentavos={129_708}
    dataReferencia="2026-08-17"
  />);

  expect(screen.getByText('Custo estimado para a empresa')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Acordo' }));
  expect(screen.getByText(/multa de 20%/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /demitir|pagar|confirmar desligamento/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Executar e confirmar RED**

Run: `npx vitest run src/domains/finance/components/equipe/EmployeeCostBreakdown.test.tsx src/domains/finance/components/equipe/TerminationSimulator.test.tsx`

Expected: FAIL porque os componentes não existem.

- [ ] **Step 4: Implementar `EmployeeCostBreakdown`**

O componente recebe somente números já calculados. Renderizar salário, 3% patronal, 8% FGTS, 13º, férias + 1/3 e total fixo. Quando `pisoCategoriaCentavos > salarioCentavos`, mostrar alerta âmbar com a diferença e link externo seguro:

```tsx
<a href={fonteUrl} target="_blank" rel="noreferrer noopener">
  Ver {convencaoMte} no MTE
</a>
```

Não oferecer alteração automática do salário.

- [ ] **Step 5: Implementar `TerminationSimulator`**

Usar estado local para cenário, data, aviso, saldo confirmado opcional, férias vencidas, médias e descontos. Em `useMemo`, converter os campos para centavos e chamar `calcularRescisao`. Renderizar:

```tsx
const scenarios = [
  { value: 'sem_justa_causa', label: 'Sem justa causa' },
  { value: 'acordo', label: 'Acordo' },
  { value: 'pedido_demissao', label: 'Pedido de demissão' },
] as const;
```

Mostrar cada linha do resultado, `Custo estimado para a empresa`, `Estimativa líquida do funcionário`, fonte do saldo FGTS, data-limite e aviso “Confirme os valores no eSocial/FGTS Digital e com a contabilidade”. Não importar Supabase, hooks de mutação ou serviços Divipay.

- [ ] **Step 6: Integrar regime e estado contratual nos cards**

Em `Equipe.tsx`, obter `activeWorkspace` e passar `regimeEncargos={activeWorkspace?.regime_encargos ?? 'geral'}` ao `ColaboradorCard`.

Em `ColaboradorCard`, adicionar a prop, passá-la a `calcularCustoColaborador` e usar `resolverEstadoContrato` para não mostrar “0 dias” após o término.

- [ ] **Step 7: Integrar a aba Financeiro do perfil**

Em `EquipeDetalhe.tsx`:

```ts
const { activeWorkspace } = useWorkspace();
const calc = useColaboradorCalculos(
  colaborador,
  custos,
  presencas,
  monthRef,
  activeWorkspace?.regime_encargos ?? 'geral',
);
```

Mostrar `Prazo indeterminado` quando `calc.estadoContrato.estado === 'indeterminado'`. Na aba `finance`, renderizar `EmployeeCostBreakdown` antes de `TerminationSimulator`; o simulador aparece somente para funcionário com contrato indeterminado.

- [ ] **Step 8: Atualizar o teste integrado do perfil**

Configurar o mock do workspace como MEI e a admissão como `2026-02-23`. Testar:

```ts
expect(screen.getByText('Prazo indeterminado')).toBeInTheDocument();
fireEvent.click(screen.getByRole('tab', { name: 'Financeiro' }));
expect(screen.getByText('R$ 2.114,50')).toBeInTheDocument();
expect(screen.getByText('Simulador de desligamento')).toBeInTheDocument();
expect(screen.getByText(/diferença informativa de R\$ 60,18/i)).toBeInTheDocument();
```

- [ ] **Step 9: Confirmar GREEN**

Run: `npx vitest run src/domains/finance/components/equipe/EmployeeCostBreakdown.test.tsx src/domains/finance/components/equipe/TerminationSimulator.test.tsx src/pages/EquipeDetalhe.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/domains/finance/components/equipe/EmployeeCostBreakdown.tsx src/domains/finance/components/equipe/EmployeeCostBreakdown.test.tsx src/domains/finance/components/equipe/TerminationSimulator.tsx src/domains/finance/components/equipe/TerminationSimulator.test.tsx src/domains/finance/components/equipe/ColaboradorCard.tsx src/pages/Equipe.tsx src/pages/EquipeDetalhe.tsx src/pages/EquipeDetalhe.test.tsx
git commit -m "feat(equipe): exibir custos MEI e simular rescisao"
```

### Task 6: Verificação funcional, visual e de segurança

**Files:**
- Create: `docs/qa/equipe-rescisao-transporte.md`
- Modify: arquivos de teste somente quando uma falha revelar regressão real desta entrega.

- [ ] **Step 1: Executar testes focados**

Run: `npx vitest run src/domains/finance/services/equipeCalculations.test.ts src/domains/finance/services/equipeRescisao.test.ts src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx src/domains/finance/components/equipe/EmployeeCostBreakdown.test.tsx src/domains/finance/components/equipe/TerminationSimulator.test.tsx src/pages/EquipeDetalhe.test.tsx`

Expected: todos PASS.

- [ ] **Step 2: Executar suíte completa e verificações estáticas**

```bash
npx vitest run
npx tsc --noEmit
npm run lint
npm run build
```

Expected: exit code 0 em todos. Warnings preexistentes são registrados separadamente; nenhum warning novo destes arquivos é aceito.

- [ ] **Step 3: Verificar que o simulador não produz efeitos colaterais**

Run: `rg -n "supabase|mutate|Divipay|createWithdraw|insert\(|update\(" src/domains/finance/components/equipe/TerminationSimulator.tsx`

Expected: nenhuma ocorrência.

- [ ] **Step 4: Verificar segurança e isolamento**

Run: `supabase test db supabase/tests/equipe_centro_rh_financeiro.sql`

Expected: PASS para proprietário, sócia administradora, usuário de outro workspace e configuração trabalhista.

Run: `rg -n "console\.(log|error).*?(pix|cpf|rg|banco|conta|salario)" src/domains/finance src/pages/EquipeDetalhe.tsx`

Expected: nenhuma ocorrência.

- [ ] **Step 5: Fazer QA visual no navegador local**

Abrir `/equipe/e7418ee8-0521-4a97-91d0-38cbcd4b6db3` e validar em 1440×900, 768×1024 e 375×812:

- custo fixo MEI de R$ 2.114,50 para salário de R$ 1.621,00, sem transporte/metas;
- alerta do piso sem alterar o salário;
- status `Prazo indeterminado`, sem “faltam 0 dias”;
- três cenários do simulador com detalhamento e ressalvas;
- ausência de botão de demissão/pagamento no simulador;
- Uber real, passagem, diferença e meta legíveis;
- resumo semanal e total da transferência conferem;
- Pix permanece mascarado.

- [ ] **Step 6: Registrar evidências**

Criar `docs/qa/equipe-rescisao-transporte.md` com data, commit testado, comandos/saídas, resoluções conferidas e limitações externas. Não registrar CPF, Pix, conta bancária ou outros dados pessoais.

- [ ] **Step 7: Commit final de QA**

```bash
git add docs/qa/equipe-rescisao-transporte.md
git commit -m "test(equipe): validar rescisao MEI e transporte"
```

## Self-review

- Cobertura da especificação: configuração por workspace, custo MEI, salário preservado, piso informativo, contrato expirado, cenários de rescisão, saldo FGTS estimado/confirmado, prazo de dez dias, transporte detalhado, separação contábil, responsividade, RLS e ausência de efeitos colaterais estão mapeados.
- Escopo mantido: não envia desligamento ao eSocial, não altera salário, não cria despesa no simulador e não muda a transferência semanal única.
- Consistência de tipos: `RegimeEncargos`, `EstadoContrato`, `RescisaoInput` e os novos totais do transporte são definidos antes de serem usados nos hooks e componentes.
- Granularidade revisada: todas as mudanças possuem arquivo, teste, comando, resultado esperado e commit correspondentes.
