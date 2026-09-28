# Stack do sistema

Documente tecnologias estruturais e a evidência executável que confirma cada
uma. Preserve decisões humanas nas seções livres deste arquivo.

## Inventário detectado

<!-- specsfy:stack:start -->
| Camada | Tecnologia | Evidência |
| --- | --- | --- |
| Biblioteca | React | `package.json` (`react`) |
| Linguagem | TypeScript | `package.json` (`typescript`) |
| Testes | Vitest | `package.json` (`vitest`) |
| Runtime | Node.js | `package.json` |
| Biblioteca | React | `package.json` |
<!-- specsfy:stack:end -->

## Decisões e observações do projeto

Acrescente aqui escolhas, restrições e contexto que não podem ser inferidos dos
manifests.

### Fontes estruturais conferidas no onboarding dos agentes

| Camada | Tecnologia | Evidência |
| --- | --- | --- |
| Build e desenvolvimento | Vite + plugin React SWC; porta 8080 | `vite.config.ts` |
| Desenvolvimento local | Proxy Supabase com agente HTTPS/IPv6; não confundir com produção | `vite.config.ts` |
| Backend | Supabase SDK, Postgres/RLS, Edge Functions | `package.json`, `supabase/migrations/`, `supabase/functions/` |
| Estado remoto | TanStack Query | `package.json`, `src/main.tsx` |
| Interface | Tailwind, Radix, React Hook Form e Zod | `package.json` |
| Gestão de agentes (fora do runtime do app) | Perfis Hermes com SOUL.md e Bot Chat | `.hermes/company/OPERATING-MODEL.md` |

O monitor apontou `vite.config.ts` preexistente como alteração estrutural; esta revisão documenta o estado local, sem atestar sua adequação de rede em produção.
