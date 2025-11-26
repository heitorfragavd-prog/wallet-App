# Templates de Email - Wallet

Este diretório contém os templates HTML personalizados para os emails de autenticação do Supabase.

## Templates Disponíveis

### 1. confirmation.html
**Assunto:** Confirme seu cadastro - Wallet  
**Quando é enviado:** Quando um usuário se cadastra e precisa verificar seu endereço de email  
**Propósito:** Verificação de email para novos registros  
**Variáveis:** `{{ .ConfirmationURL }}`

### 2. magic_link.html
**Assunto:** Seu link de acesso - Wallet  
**Quando é enviado:** Quando um usuário solicita um magic link para login sem senha  
**Propósito:** Login sem senha usando links de email  
**Variáveis:** `{{ .ConfirmationURL }}`

### 3. recovery.html
**Assunto:** Recuperação de senha - Wallet  
**Quando é enviado:** Quando um usuário solicita recuperação de senha  
**Propósito:** Fluxo de recuperação de senha para usuários que esqueceram a senha  
**Variáveis:** `{{ .ConfirmationURL }}`

### 4. invite.html
**Assunto:** Você foi convidado - Wallet  
**Quando é enviado:** Quando um usuário é convidado a se juntar à aplicação via convite por email  
**Propósito:** Permite que administradores convidem usuários que ainda não têm contas  
**Variáveis:** `{{ .ConfirmationURL }}`

### 5. email_change.html
**Assunto:** Confirme a alteração de email - Wallet  
**Quando é enviado:** Quando um usuário solicita alteração de endereço de email  
**Propósito:** Verificação para alterações de endereço de email  
**Variáveis:** `{{ .ConfirmationURL }}`, `{{ .NewEmail }}`

## Variáveis Disponíveis

Todas as variáveis do sistema de templates do Supabase Auth:

- `{{ .ConfirmationURL }}` - URL de confirmação completa
- `{{ .Token }}` - Código OTP de 6 dígitos
- `{{ .TokenHash }}` - Versão hash do token
- `{{ .SiteURL }}` - URL do site da aplicação
- `{{ .Email }}` - Endereço de email do usuário
- `{{ .NewEmail }}` - Novo endereço de email (apenas email_change)

## Como Aplicar os Templates

### Para Desenvolvimento Local

1. Os templates já estão configurados neste diretório
2. Eles serão usados automaticamente pelo Supabase local

### Para Produção (Supabase Hosted)

Você precisa copiar o conteúdo HTML de cada template para o Dashboard do Supabase:

1. Acesse: https://supabase.com/dashboard/project/xjrjenniszhshrgtdjcp/auth/templates
2. Para cada template:
   - Clique no template correspondente
   - Cole o conteúdo HTML do arquivo
   - Atualize o assunto do email
   - Salve as alterações

**Assuntos sugeridos:**
- Confirmation: "Confirme seu cadastro - Wallet"
- Magic Link: "Seu link de acesso - Wallet"
- Recovery: "Recuperação de senha - Wallet"
- Invite: "Você foi convidado - Wallet"
- Email Change: "Confirme a alteração de email - Wallet"

## Design

Os templates seguem um design consistente com:

- **Cores principais:** Gradiente laranja (#ff6b35 → #f7931e)
- **Tipografia:** System fonts (San Francisco, Segoe UI, Roboto)
- **Layout:** Responsivo, largura máxima de 600px
- **Estilo:** Moderno, limpo e profissional
- **Idioma:** Português do Brasil

## Manutenção

Ao atualizar os templates:

1. Edite os arquivos HTML neste diretório
2. Teste localmente com Supabase local
3. Aplique as mudanças no Dashboard de produção
4. Documente as alterações neste README

## Notas de Segurança

- Os links de confirmação expiram em 1 hora
- Cada link pode ser usado apenas uma vez
- Sempre inclua texto explicativo sobre o que fazer se o usuário não solicitou a ação
