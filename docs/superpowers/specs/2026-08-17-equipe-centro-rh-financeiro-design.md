# Equipe — Centro de RH e Financeiro

## Objetivo

Transformar o módulo Equipe da Wallet em um centro confiável de gestão de pessoas e pagamentos para a Rodo Point. A entrega deve preservar a experiência visual existente, corrigir inconsistências financeiras e garantir isolamento real de dados por workspace.

## Usuários e autorização

O workspace é administrado por Heitor e sua sócia Viviane. Ambos podem visualizar e alterar todos os dados profissionais, financeiros e pessoais da equipe.

O banco de dados, e não apenas o frontend, deve garantir que:

- somente membros ativos do workspace acessem colaboradores, escalas, acertos, custos e pagamentos daquele workspace;
- nenhuma política RLS use acesso global para usuários autenticados;
- operações de escrita validem a associação entre usuário, workspace e registro relacionado;
- CPF, RG, endereço, telefone, chave Pix e dados bancários não apareçam em logs;
- dados sensíveis apareçam mascarados por padrão na interface.

## Tipos de colaborador

### Funcionário fixo

- salário mensal com vencimento no quinto dia útil;
- custo mensal, diário e por hora calculado por uma única fonte de regras;
- período de experiência configurável e alertas de vencimento;
- acerto semanal, gerado às segundas-feiras, referente à semana anterior;
- o acerto semanal reúne transporte, diferença de Uber e metas em uma única transferência;
- transporte e diferença de Uber são agrupados como `Transporte` nos relatórios;
- metas são classificadas separadamente como `Premiações/Metas`;
- a taxa Divipay é classificada como `Taxas bancárias` e não compõe o custo individual do funcionário.

### Folguista

- escalas por data e turno, com diária, transporte, bônus de meta e observações;
- acerto semanal consolidado em uma única conta a pagar;
- cada escala permanece ligada ao acerto como item auditável;
- não há encargos trabalhistas automáticos;
- cancelamentos antes do pagamento recalculam o acerto;
- cancelamentos depois do pagamento preservam o histórico e geram crédito ou desconto no próximo acerto.

### Sócio

- pró-labore mensal separado dos custos operacionais de funcionários;
- dia de pagamento configurável por sócio;
- configuração inicial: Heitor no dia 16 e Viviane no dia 25.

## Modelo de dados

O desenho usa entidades explícitas e relações auditáveis:

- `colaboradores`: perfil profissional, dados pessoais, dados bancários e configuração de pagamento;
- `colaborador_escalas`: dias e turnos trabalhados, valores e estado da escala;
- `colaborador_acertos`: consolidação semanal ou mensal, período, total e estado;
- `colaborador_acerto_itens`: composição contábil do acerto e ligação opcional com uma escala;
- `colaborador_pagamentos`: tentativas e confirmações de pagamento, IDs externos e comprovantes;
- `colaborador_ajustes`: créditos e descontos aplicáveis a acertos futuros.

Todos os registros financeiros carregam `workspace_id`. As relações devem impedir que registros de workspaces diferentes sejam associados. Índices e restrições devem impedir escala duplicada por colaborador/data/turno, acerto duplicado para o mesmo período e processamento duplicado do mesmo evento Divipay.

## Estados financeiros

Os estados permitidos são:

- `rascunho`: composição ainda editável;
- `pendente`: conta a pagar pronta para pagamento;
- `processando`: transferência solicitada ao Divipay;
- `pago`: liquidação confirmada;
- `falhou`: tentativa recusada ou erro confirmado;
- `cancelado`: obrigação cancelada antes da liquidação;
- `ajustado`: obrigação paga com crédito ou desconto posterior.

Transições inválidas devem ser recusadas no banco. Registros pagos não são apagados nem reescritos retroativamente.

## Geração atômica do acerto

O botão `Gerar Pagamento Único` cria uma conta a pagar pendente e não transfere dinheiro imediatamente.

A geração ocorre por função transacional no Supabase:

1. valida workspace, colaborador, Pix e período;
2. bloqueia duplicidade;
3. seleciona as escalas ou verbas elegíveis;
4. cria o acerto;
5. cria itens separados por natureza contábil;
6. liga as escalas ao acerto;
7. registra a obrigação financeira pendente.

Se qualquer etapa falhar, nenhuma gravação parcial permanece.

## Pagamento pela Wallet e Divipay

Ao confirmar o pagamento:

1. a Wallet reapresenta colaborador, período, itens, total e Pix mascarado;
2. valida novamente o estado e a chave Pix;
3. cria uma tentativa idempotente;
4. solicita a transferência ao Divipay;
5. altera o acerto para `processando`;
6. aguarda confirmação pelo webhook;
7. ao confirmar, grava ID externo, taxa, comprovante e estado `pago`.

Falhas não marcam o acerto como pago. Uma nova tentativa reutiliza a obrigação existente sem duplicar despesas.

## Pagamento externo e conciliação automática

Quando um pagamento for feito fora da Wallet, a sincronização do Divipay tenta conciliá-lo com um acerto pendente usando:

- workspace e conta Divipay;
- chave Pix normalizada do colaborador;
- valor do acerto;
- janela de datas compatível com o vencimento e o período;
- estado pendente ou processando.

Uma correspondência única e exata recebe baixa automática. Havendo zero ou mais de um candidato plausível, a conciliação fica pendente para confirmação manual. O sistema nunca escolhe silenciosamente entre candidatos ambíguos.

O webhook e a sincronização são idempotentes pelo ID externo Divipay.

## Cancelamento e ajustes

- escala sem acerto: exclui ou cancela a escala e seu custo relacionado na mesma transação;
- escala em acerto pendente: remove o item e recalcula o total; se não restarem itens, cancela o acerto;
- escala em acerto processando: bloqueia alteração até resultado da tentativa;
- escala em acerto pago: preserva todos os registros e gera ajuste negativo para o próximo acerto;
- falha durante cancelamento: rollback integral, sem custos órfãos.

## Cálculos e calendário

Uma biblioteca de domínio pura centraliza cálculos usados por cards, detalhes, acertos e relatórios.

- o quinto dia útil desconsidera sábados, domingos e feriados cadastrados;
- custo diário usa o calendário e a regra do colaborador, sem divisão fixa espalhada pela interface;
- período de experiência usa `dias_experiencia` configurado;
- totais financeiros usam centavos inteiros ou decimal do banco, evitando erro de ponto flutuante;
- folguista não recebe encargos de funcionário fixo;
- pró-labore não é classificado como folha operacional de funcionários.

## Interface

### Tela principal

Além dos cards de pessoas, apresenta:

- custo mensal da equipe;
- pagamentos pendentes;
- próximo acerto semanal;
- contratos de experiência próximos do fim;
- alertas de Pix ou dados obrigatórios incompletos.

Filtros incluem Todos, Sócios, Funcionários e Folguistas, com contagens corretas.

### Perfil

O perfil é dividido em:

- `Visão geral`;
- `Acertos`;
- `Escalas`;
- `Financeiro`;
- `Dados pessoais`.

O conteúdo se adapta ao tipo do colaborador. CPF, Pix e conta bancária ficam mascarados por padrão, com ação explícita para revelar. Estados financeiros usam rótulos e cores consistentes.

### Composição de pagamento

Uma transferência bancária pode conter múltiplos itens contábeis. A tela sempre mostra a composição, por exemplo:

```text
Transferência semanal: R$ 109,50
├─ Transporte: R$ 109,50
├─ Metas: R$ 0,00
└─ Taxa Divipay: R$ 3,50
```

Nos relatórios, transporte, metas e taxas permanecem separados mesmo quando foram pagos em uma única transferência.

## Erros e observabilidade

- mensagens ao usuário explicam o que falhou e como tentar novamente, sem revelar dados sensíveis;
- logs usam IDs internos e estados, nunca documentos, Pix, endereço ou conteúdo bancário;
- tentativas e webhooks mantêm trilha de auditoria;
- eventos repetidos são aceitos de forma idempotente;
- conciliações ambíguas exigem confirmação humana.

## Testes e critérios de aceite

A implementação só é considerada concluída com testes cobrindo:

- RLS entre dois workspaces e acesso dos dois administradores do mesmo workspace;
- cadastro dos três tipos de colaborador;
- quinto dia útil, feriados e datas individuais de pró-labore;
- cálculos consistentes em lista, perfil e relatórios;
- acertos semanais de funcionário e folguista;
- transferência única com itens contábeis separados;
- geração e cancelamento atômicos;
- ajuste após cancelamento de item pago;
- prevenção de duplicidade;
- match externo por Pix normalizado, valor e período;
- ambiguidade encaminhada para conciliação manual;
- idempotência do webhook;
- mascaramento de dados sensíveis;
- comportamento responsivo em desktop e celular;
- suíte Vitest, TypeScript e build de produção.

## Fora do escopo atual

Comissões e gamificação automáticas por vendas Eyemobile não serão implementadas nesta entrega. O modelo manterá relações de colaborador, escala, período e categoria suficientes para essa evolução futura sem antecipar regras de comissão.
