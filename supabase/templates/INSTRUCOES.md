# Instruções para Aplicar Templates de Email

## Opção 1: Via Dashboard do Supabase (Recomendado)

1. Acesse o Dashboard do Supabase:
   https://supabase.com/dashboard/project/xjrjenniszhshrgtdjcp/auth/templates

2. Para cada template, siga estes passos:

### Confirmation (Confirmação de Cadastro)
- Clique em "Confirm signup"
- Cole o conteúdo de `confirmation.html`
- Altere o assunto para: **Confirme seu cadastro - Wallet**
- Clique em "Save"

### Magic Link
- Clique em "Magic Link"
- Cole o conteúdo de `magic_link.html`
- Altere o assunto para: **Seu link de acesso - Wallet**
- Clique em "Save"

### Recovery (Recuperação de Senha)
- Clique em "Reset Password"
- Cole o conteúdo de `recovery.html`
- Altere o assunto para: **Recuperação de senha - Wallet**
- Clique em "Save"

### Invite (Convite)
- Clique em "Invite user"
- Cole o conteúdo de `invite.html`
- Altere o assunto para: **Você foi convidado - Wallet**
- Clique em "Save"

### Email Change (Alteração de Email)
- Clique em "Change Email Address"
- Cole o conteúdo de `email_change.html`
- Altere o assunto para: **Confirme a alteração de email - Wallet**
- Clique em "Save"

## Opção 2: Via Management API (Script Automatizado)

### Pré-requisitos
- `curl` instalado
- `jq` instalado (para processar JSON)
- Token de acesso do Supabase

### Passos

1. Obtenha seu token de acesso:
   - Acesse: https://supabase.com/dashboard/account/tokens
   - Crie um novo token ou use um existente
   - Copie o token

2. Configure a variável de ambiente:
   ```bash
   export SUPABASE_ACCESS_TOKEN="seu-token-aqui"
   ```

3. Execute o script:
   ```bash
   cd supabase/templates
   ./apply-templates.sh
   ```

4. Verifique a saída:
   - Se bem-sucedido, você verá uma mensagem de confirmação
   - Acesse o Dashboard para verificar os templates aplicados

### Troubleshooting

**Erro: "jq: command not found"**
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq
```

**Erro: "Permission denied"**
```bash
chmod +x apply-templates.sh
```

**Erro: "SUPABASE_ACCESS_TOKEN não está configurado"**
```bash
export SUPABASE_ACCESS_TOKEN="seu-token"
```

## Verificação

Após aplicar os templates, teste enviando emails:

1. **Teste de Confirmação:**
   - Crie uma nova conta no app
   - Verifique o email recebido

2. **Teste de Magic Link:**
   - Tente fazer login com magic link
   - Verifique o email recebido

3. **Teste de Recuperação:**
   - Use "Esqueci minha senha"
   - Verifique o email recebido

## Notas Importantes

- Os templates usam gradiente laranja (#ff6b35 → #f7931e) como cor principal
- Todos os textos estão em português do Brasil
- Os templates são responsivos e funcionam em todos os clientes de email
- Links expiram em 1 hora por padrão
- Cada link pode ser usado apenas uma vez

## Suporte

Se encontrar problemas:
1. Verifique os logs do Supabase Auth
2. Confirme que o SMTP está configurado corretamente
3. Teste com diferentes provedores de email (Gmail, Outlook, etc.)
