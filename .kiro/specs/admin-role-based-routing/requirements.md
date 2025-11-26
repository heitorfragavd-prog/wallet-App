# Requirements Document

## Introduction

Este documento especifica os requisitos para implementar um sistema de roteamento baseado em roles (papéis) que redireciona usuários administradores para um dashboard específico após o login, enquanto usuários regulares continuam sendo direcionados ao dashboard padrão. O sistema deve garantir que administradores tenham acesso a funcionalidades administrativas através de um menu específico, mantendo a segurança e a separação de responsabilidades.

## Glossary

- **Sistema**: A aplicação web Wallet de consultoria financeira
- **Usuário**: Pessoa autenticada que utiliza o sistema
- **Administrador**: Usuário com role 'admin' no perfil
- **Usuário Regular**: Usuário com role 'user' ou sem role definida
- **Dashboard**: Página principal após autenticação
- **Dashboard Admin**: Página principal específica para administradores
- **Profile**: Registro na tabela 'profiles' contendo informações do usuário incluindo o campo 'role'
- **Menu de Navegação**: Barra lateral com links para diferentes seções do sistema
- **Opção Administrativa**: Item de menu visível apenas para administradores

## Requirements

### Requirement 1

**User Story:** Como administrador, eu quero ser redirecionado automaticamente para o dashboard administrativo após fazer login, para que eu possa acessar rapidamente as funcionalidades de administração.

#### Acceptance Criteria

1. WHEN um usuário com role 'admin' faz login com sucesso THEN o Sistema SHALL redirecionar o usuário para a rota '/admin'
2. WHEN um usuário regular faz login com sucesso THEN o Sistema SHALL redirecionar o usuário para a rota '/dashboard'
3. WHEN o Sistema verifica o role do usuário THEN o Sistema SHALL consultar o campo 'role' na tabela 'profiles'
4. WHEN o campo 'role' não existe ou é null THEN o Sistema SHALL tratar o usuário como usuário regular

### Requirement 2

**User Story:** Como administrador, eu quero ter acesso a um menu de navegação que inclui opções administrativas, para que eu possa gerenciar o sistema de forma eficiente.

#### Acceptance Criteria

1. WHEN um administrador acessa o dashboard admin THEN o Sistema SHALL exibir um menu de navegação com todas as opções padrão mais uma opção 'Administrador'
2. WHEN um usuário regular acessa o dashboard THEN o Sistema SHALL exibir apenas o menu de navegação padrão sem opções administrativas
3. WHEN um administrador clica na opção 'Administrador' no menu THEN o Sistema SHALL navegar para a rota '/admin'
4. WHEN o menu é renderizado THEN o Sistema SHALL aplicar o mesmo layout e estilo do DashboardLayout existente

### Requirement 3

**User Story:** Como desenvolvedor, eu quero que o sistema valide o role do usuário antes de permitir acesso a rotas protegidas, para garantir a segurança e controle de acesso adequado.

#### Acceptance Criteria

1. WHEN um usuário tenta acessar a rota '/admin' diretamente THEN o Sistema SHALL verificar se o role do usuário é 'admin'
2. IF o usuário não tem role 'admin' WHEN tenta acessar '/admin' THEN o Sistema SHALL redirecionar para '/dashboard'
3. WHEN o Sistema carrega o perfil do usuário THEN o Sistema SHALL aguardar a conclusão do carregamento antes de fazer redirecionamentos
4. WHEN ocorre um erro ao carregar o perfil THEN o Sistema SHALL tratar o usuário como não autenticado

### Requirement 4

**User Story:** Como administrador, eu quero que o dashboard administrativo mantenha a mesma estrutura visual do dashboard regular, para ter uma experiência consistente.

#### Acceptance Criteria

1. WHEN o dashboard admin é renderizado THEN o Sistema SHALL utilizar o componente DashboardLayout
2. WHEN o dashboard admin exibe o menu THEN o Sistema SHALL incluir todos os itens do menu padrão
3. WHEN o dashboard admin exibe o menu THEN o Sistema SHALL adicionar um item 'Administrador' com ícone apropriado
4. WHEN o usuário navega entre páginas THEN o Sistema SHALL manter o estado de colapso do menu

### Requirement 5

**User Story:** Como usuário do sistema, eu quero que o redirecionamento após login seja rápido e sem erros, para ter uma experiência fluida.

#### Acceptance Criteria

1. WHEN o login é bem-sucedido THEN o Sistema SHALL aguardar o carregamento completo do perfil antes de redirecionar
2. WHEN o perfil está sendo carregado THEN o Sistema SHALL exibir um indicador de carregamento
3. WHEN o redirecionamento ocorre THEN o Sistema SHALL limpar qualquer estado de loading
4. WHEN múltiplas tentativas de redirecionamento ocorrem THEN o Sistema SHALL prevenir loops de redirecionamento

### Requirement 6

**User Story:** Como administrador, eu quero que o painel administrativo existente continue funcionando corretamente, para que eu possa gerenciar usuários e permissões.

#### Acceptance Criteria

1. WHEN um administrador acessa '/admin' THEN o Sistema SHALL exibir o painel administrativo com a lista de usuários
2. WHEN o painel administrativo é exibido THEN o Sistema SHALL manter todas as funcionalidades existentes de concessão de acesso
3. WHEN o administrador concede acesso Pro ou Black THEN o Sistema SHALL atualizar a tabela 'subscriptions' corretamente
4. WHEN o painel administrativo carrega THEN o Sistema SHALL buscar dados da tabela 'profiles' com join em 'subscriptions' e 'plans'
