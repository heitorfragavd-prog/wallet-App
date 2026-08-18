# QA — Equipe: Centro de RH e Financeiro

Data: 17/08/2026

## Evidências

- TypeScript: `npx tsc --noEmit` — aprovado.
- Testes frontend/serviços: 29 arquivos e 166 testes — aprovados.
- Testes PostgreSQL/RLS: 56 testes — aprovados.
- Build de produção: `npm run build` — aprovado.
- Lint do escopo novo: zero erros (somente avisos de Fast Refresh por exportar utilitários testáveis).
- Busca por logs de CPF, RG, telefone, dados bancários e chave Pix no fluxo Equipe/Divipay — nenhuma ocorrência.

## Cenários cobertos

- Funcionário: salário mensal, experiência, custo/dia e acerto semanal de transporte/meta.
- Folguista: escala, diária, conta pendente, cancelamento e ajuste auditável.
- Sócios: pró-labore individual com vencimento no dia 16 ou 25.
- Pagamento: uma transferência Divipay com composição contábil separada e taxa isolada.
- Conciliação externa: chave Pix normalizada + workspace + valor exato + janela de data; ambiguidades não são baixadas automaticamente.
- Privacidade: dados sensíveis mascarados por padrão e RLS por proprietário/administrador do workspace.
- Acesso compartilhado: administradora do workspace enxerga a mesma equipe; outro workspace não enxerga dados.

## Observações do projeto existente

- O lint global possui débito técnico anterior ao módulo Equipe (418 erros na execução de 17/08/2026).
- A auditoria de produção não aponta mais a biblioteca `xlsx`, removida por não possuir correção. As exportações usam SpreadsheetML/CSV interno com neutralização de fórmulas.
- Alertas restantes do npm estão em ferramenta de build (`picomatch`) e React Router 6; a correção publicada do Router exige migração principal para v7 e deve ser tratada separadamente para evitar quebra ampla de rotas.
