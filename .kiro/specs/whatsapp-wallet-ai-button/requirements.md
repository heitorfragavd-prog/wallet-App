# Requirements Document

## Introduction

Esta funcionalidade adiciona um botão "Wallet AI" com ícone do WhatsApp no menu lateral do usuário, permitindo acesso rápido ao suporte/consultoria via WhatsApp. O número de WhatsApp é configurável pelo administrador no painel admin.

## Glossary

- **Wallet AI Button**: Botão estilizado com fundo verde e ícone do WhatsApp que redireciona para o WhatsApp
- **System Settings**: Tabela de configurações do sistema onde o número do WhatsApp é armazenado
- **Admin Panel**: Painel administrativo onde configurações do sistema são gerenciadas

## Requirements

### Requirement 1

**User Story:** Como usuário, quero ter um botão "Wallet AI" no menu lateral, para que eu possa acessar rapidamente o suporte via WhatsApp.

#### Acceptance Criteria

1. WHEN o menu lateral é renderizado THEN the System SHALL display um botão "Wallet AI" com ícone do WhatsApp e fundo verde
2. WHEN o usuário clica no botão "Wallet AI" THEN the System SHALL abrir uma nova aba com o link wa.me/{numero_configurado}
3. WHILE o número do WhatsApp não estiver configurado THEN the System SHALL ocultar o botão "Wallet AI" do menu

### Requirement 2

**User Story:** Como administrador, quero configurar o número do WhatsApp do Wallet AI, para que os usuários possam entrar em contato pelo número correto.

#### Acceptance Criteria

1. WHEN o administrador acessa as configurações do sistema THEN the System SHALL exibir um campo para configurar o número do WhatsApp
2. WHEN o administrador salva um número de WhatsApp válido THEN the System SHALL persistir o número na tabela system_settings
3. WHEN o administrador insere um número inválido THEN the System SHALL exibir mensagem de erro e manter o valor anterior
4. WHEN o número é salvo com sucesso THEN the System SHALL exibir uma notificação de confirmação

### Requirement 3

**User Story:** Como sistema, quero validar o formato do número do WhatsApp, para garantir que o link funcione corretamente.

#### Acceptance Criteria

1. WHEN um número é submetido THEN the System SHALL validar que contém apenas dígitos (após remoção de formatação)
2. WHEN um número é submetido THEN the System SHALL validar que possui entre 10 e 15 dígitos
3. WHEN a validação falha THEN the System SHALL informar o formato esperado ao usuário
