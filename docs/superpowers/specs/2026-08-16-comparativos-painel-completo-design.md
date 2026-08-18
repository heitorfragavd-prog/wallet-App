# Comparativos — painel completo em Relatórios

## Objetivo

Unificar o Comparativo Diário e o Comparativo Mensal dentro da aba **Comparativos** de Relatórios. A experiência padrão será um painel completo que exibe as duas análises simultaneamente, preservando os hooks, valores reais, fórmulas financeiras e isolamento por workspace existentes.

## Decisão aprovada

O painel seguirá a direção visual da opção 2 apresentada no companion: uma central de desempenho financeiro com resumo compartilhado, Ritmo Diário e Histórico Mensal no mesmo painel.

Essa decisão altera dois pontos do pedido inicial, conforme aprovação explícita do usuário:

- A visão padrão será `completa`, não `diaria`.
- Na visão completa, os hooks diário e mensal serão executados simultaneamente.

Nenhuma outra restrição financeira ou de escopo foi removida.

## Navegação e URL

A aba principal Relatórios terá a ordem:

`Visão Geral | Comparativos | Categorias | Transações | Dívidas | Metas | Recorrentes`

Os modos internos serão:

- `Painel completo`: `?aba=comparativos&visao=completa`
- `Somente diário`: `?aba=comparativos&visao=diaria`
- `Somente mensal`: `?aba=comparativos&visao=mensal`

Ao entrar em Comparativos sem uma visão válida, a aplicação normaliza a URL para `visao=completa`. A rota antiga `/comparativo` redireciona para `/relatorios?aba=comparativos&visao=completa`.

Não haverá item Comparativo separado no menu lateral. Relatórios permanecerá destacado em todos os três modos.

## Arquitetura de componentes

```text
src/domains/finance/components/comparativos/
├── ComparativosView.tsx
├── ComparativoDiarioView.tsx
├── ComparativoMensalView.tsx
├── ComparativoKpiCard.tsx
└── ComparativoTooltip.tsx
```

### ComparativosView

- Controla `visao` pela URL.
- Renderiza o seletor `Painel completo | Somente diário | Somente mensal`.
- Na visão completa, monta as duas visões em grade responsiva.
- Nas visões isoladas, monta apenas o componente escolhido.
- Mantém os estados diário e mensal independentes.
- Deriva os cards superiores exclusivamente dos resultados fornecidos pelos dois hooks, sem criar uma terceira regra de consolidação.

### ComparativoDiarioView

- Preserva `useComparativoDiario` e suas fórmulas.
- Preserva seletor de dia, períodos 3M/6M/12M, três KPIs, médias, diferenças, insight e quatro séries.
- Inclui a linha vertical âmbar no dia selecionado e a correção visual de “Dia 31” do commit `4e34793`.
- Valores reais terminam no dia aplicável; médias históricas seguem até o último dia aplicável.

### ComparativoMensalView

- Preserva `useComparativoPeriodos` e suas regras de consulta, consolidação, ordenação e workspace.
- Exibe receitas, despesas e `Resultado do mês = Receitas - Despesas`.
- Usa ComposedChart com barras de receita/despesa e linha de resultado.
- Exibe médias de receita, despesa e resultado, além do melhor resultado do período.
- Mantém cards mensais, variações e identificação discreta `Mês parcial` para o mês atual.

### Componentes compartilhados

`ComparativoKpiCard` padroniza rótulo, valor, variação, cor e estados visuais. `ComparativoTooltip` formata valores monetários e séries sem alterar dados.

## Comportamento dentro de Relatórios

Quando Comparativos estiver ativo:

- Manter o cabeçalho principal Relatórios.
- Ocultar filtros gerais, quatro cards gerais e exportações que não representam os comparativos.
- Exibir apenas controles específicos do painel.

Ao sair de Comparativos, filtros, cards e exportações voltam ao estado normal. Nenhuma outra aba será refatorada além do necessário para preservar essa alternância.

## Estados e falhas parciais

Diário e mensal têm loading, erro, ausência de workspace, histórico insuficiente e período sem movimentação independentes.

Na visão completa:

- Falha diária não esconde o histórico mensal.
- Falha mensal não esconde o ritmo diário.
- Erro de consulta nunca é apresentado como `R$ 0,00`.
- `Sem movimentação` e `Não foi possível carregar os dados` são estados distintos.

Os cards combinados exibem somente métricas cujas fontes estejam disponíveis. Uma métrica indisponível apresenta estado explícito, sem inventar ou zerar valores.

## Visual responsivo

O painel usa fundo escuro, bordas azuladas, grid suave, verde para receita, vermelho/rosa para despesa, azul para resultado e âmbar para seleção/alertas.

No desktop, diário e mensal ocupam duas colunas na visão completa. No celular, as visões são empilhadas, os KPIs usam uma ou duas colunas conforme a largura e nenhum gráfico gera rolagem horizontal.

## Preservação financeira e escopo proibido

Não serão alterados:

- Consolidação de receitas ou despesas.
- Regras contra duplicação de Eyemobile, Divipay e receitas manuais.
- Isolamento de workspace ou fallback de `workspace_id`.
- DRE, Dashboard ou importador de faturas.
- Migrations, RPCs ou dados simulados.

Do commit `4e34793`, somente as correções pertinentes ao comparativo serão reaplicadas. Arquivos do importador e migrations permanecem excluídos.

## Testes e validação

Os testes cobrirão:

- Normalização para `visao=completa`, alternância e persistência das três visões.
- Redirecionamento de `/comparativo` para a visão completa.
- Remoção do item lateral e destaque de Relatórios.
- Preservação dos cálculos diário e mensal.
- Datas 28, 29 e 31; valores futuros nulos; linha vertical selecionada.
- Resultado mensal, períodos 3/6/12, saldo negativo, mês parcial, variações e workspaces.
- Falhas parciais independentes na visão completa.
- Restauração de filtros, cards e exportação ao sair de Comparativos.

Validação final obrigatória:

```powershell
npx vitest run
npx tsc --noEmit
npm run build
git diff --check
```

Também serão validadas e capturadas as visões completa, diária e mensal em desktop e celular, além do menu lateral e do redirecionamento legado.

## Git e entrega

A implementação ocorre somente em `feat/comparativo-financeiro-diario`. Serão adicionados apenas arquivos relacionados a Comparativos, Relatórios, rota, menu e testes correspondentes. Não haverá push, merge, deploy ou execução de migrations.
