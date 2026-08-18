# Equipe — Custos MEI, Simulador de Rescisão e Transporte

## Contexto e objetivo

Este documento complementa `2026-08-17-equipe-centro-rh-financeiro-design.md`. Ele corrige três problemas identificados no perfil financeiro de funcionário fixo:

1. o custo mensal usa contribuição patronal de 20%, incompatível com a configuração informada da Rodo Point como MEI;
2. um contrato de experiência expirado continua aparecendo como `Experiência`;
3. o cálculo do acerto semanal preservou a diferença positiva do Uber, mas a interface deixou de exibi-la separadamente.

A entrega deve mostrar o custo real estimado do funcionário, permitir simular quanto custaria seu desligamento e restaurar a transparência do transporte, sem executar demissão, alterar salário ou efetuar pagamentos automaticamente.

## Premissas confirmadas

- empresa: Rodo Point, cafeteria localizada em Betim/MG;
- regime informado: Microempreendedor Individual (MEI);
- funcionário de referência: Shuellen Pereira Santos;
- salário cadastrado: R$ 1.621,00, preservado sem alteração automática;
- admissão: 23/02/2026;
- o contrato de experiência terminou e o vínculo continuou, tornando-se contrato por prazo indeterminado;
- transporte, passagem e diferença positiva do Uber são pagos semanalmente;
- metas são pagas semanalmente junto na mesma transferência, mas permanecem separadas contabilmente;
- transporte e diferença de Uber pertencem à categoria contábil `Transporte`;
- metas pertencem à categoria `Premiações/Metas`.

## Base normativa e limites

O sistema não tratará Betim como possuidora de uma legislação trabalhista municipal própria. A base será:

- CLT e leis federais vigentes;
- regras do FGTS e aviso prévio;
- regras oficiais do empregador MEI;
- convenção coletiva registrada no MTE aplicável a cafés, cafeterias e estabelecimentos de alimentação com abrangência territorial em Betim/MG.

Referências verificadas em 17/08/2026:

- CLT, especialmente arts. 477, 479, 480, 481, 484-A e 487;
- Lei nº 8.036/1990, art. 18, para indenização compensatória do FGTS;
- Lei nº 12.506/2011, para aviso prévio proporcional;
- Portal do Empreendedor e Manual Web MEI/eSocial, para encargos e desligamento do empregado do MEI;
- instrumento coletivo do MTE que inclui cafés e fixa piso de referência de R$ 1.681,18 a partir de 01/01/2026.

O simulador será identificado como estimativa gerencial. O valor final depende de informações oficiais do eSocial/FGTS Digital, médias variáveis, férias efetivamente gozadas, faltas, adicionais, estabilidade e outras ocorrências que a Wallet talvez não conheça. A interface recomendará conferência com a contabilidade antes de qualquer desligamento.

## Salário e piso coletivo

O salário cadastrado de R$ 1.621,00 não será reescrito automaticamente.

Quando existir piso coletivo configurado e vigente:

- mostrar salário cadastrado;
- mostrar piso de referência, vigência e fonte;
- calcular a diferença apenas como alerta informativo;
- oferecer ação explícita de edição do salário, sujeita à confirmação do usuário;
- nunca usar silenciosamente o piso no lugar do salário cadastrado nos lançamentos.

Para cálculos gerenciais, o usuário poderá alternar entre `salário cadastrado` e `piso de referência`. O padrão será o salário cadastrado, claramente identificado.

## Custo mensal do funcionário MEI

Para o perfil de empregador MEI informado, a composição-base será:

- salário mensal cadastrado;
- contribuição patronal do MEI: 3% do salário de contribuição;
- FGTS mensal: 8%;
- provisão mensal de 13º: 1/12 da remuneração-base;
- provisão mensal de férias: 1/12 da remuneração-base;
- provisão do terço constitucional sobre férias;
- benefícios e transporte exibidos separadamente, porque variam por semana;
- metas exibidas separadamente e não incorporadas automaticamente à remuneração sem regra jurídica/configuração específica.

O custo fixo mensal não deve somar transporte ou metas duas vezes. O card exibirá composição expansível, fonte da regra e data da última atualização normativa.

O custo diário continuará usando 26 dias como referência visual enquanto essa for a configuração do colaborador, mas a interface mostrará o divisor utilizado. A regra ficará centralizada e não duplicada em componentes.

## Estado do contrato de experiência

Um funcionário ativo não pode permanecer indefinidamente com status `Experiência` após a data final.

Comportamento:

1. calcular a data final a partir da admissão e duração configurada;
2. antes do fim, mostrar contagem regressiva;
3. no dia final, mostrar decisão pendente;
4. após o fim, se o funcionário segue ativo e não existe desligamento, apresentar o vínculo como `Prazo indeterminado`;
5. preservar no histórico as datas e a duração original da experiência;
6. não realizar mutação financeira ou contratual retroativa apenas ao abrir a tela.

O estado derivado da interface e a persistência devem convergir por uma migração/normalização idempotente, sem apagar o histórico.

## Simulador de desligamento

### Cenários

O perfil financeiro oferecerá pelo menos:

- `Sem justa causa`;
- `Acordo entre as partes`;
- `Pedido de demissão`;
- `Término de experiência`, somente para contrato a prazo ainda vigente;
- `Rescisão antecipada da experiência`, somente quando aplicável.

Justa causa não terá estimativa automática de valor como opção comum: será uma ação avançada com aviso de alto risco e recomendação de validação profissional.

### Entradas

- data pretendida do desligamento;
- salário-base escolhido para simulação;
- tipo de aviso prévio: trabalhado, indenizado ou dispensado, conforme cenário;
- saldo de FGTS conhecido, quando disponível;
- férias vencidas e períodos aquisitivos;
- médias remuneratórias opcionais;
- descontos/adiantamentos opcionais;
- estabilidade ou afastamento conhecido.

### Saídas

Exibir cada parcela individualmente, sua base de cálculo e a indicação `estimada` ou `confirmada`:

- saldo de salário;
- aviso prévio e projeção no tempo de serviço;
- 13º proporcional;
- férias vencidas, quando houver;
- férias proporcionais;
- terço constitucional;
- FGTS incidente sobre verbas aplicáveis;
- multa de 40% ou 20%, conforme cenário;
- possíveis descontos;
- custo total estimado da empresa;
- valor estimado a receber pelo funcionário, em bloco separado;
- data-limite estimada para quitação.

Quando o saldo oficial do FGTS não estiver disponível, a multa aparecerá como `estimativa pelo histórico da Wallet`. O sistema não apresentará esse valor como definitivo e permitirá substituir a estimativa pelo saldo informado/confirmado no FGTS Digital.

### Segurança operacional

O simulador é somente leitura. Ele não:

- altera o status do funcionário;
- cria despesa ou conta a pagar;
- envia evento ao eSocial;
- solicita transferência;
- grava uma demissão.

Uma eventual função futura `Iniciar desligamento` será um fluxo separado, com confirmação forte e revisão contábil.

## Transporte semanal

A experiência anterior será restaurada sem mudar a regra financeira já aprovada.

Cada dia trabalhado mostrará:

- `Foi?`;
- `Uber real`;
- `Passagem`;
- `Diferença`;
- `Meta`;
- subtotal diário, quando houver espaço.

Definições:

```text
diferença Uber = máximo(0, Uber real - Uber base)
transporte do dia = Uber base + passagem + diferença Uber
total semanal = transporte + metas
```

A diferença negativa não gera desconto automático. Caso essa regra seja desejada no futuro, deverá ser uma configuração explícita.

O resumo semanal mostrará separadamente:

- Uber real total;
- Uber base total;
- passagens;
- diferença positiva do Uber;
- metas;
- total da transferência.

Uma única transferência Pix continuará sendo gerada para reduzir taxas. Os itens financeiros permanecem separados:

```text
Transporte = Uber base + passagens + diferença positiva
Premiações/Metas = metas
Taxas bancárias = taxa Divipay
```

## Interface

No perfil do funcionário, a aba `Financeiro` terá esta ordem:

1. cards de salário, custo fixo mensal MEI e custo diário;
2. alerta de piso coletivo, quando aplicável;
3. composição detalhada do custo mensal;
4. simulador de desligamento por cenário;
5. obrigações e histórico financeiro.

A aba/área de transporte manterá a grade semanal detalhada. Em telas estreitas, cada dia será apresentado em bloco ou tabela rolável, sem eliminar a coluna `Diferença`.

Valores sensíveis, Pix e dados bancários continuam mascarados por padrão. Fontes normativas terão link e data de referência, mas não poluirão os cards principais.

## Arquitetura

As regras serão funções puras e testáveis no domínio financeiro:

- configuração de encargos por regime (`mei` nesta entrega);
- cálculo do custo mensal;
- resolução do estado contratual;
- cálculo de verbas por cenário;
- cálculo do transporte por dia e por semana;
- representação de dinheiro em centavos ou decimal exato.

Componentes React apenas coletam entradas e exibem resultados. Nenhuma fórmula legal relevante ficará inline na página.

Metadados normativos terão versão, vigência e fonte. A configuração do workspace guardará o regime tributário e a convenção coletiva selecionada, evitando aplicar regras de MEI ou de Betim a outros workspaces.

## Testes e critérios de aceite

### Cálculos

- MEI usa 3% patronal e 8% FGTS, nunca 20% fixo;
- provisões de 13º e férias são consistentes entre painel e perfil;
- transporte inclui Uber base, passagem e apenas diferença positiva;
- metas não são somadas ao transporte nos relatórios;
- todos os cálculos monetários evitam erro de ponto flutuante;
- cenários de rescisão cobrem meses com 14 e 15 dias para proporcionais;
- projeção do aviso prévio afeta proporcionais quando juridicamente aplicável;
- multa do FGTS distingue saldo estimado e confirmado.

### Contrato

- experiência vigente mostra dias restantes;
- data final mostra decisão pendente;
- experiência expirada com funcionário ativo mostra prazo indeterminado;
- histórico da experiência permanece acessível.

### Interface

- coluna `Diferença` visível em desktop e acessível no celular;
- totais diário e semanal conferem com a composição;
- salário de R$ 1.621,00 permanece cadastrado;
- piso aparece somente como alerta;
- simulador não cria nem modifica registros financeiros;
- todos os cenários exibem detalhamento e ressalva da estimativa;
- layout validado em 375×812, 768×1024 e 1440×900.

### Segurança e regressão

- nenhuma informação pessoal ou Pix aparece em logs;
- RLS por workspace permanece ativa;
- apenas os dois administradores autorizados do workspace acessam o módulo;
- suíte Vitest, TypeScript, lint e build de produção passam;
- testes existentes de acertos, relatórios e conciliação Divipay continuam passando.

## Fora do escopo

- envio automático de demissão ao eSocial;
- substituição de contador, advogado ou cálculo oficial do FGTS Digital;
- alteração automática do salário para o piso coletivo;
- desconto automático quando o Uber real for menor que o Uber base;
- mudanças no fluxo aprovado de transferência única semanal.
