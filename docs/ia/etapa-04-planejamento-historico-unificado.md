# 👑 WALLET CEO 3.0 — ETAPA 04: HISTÓRICO UNIFICADO APP / TELEGRAM
## Especificação Técnica & Plano Canônico de Arquitetura

---

### 1. OBJETIVO DA ETAPA 04

Garantir que a experiência de diálogo, auditoria, memória e execução com a IA seja perfeitamente contínua e intercambiável entre a interface Web (`wallet.wonderwold.com.br`) e o bot do Telegram (`@WalletCortexxBot`).

O usuário deve poder:
1. Iniciar uma conversa no Telegram e continuar no Web App sem perda de contexto ou resumo.
2. Iniciar um diálogo analítico no Web App e receber alertas/desdobramentos no Telegram na mesma conversa.
3. Manter isolamento estrito de permissões (RBAC) e privacidade (RLS) independente da origem da mensagem.

---

### 2. ARQUITETURA DE DADOS CANÔNICA

#### 2.1. Tabela `wallet_ai_conversations` (Evolução)
- `channel`: Enum/text `'web' | 'telegram' | 'omnichannel'` (identifica o canal de criação ou se é híbrido).
- `external_chat_id`: `bigint / text` indexado para vincular o `telegram_chat_id` à conversa ativa.
- `last_channel`: Canal da última mensagem enviada (`web` ou `telegram`).
- `agent_type`: Mantém a segregação canônica (`ceo` vs `operational`).

#### 2.2. Tabela `wallet_ai_messages` (Evolução)
- `channel`: `'web' | 'telegram'` em cada registro de mensagem para fins de auditoria, renderização e telemetria.
- `external_message_id`: ID da mensagem no Telegram (para idempotência e deduplicação de webhooks).

#### 2.3. Tabela de Vinculação de Identidade: `telegram_user_links`
- Mapeia de forma segura:
  - `telegram_user_id` (bigint)
  - `telegram_username` (text)
  - `user_id` (uuid -> auth.users)
  - `workspace_id` (uuid -> workspaces)
  - `link_status` (`pending` | `active` | `revoked`)
  - `otp_hash` (text, para pareamento seguro)
  - `created_at` / `verified_at`

---

### 3. MECANISMO DE PAREAMENTO SEGURO (ZERO VULNERABILIDADE)

Nenhum usuário pode interagir pelo Telegram sem vinculação criptográfica prévia:
1. No Web App (`/perfil` ou `/configuracoes`), o usuário clica em "Conectar Telegram".
2. O backend gera um token criptográfico efêmero de uso único (TOTP / nonce de 6 dígitos com validade de 10 minutos).
3. O usuário clica no link profundo `https://t.me/WalletCortexxBot?start=<nonce>` ou envia `/start <nonce>`.
4. O webhook do Telegram valida o nonce, associa o `telegram_user_id` ao `user_id` autenticado e confirma o workspace ativo.
5. Se o nonce estiver expirado ou reutilizado, a requisição é rejeitada.

---

### 4. REGRAS DE CONTINUIDADE DE SESSÃO & TIMEOUTS

- **Janela de Sessão Ativa:** 4 horas de inatividade entre mensagens.
- Se o usuário enviar nova mensagem dentro de 4 horas: a conversa ativa é mantida, preservando o contexto e resumo canônico.
- Se o intervalo exceder 4 horas: uma nova sessão é iniciada, arquivando a anterior com seu resumo canônico (`summary`) disponível para consultas futuras.
- O Web App exibirá um indicador visual de canal ao lado de cada mensagem (ícone Web vs Telegram).

---

### 5. IDEMPOTÊNCIA E PREVENÇÃO DE DUPLICIDADE EM WEBHOOKS

O Telegram retransmite webhooks em casos de latência de resposta (> 5s):
1. A Edge Function `telegram-webhook` consultará a tabela `telegram_processed_updates` com chave `update_id`.
2. Se `update_id` já existir: responderá `200 OK` imediatamente sem reprocessar LLM ou ferramentas.
3. Lock otimista no processamento para evitar disparos concorrentes de ferramentas financeiras.

---

### 6. COMPATIBILIDADE COM OS DOIS CÉREBROS (RBAC NO TELEGRAM)

- **Default:** O canal Telegram opera por padrão conectado ao cérebro **Wallet IA (Operacional)** para registro rápido de despesas, conciliação e consultas de saldo.
- **Modo Executivo (Wallet CEO via Telegram):**
  - Apenas permitido se o usuário vinculado possuir papel comprovado de `owner` ou `admin` (`isCeoExecutiveAuthorized`).
  - Acionado explicitamente via comando `/ceo <pergunta>` ou seletor interativo.
  - Se um usuário comum (ex: `delivery_staff` ou `member`) tentar usar `/ceo`, recebe resposta explicativa: `"Acesso restrito ao Painel Executivo do Proprietário/Admin."` com bloqueio no backend sem consumo de tokens LLM.

---

### 7. ROTEIRO DE ROLLOUT (ETAPA 04)

1. **Fase 4.1 — Migração de Banco:** Criar `79_unificacao_historico_telegram.sql` (tabela de links, campos de canal e índices).
2. **Fase 4.2 — Handshake de Pareamento:** Implementar endpoints `/auth/telegram/link` e `/auth/telegram/verify`.
3. **Fase 4.3 — Webhook Integrado:** Atualizar `telegram-webhook` Edge Function para invocar o orquestrador canônico com o mesmo pipeline de memória.
4. **Fase 4.4 — UI no Web App:** Adicionar badge de canal (Telegram / Web) e aba de gerenciamento de integrações de mensageria.
5. **Fase 4.5 — Testes E2E e Homologação:** Validar concorrência, idempotência e continuidade contextual.
