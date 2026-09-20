# Plano de Prontidão para Produção (Production Readiness Plan)

**Data de Publicação**: 2026-09-16  
**Documento Normativo**: SPEC-0001 (`0001-auditoria-seguranca-debito-tecnico-producao`)  
**Público-Alvo**: Desenvolvedores, Engenharia de Plataforma e Tomadores de Decisão (Adequado para perfil iniciante)  

---

## 1. Resumo Executivo e Visão Geral

Este documento consolida a avaliação completa da aplicação Wallet em quatro frentes de prontidão: **Segurança de Segredos**, **Qualidade Técnica e Build**, **Governança Git** e **Infraestrutura de Runtime**.

> [!CAUTION]
> **PORTÃO DE LIBERAÇÃO: BLOQUEADO (NOT READY)**  
> Foram identificadas **3 vulnerabilidades Críticas/Altas** e **1 pendência de integração Git** que impedem o deploy imediato para o ambiente produtivo (`wallet.cortexx.online`). O deploy permanece suspenso até a conclusão das Fases 1 e 2 deste plano.

---

## 2. Matriz Consolidada de Severidade

A matriz a seguir qualifica todos os apontamentos diagnosticados durante a auditoria.

| Categoria | ID | Apontamento / Vulnerabilidade | Impacto Prático (Explicado para Iniciante) | Severidade | Bloqueante para Deploy? |
| --- | --- | --- | --- | --- | --- |
| **Segurança** | SEC-001 | IDOR e ausência de verificação JWT em `validar-senha` | Um invasor pode alterar a senha de investimentos de qualquer usuário apenas sabendo o ID dele. | **Crítico** | **SIM** |
| **Segurança** | SEC-002 | Endpoint desprotegido com service_role em `test-webhook` | Qualquer pessoa na internet pode chamar o endpoint e disparar requisições em nome do servidor. | **Alto** | **SIM** |
| **Segurança** | SEC-003 | Confused Deputy em `openai-proxy` (`/transcribe-audio`) | Um usuário pode forçar o sistema a gastar os créditos de IA de outro usuário. | **Alto** | **SIM** |
| **Git** | GIT-001 | 70 commits de segurança do PR #80 não mesclados na `develop` | A branch principal está sem as proteções de segurança já homologadas e prontas. | **Alto** | **SIM** |
| **Segurança** | SEC-004 | `.dockerignore` não bloqueia arquivos `.env*` adicionais | Risco de colocar acidentalmente chaves secretas dentro da imagem pública do Docker. | **Médio** | **SIM** |
| **Segurança** | SEC-005 | Interpolação HTML sem escape em `gerar-recibo` | Risco de injeção de scripts (XSS) em recibos gerados. | **Médio** | Não |
| **Qualidade** | QUA-004 | Chunks do frontend acima de 500 kB (`Relatorios` 702 kB) | A tela de relatórios demora mais para carregar em celulares ou conexões lentas. | **Médio** | Não |
| **Qualidade** | QUA-005 | Modo estrito do TypeScript desligado (`strict: false`) | Erros sutis de valores nulos podem passar despercebidos durante o desenvolvimento. | **Médio** | Não |

---

## 3. Critérios Bloqueantes de Deploy

Em conformidade com a política de tolerância zero (**NFR-004** e **AC-011**):
1. **Regra de Bloqueio**: Nenhum artefato de build pode ser promovido para produção enquanto houver apontamentos com severidade **Crítico** ou **Alto**.
2. **Critério de Desbloqueio**:
   - Resolução das vulnerabilidades SEC-001, SEC-002, SEC-003 e SEC-004.
   - Integração segura e homologada do PR #80 na branch de release (GIT-001).
   - Suíte Vitest e checagem de tipos operando com 100% de aprovação.

---

## 4. Plano de Ação Corretivo Faseado

O plano de ação está dividido em 3 fases lógicas ordenadas para garantir uma transição suave, segura e auditável:

### Fase 1 — Saneamento Bloqueante de Segurança e Hardening (Prioridade Imediata)
**Objetivo**: Eliminar todas as vulnerabilidades Críticas e Altas que impedem o deploy.
- **Ação 1.1**: Proteger `supabase/functions/validar-senha` exigindo validação estrita do cabeçalho JWT (`supabase.auth.getUser`) e garantindo que o `user_id` do token corresponda ao alvo da operação.
- **Ação 1.2**: Proteger `supabase/functions/test-webhook` adicionando barreira de autorização ou restringindo o acesso exclusivamente a chamadas de administradores autenticados.
- **Ação 1.3**: Ajustar `supabase/functions/openai-proxy` para que o `user_id` seja extraído com segurança do token autenticado, impedindo falsificação via `formData`.
- **Ação 1.4**: Atualizar `.dockerignore` adicionando `**/.env*` para garantir que nenhum segredo local ou de staging seja embutido nas imagens Docker de produção.
- **Ação 1.5**: Avaliar a estratégia de mesclagem ou cherry-pick dos 70 commits do PR #80 (`security/comprehensive-audit-hardening`), incorporando o rate-limiting atômico e as defesas contra SSRF.
- **Esforço Estimado**: 2 dias de desenvolvimento.
- **Teste de Validação**: Testes de integração de Edge Functions e verificação de bloqueio 401/403 em requisições não autenticadas.

### Fase 2 — Preparação de Infraestrutura e Implantação Docker Swarm (Phase B)
**Objetivo**: Subir a aplicação em ambiente de produção seguro com Traefik e SSL.
- **Ação 2.1**: Configurar VPS Hostinger com Docker Swarm single-node.
- **Ação 2.2**: Configurar proxy reverso Traefik com Let's Encrypt para `wallet.cortexx.online` e porta 443 HTTPS.
- **Ação 2.3**: Realizar build da imagem Docker do frontend (`wallet-frontend`) injetando as variáveis públicas (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`).
- **Ação 2.4**: Configurar secrets do Supabase para pg_cron e Edge Functions no ambiente de produção.
- **Esforço Estimado**: 1 dia de infraestrutura.
- **Teste de Validação**: Acesso HTTPS com certificado SSL válido e healthcheck `http://127.0.0.1/health` retornando 200 OK.

### Fase 3 — Otimização de Performance e Débito Técnico (Pós-Deploy)
**Objetivo**: Melhorar a experiência do usuário e a sustentabilidade do código.
- **Ação 3.1**: Implementar `manualChunks` no `vite.config.ts` para separar `jspdf`, `recharts` e `html2canvas`, reduzindo o tamanho de `Relatorios` e `ContasCartoes` para menos de 300 kB.
- **Ação 3.2**: Sanitizar interpolação de strings em `supabase/functions/gerar-recibo`.
- **Ação 3.3**: Ligar gradualmente as flags do modo estrito no TypeScript (`strictNullChecks: true`).
- **Esforço Estimado**: 2 a 3 dias em sprints posteriores.
- **Teste de Validação**: Auditoria Lighthouse com score de performance acima de 85.

---

## 5. Conclusão e Próximos Passos

O diagnóstico comprovou que o frontend da Wallet possui uma qualidade técnica elevada (1394 testes passando e build 100% funcional), porém **o backend em Supabase Edge Functions contém brechas críticas de autorização que tornam o deploy em produção perigoso neste exato momento**.

Ao executar a **Fase 1** deste plano, o sistema atingirá o patamar de segurança necessário para liberar a entrada em produção na Phase B com risco residual mínimo.
