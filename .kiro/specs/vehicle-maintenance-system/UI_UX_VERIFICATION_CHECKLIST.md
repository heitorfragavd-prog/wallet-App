# Checklist de Verificação - Melhorias de UI/UX

## Instruções

Use este checklist para verificar manualmente todas as melhorias implementadas no sistema de manutenção de veículos.

---

## 1. Modal de Adicionar Manutenção

### Tab "Tipo Existente"

- [ ] **Validação de Tipo**
  - Tentar submeter sem selecionar tipo
  - Verificar mensagem: "Por favor, selecione um tipo de manutenção."

- [ ] **Validação de Intervalo**
  - Tentar submeter com intervalo vazio
  - Verificar mensagem: "Por favor, informe um intervalo válido em km (maior que 0)."
  - Tentar submeter com intervalo = 0
  - Verificar mesma mensagem

- [ ] **Validação de Lembrete**
  - Ativar lembrete
  - Deixar dias de antecedência vazio
  - Verificar mensagem: "Por favor, informe os dias de antecedência (0 ou maior)."

- [ ] **Texto de Ajuda**
  - Verificar presença do texto: "A cada quantos quilômetros esta manutenção deve ser realizada"
  - Verificar que está abaixo do campo "Intervalo (km)"

- [ ] **Input Step**
  - Clicar nas setas do campo "Intervalo (km)"
  - Verificar que incrementa/decrementa de 100 em 100

- [ ] **Loading State**
  - Preencher formulário corretamente
  - Clicar em "Adicionar"
  - Verificar spinner animado
  - Verificar texto "Adicionando..."
  - Verificar que botões ficam desabilitados

- [ ] **Feedback de Sucesso**
  - Após adicionar com sucesso
  - Verificar toast: "Sucesso! - Manutenção adicionada ao plano do veículo."

- [ ] **Botão com Ícone**
  - Verificar ícone de "Plus" no botão "Adicionar"
  - Verificar cor orange-500

### Tab "Customizada"

- [ ] **Validação de Nome**
  - Tentar submeter com nome vazio
  - Verificar mensagem: "Por favor, informe o nome da manutenção."
  - Tentar submeter com nome de 2 caracteres
  - Verificar mensagem: "O nome da manutenção deve ter pelo menos 3 caracteres."

- [ ] **Validação de Intervalo**
  - Mesmos testes da tab "Tipo Existente"

- [ ] **Validação de Lembrete**
  - Mesmos testes da tab "Tipo Existente"

- [ ] **Texto de Ajuda**
  - Verificar presença do texto de ajuda
  - Mesma verificação da tab "Tipo Existente"

- [ ] **Input Step**
  - Mesma verificação da tab "Tipo Existente"

- [ ] **Loading State**
  - Mesma verificação da tab "Tipo Existente"

- [ ] **Feedback de Sucesso**
  - Após adicionar com sucesso
  - Verificar toast: "Sucesso! - Manutenção customizada adicionada ao veículo."

- [ ] **Feedback de Erro**
  - Simular erro (desconectar internet, por exemplo)
  - Verificar toast: "Erro ao Adicionar - Não foi possível adicionar a manutenção customizada. Tente novamente."

---

## 2. Componente ListaManutencoes

### Visualização

- [ ] **Planos de Manutenção**
  - Verificar que planos aparecem com borda azul à esquerda
  - Verificar ícone de "Tag" nos planos
  - Verificar badge "Plano" em azul

- [ ] **Manutenções Customizadas**
  - Verificar que customizadas aparecem com borda roxa à esquerda
  - Verificar ícone de "Sparkles" nas customizadas
  - Verificar badge "Customizada" em roxo

- [ ] **Lembretes Ativos**
  - Verificar badge verde "Lembrete" com ícone de sino
  - Verificar que aparece apenas em manutenções com lembrete ativo

- [ ] **Estado Inativo**
  - Criar manutenção e desativar (se possível)
  - Verificar badge cinza "Inativo"

### Ações

- [ ] **Botão Editar**
  - Clicar no botão de editar (ícone de lápis)
  - Verificar toast: "Em desenvolvimento - Funcionalidade de editar manutenção..."
  - Verificar cor azul no hover

- [ ] **Botão Realizar**
  - Clicar no botão de realizar (ícone de check)
  - Verificar toast: "Em desenvolvimento - Funcionalidade de realizar manutenção..."
  - Verificar cor verde no hover

- [ ] **Botão Remover**
  - Clicar no botão de remover (ícone de lixeira)
  - Verificar que dialog de confirmação abre
  - Verificar cor vermelha no hover

### Dialog de Confirmação

- [ ] **Abertura**
  - Clicar em remover uma manutenção
  - Verificar que dialog abre
  - Verificar ícone de alerta (triângulo)
  - Verificar título: "Confirmar Remoção"

- [ ] **Conteúdo**
  - Verificar mensagem: "Tem certeza que deseja remover a manutenção [nome]?"
  - Verificar aviso: "Esta ação não pode ser desfeita. Os lembretes associados também serão cancelados."
  - Verificar que nome da manutenção está em negrito

- [ ] **Botões**
  - Verificar botão "Cancelar" (cinza)
  - Verificar botão "Remover" (vermelho)

- [ ] **Cancelar**
  - Clicar em "Cancelar"
  - Verificar que dialog fecha
  - Verificar que manutenção não foi removida

- [ ] **Confirmar Remoção**
  - Clicar em "Remover"
  - Verificar que dialog fecha
  - Verificar toast de sucesso: "Manutenção Removida - [nome] foi removida do plano."
  - Verificar que manutenção desaparece da lista

- [ ] **Navegação por Teclado**
  - Abrir dialog
  - Pressionar Tab
  - Verificar que foco move entre botões
  - Pressionar Escape
  - Verificar que dialog fecha

### Estado Vazio

- [ ] **Sem Manutenções**
  - Remover todas as manutenções de um veículo
  - Verificar ícone de ferramenta (Wrench)
  - Verificar mensagem: "Nenhuma manutenção configurada para este veículo"
  - Verificar submensagem: "Clique em 'Adicionar Manutenção' para começar"

---

## 3. Página de Veículos

### Integração do ListaManutencoes

- [ ] **Seção de Planos**
  - Expandir detalhes de um veículo
  - Verificar título: "Planos de Manutenção"
  - Verificar que componente ListaManutencoes está sendo usado

- [ ] **Separação Visual**
  - Verificar que planos aparecem primeiro
  - Verificar que manutenções pendentes (sistema antigo) aparecem depois
  - Verificar borda separadora entre as seções

- [ ] **Título da Seção Antiga**
  - Verificar título: "Manutenções Pendentes (X)"
  - Verificar que está em cor mais clara (muted-foreground)

### Responsividade

- [ ] **Desktop (> 640px)**
  - Verificar botão: "Adicionar Manutenção" (texto completo)
  - Verificar botão: "Gerenciar Tipos" (texto completo)

- [ ] **Mobile (< 640px)**
  - Reduzir janela do navegador
  - Verificar botão: "Adicionar" (texto curto)
  - Verificar botão: "Tipos" (texto curto)
  - Verificar que ícones permanecem visíveis

- [ ] **Layout Flexível**
  - Reduzir janela gradualmente
  - Verificar que badges e botões se reorganizam
  - Verificar que não há overflow horizontal

### Badges

- [ ] **Badge de Atrasadas**
  - Verificar cor vermelha
  - Verificar texto: "X atrasada(s)"
  - Verificar que aparece apenas quando há atrasadas

---

## 4. Acessibilidade

### Navegação por Teclado

- [ ] **Modal de Adicionar**
  - Abrir modal
  - Usar Tab para navegar entre campos
  - Verificar que todos os campos são acessíveis
  - Pressionar Escape
  - Verificar que modal fecha

- [ ] **Dialog de Confirmação**
  - Abrir dialog
  - Usar Tab para navegar entre botões
  - Pressionar Enter no botão focado
  - Verificar que ação é executada

- [ ] **Botões de Ação**
  - Usar Tab para navegar pelos botões
  - Verificar foco visível em cada botão
  - Pressionar Enter
  - Verificar que ação é executada

### Contraste de Cores

- [ ] **Textos**
  - Verificar que todos os textos são legíveis
  - Verificar contraste adequado em modo claro
  - Verificar contraste adequado em modo escuro

- [ ] **Botões**
  - Verificar que cores dos botões têm contraste adequado
  - Verificar estados hover, focus e disabled

### Screen Readers

- [ ] **Labels**
  - Verificar que todos os inputs têm labels associados
  - Verificar que labels são descritivos

- [ ] **Botões**
  - Verificar que botões têm textos ou aria-labels
  - Verificar que ícones não são a única indicação

---

## 5. Feedback Visual

### Toasts

- [ ] **Sucesso**
  - Verificar cor verde
  - Verificar ícone de check
  - Verificar que desaparece automaticamente

- [ ] **Erro**
  - Verificar cor vermelha
  - Verificar ícone de alerta
  - Verificar que desaparece automaticamente

- [ ] **Posicionamento**
  - Verificar que toasts aparecem no canto superior direito
  - Verificar que não bloqueiam conteúdo importante

### Loading States

- [ ] **Spinners**
  - Verificar animação suave
  - Verificar cor branca em botões coloridos
  - Verificar tamanho apropriado

- [ ] **Desabilitação**
  - Verificar que botões ficam desabilitados durante loading
  - Verificar que cursor muda para "not-allowed"
  - Verificar que opacidade é reduzida

---

## 6. Consistência Visual

### Cores

- [ ] **Ações Principais**
  - Verificar que usam orange-500
  - Verificar hover em orange-600

- [ ] **Ações Destrutivas**
  - Verificar que usam red-500
  - Verificar hover em red-600

- [ ] **Ações Secundárias**
  - Verificar que usam outline
  - Verificar hover apropriado

### Espaçamento

- [ ] **Margens e Padding**
  - Verificar espaçamento consistente entre elementos
  - Verificar que não há elementos muito próximos ou muito distantes

- [ ] **Gaps**
  - Verificar gaps consistentes em flex containers
  - Verificar que elementos respiram adequadamente

### Tipografia

- [ ] **Tamanhos**
  - Verificar hierarquia clara de tamanhos
  - Verificar legibilidade em todos os tamanhos

- [ ] **Pesos**
  - Verificar uso apropriado de font-weight
  - Verificar que títulos se destacam

---

## 7. Performance

### Build

- [ ] **Compilação**
  - Executar `npm run build`
  - Verificar que build completa sem erros
  - Verificar que não há warnings críticos

### Diagnósticos

- [ ] **TypeScript**
  - Verificar que não há erros de tipo
  - Verificar que imports estão corretos

### Carregamento

- [ ] **Tempo de Resposta**
  - Verificar que operações respondem rapidamente
  - Verificar que não há delays perceptíveis

---

## Resumo de Verificação

### Obrigatório (Bloqueadores)
- [ ] Todas as validações funcionam corretamente
- [ ] Feedback de sucesso/erro aparece
- [ ] Dialog de confirmação funciona
- [ ] Componente ListaManutencoes está integrado
- [ ] Build completa sem erros
- [ ] Sem erros de TypeScript

### Importante (Alta Prioridade)
- [ ] Responsividade funciona em mobile
- [ ] Navegação por teclado completa
- [ ] Loading states aparecem
- [ ] Textos de ajuda estão presentes
- [ ] Cores consistentes

### Desejável (Média Prioridade)
- [ ] Animações suaves
- [ ] Contraste de cores adequado
- [ ] Espaçamento consistente
- [ ] Tipografia clara

---

## Notas

- Marque cada item após verificar
- Anote qualquer problema encontrado
- Priorize itens obrigatórios
- Teste em diferentes navegadores
- Teste em diferentes tamanhos de tela

---

**Data de Verificação**: ___/___/_____  
**Verificado por**: _________________  
**Status**: _________________  
**Observações**: _________________
