# Captura Inbox: Correção dos Bloqueios Críticos de Segurança e Hardening para Produção

- **Data**: 2026-09-20 12:23:00
- **Origem**: Continuação da entrega de auditoria SPEC-0001 (Fase 1 do Plano de Prontidão)
- **Solicitação**: Implementar a Fase 1 do Plano de Prontidão para Produção:
  1. SEC-001: Validação de JWT e proteção contra IDOR em validar-senha.
  2. SEC-002: Proteção de acesso com verificação de administrador em test-webhook.
  3. SEC-003: Eliminação de injeção de user_id / Confused Deputy em openai-proxy (/transcribe-audio).
  4. SEC-004: Blindagem do .dockerignore para impedir cópia de qualquer .env* para contêineres de produção.
  5. GIT-001: Reconciliação / integração dos 70 commits de hardening de segurança do PR #80 na branch develop.
