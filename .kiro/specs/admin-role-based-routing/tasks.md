# Implementation Plan

- [x] 1. Modificar LoginForm para implementar redirecionamento baseado em role
  - [x] 1.1 Adicionar lógica para aguardar carregamento do perfil após login bem-sucedido
    - Importar e usar o hook useProfile
    - Aguardar que profile não seja null e loading seja false
    - _Requirements: 3.3, 5.1_
  
  - [x] 1.2 Implementar verificação de role e redirecionamento condicional
    - Verificar se profile.role === 'admin'
    - Redirecionar para '/admin' se admin, caso contrário para '/dashboard'
    - Tratar casos onde role é null ou undefined como usuário regular
    - _Requirements: 1.1, 1.2, 1.4_
  
  - [x] 1.3 Adicionar indicador de loading durante verificação de role
    - Exibir spinner ou mensagem enquanto perfil carrega
    - Garantir que loading state é limpo após redirecionamento
    - _Requirements: 5.2, 5.3_
  
  - [ ]* 1.4 Escrever teste de propriedade para redirecionamento de admin
    - **Property 1: Admin redirection consistency**
    - **Validates: Requirements 1.1**
  
  - [ ]* 1.5 Escrever teste de propriedade para redirecionamento de usuário regular
    - **Property 2: Regular user redirection consistency**
    - **Validates: Requirements 1.2**
  
  - [ ]* 1.6 Escrever teste de propriedade para sincronização de carregamento de perfil
    - **Property 4: Profile loading synchronization**
    - **Validates: Requirements 3.3**

- [x] 2. Criar componente AdminDashboardLayout
  - [x] 2.1 Criar novo arquivo AdminDashboardLayout.tsx
    - Copiar estrutura base do DashboardLayout
    - Manter mesma interface (children: React.ReactNode)
    - _Requirements: 4.1_
  
  - [x] 2.2 Adicionar item 'Administrador' ao array de menuItems
    - Usar ícone Shield ou UserCog do lucide-react
    - Adicionar ao final do array de menuItems
    - Path deve ser '/admin'
    - _Requirements: 2.1, 4.3_
  
  - [x] 2.3 Garantir que todos os itens de menu padrão estão presentes
    - Incluir todos os 12 itens do menu original
    - Manter mesma ordem e estrutura
    - _Requirements: 4.2_
  
  - [x] 2.4 Implementar mesma lógica de colapso e responsividade
    - Usar useState para isCollapsed
    - Usar useState para isMobileMenuOpen
    - Manter comportamento de transições
    - _Requirements: 4.4_
  
  - [ ]* 2.5 Escrever teste de propriedade para completude do menu admin
    - **Property 5: Admin menu completeness**
    - **Validates: Requirements 2.1**
  
  - [ ]* 2.6 Escrever teste de propriedade para preservação de itens padrão
    - **Property 7: Standard menu items preservation**
    - **Validates: Requirements 4.2**
  
  - [ ]* 2.7 Escrever teste de propriedade para persistência de estado de colapso
    - **Property 8: Menu collapse state persistence**
    - **Validates: Requirements 4.4**

- [x] 3. Atualizar página AdminDashboard para usar AdminDashboardLayout
  - [x] 3.1 Remover import e uso do componente Header
    - Remover linha de import do Header
    - Remover <Header /> do JSX
    - _Requirements: 6.1_
  
  - [x] 3.2 Importar e envolver conteúdo com AdminDashboardLayout
    - Adicionar import do AdminDashboardLayout
    - Envolver todo o conteúdo da página com <AdminDashboardLayout>
    - Manter toda a lógica e funcionalidades existentes
    - _Requirements: 6.1, 6.2_
  
  - [ ]* 3.3 Escrever teste de propriedade para atualização de subscriptions
    - **Property 10: Subscription update correctness**
    - **Validates: Requirements 6.3**

- [x] 4. Validar e ajustar componente ProtectedRoute
  - [x] 4.1 Revisar lógica existente de verificação de role
    - Confirmar que verifica profile.role === 'admin' para rotas protegidas
    - Confirmar que aguarda carregamento do profile
    - Confirmar que redireciona não-admins para /dashboard
    - _Requirements: 3.1, 3.2_
  
  - [x] 4.2 Adicionar tratamento para erros de carregamento de perfil
    - Se erro ao carregar profile, tratar como não autenticado
    - Redirecionar para /login em caso de erro
    - _Requirements: 3.4_
  
  - [ ]* 4.3 Escrever teste de propriedade para proteção de rota admin
    - **Property 3: Admin route protection**
    - **Validates: Requirements 3.2**

- [x] 5. Atualizar DashboardLayout para garantir que não exibe opção administrativa
  - [x] 5.1 Confirmar que menuItems não contém item 'Administrador'
    - Revisar array de menuItems
    - Garantir que apenas 12 itens padrão estão presentes
    - _Requirements: 2.2_
  
  - [ ]* 5.2 Escrever teste de propriedade para restrição de menu de usuário regular
    - **Property 6: Regular user menu restriction**
    - **Validates: Requirements 2.2**

- [x] 6. Checkpoint - Garantir que todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Adicionar teste de exemplo para navegação do item Administrador
  - [ ]* 7.1 Escrever teste de exemplo para clique no item Administrador
    - Renderizar AdminDashboardLayout
    - Simular clique no item 'Administrador'
    - Verificar navegação para '/admin'
    - _Requirements: 2.3_

- [ ] 8. Adicionar teste de exemplo para exibição do painel administrativo
  - [ ]* 8.1 Escrever teste de exemplo para renderização do painel
    - Renderizar AdminDashboard como admin
    - Verificar que lista de usuários é exibida
    - Verificar que botões de ação estão presentes
    - _Requirements: 6.1_

- [ ] 9. Adicionar teste de exemplo para indicador de loading
  - [ ]* 9.1 Escrever teste de exemplo para exibição de loading
    - Simular login em progresso
    - Verificar que indicador de loading é exibido
    - Verificar que desaparece após conclusão
    - _Requirements: 5.2_

- [ ] 10. Teste de propriedade para limpeza de estado de loading
  - [ ]* 10.1 Escrever teste de propriedade para cleanup de loading
    - **Property 9: Loading state cleanup**
    - **Validates: Requirements 5.3**

- [ ] 11. Checkpoint Final - Garantir que todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.
