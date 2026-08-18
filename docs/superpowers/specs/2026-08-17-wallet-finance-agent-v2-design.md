# Wallet Finance Agent V2 — Design Técnico

## 1. Objetivo

Evoluir o módulo atual de Inteligência Artificial do Wallet para um agente financeiro multimodal, confiável e auditável, conectado aos dados reais dos módulos autorizados do sistema. O agente deve compreender linguagem natural, consultar e analisar dados, produzir visualizações estruturadas, interpretar documentos e preparar ações. Escritas somente poderão ocorrer após confirmação técnica explícita.

A evolução será incremental, protegida por feature flags e com rollback por etapa. O motor atual permanecerá disponível até o novo agente demonstrar estabilidade, segurança e qualidade mensurável.

## 2. Princípios

- O backend é a única autoridade para identidade, workspace, permissões, modelos, ferramentas e limites.
- O modelo nunca acessa tabelas diretamente e nunca produz SQL livre.
- Cálculos financeiros essenciais são determinísticos e centralizados.
- Toda resposta financeira informa período, filtros, fontes, fórmula relevante e limitações.
- Saldo, fluxo de caixa, lucro, margem e projeção são conceitos diferentes.
- Leituras autorizadas não exigem confirmação; escritas sempre usam preparação e confirmação persistida.
- Nenhuma memória, ferramenta ou ação pode atravessar workspaces.
- Build aprovado não equivale a prontidão para produção.

## 3. Estratégia de migração

Será usada uma migração incremental para a OpenAI Responses API, com contratos estáveis entre frontend, orquestrador, ferramentas e camada de dados. A estratégia permite comparar o motor antigo e o novo, liberar capacidades progressivamente e desligar a V2 sem perda de conversas ou propostas.

Ordem macro:

1. Segurança multi-tenant e camada financeira canônica.
2. Orquestrador com ferramentas somente de leitura.
3. Streaming, memória e interface conversacional.
4. Visualizações estruturadas.
5. Pipeline multimodal de documentos.
6. Preparação, confirmação e execução de ações.
7. Observabilidade, custos, avaliações e preparação para produção.

Cada fase será implementada, verificada e documentada separadamente. O avanço para a fase seguinte exigirá evidências da fase atual: branch e commits, migrations aplicadas em ambiente de teste, comandos executados, resultados de testes, riscos conhecidos, rollback e inventário dos arquivos alterados. A afirmação textual de que uma fase está concluída não será aceita sem essas evidências.

## 3.1 Política de canais

O acesso financeiro completo ao Wallet Finance Agent ficará restrito ao chat privado autorizado do proprietário. Grupo administrativo não será tratado como canal de acesso completo.

Integrações com grupos operacionais serão uma fase posterior, depois da estabilização do agente privado. Cada grupo terá catálogo próprio de ferramentas, dados mínimos, ações permitidas e participantes autorizados. Os primeiros perfis previstos são:

- fechamento;
- boletos e notas fiscais;
- contas e compras;
- conversas operacionais da loja.

Grupos não receberão consultas financeiras gerais, memória do chat privado, acesso irrestrito ao workspace nem permissão implícita por participarem do grupo. Cada mensagem de grupo será autorizada por canal, identidade, função e operação.

## 4. Arquitetura

### 4.1 Interface conversacional

O frontend continuará usando a experiência visual do Wallet, com suporte a:

- resposta progressiva;
- estados reais de execução;
- cancelamento;
- reenvio de falhas;
- histórico, criação, renomeação e exclusão de conversas;
- gráficos nativos;
- propostas editáveis e confirmação explícita;
- erros recuperáveis e acessíveis.

### 4.2 Orquestrador

Uma Edge Function principal, denominada conceitualmente `wallet-ai-orchestrator`, implementará o ciclo da Responses API. Ela será responsável por validar o contexto de segurança, escolher as ferramentas registradas, executar ciclos limitados, consolidar resultados, transmitir eventos, registrar uso e impedir loops.

O orquestrador não fará consultas financeiras diretamente. Ele consumirá ferramentas tipadas que usam a camada canônica de dados.

### 4.3 Camada financeira canônica

O módulo `financial-data-core` centralizará filtros, períodos, regras contábeis, deduplicação e rastreabilidade. Dashboard, Relatórios, DRE, Comparativos e IA deverão convergir progressivamente para essas mesmas regras, evitando definições divergentes do mesmo indicador.

### 4.4 Ferramentas

As ferramentas serão separadas em:

- consulta e cálculo determinístico;
- preparação de ação;
- execução confirmada.

Cada ferramenta terá schema de entrada e saída, autorização por módulo, limite de execução, escopo obrigatório por usuário e workspace, logs sanitizados e testes próprios.

### 4.5 Pipeline de documentos

O `document-pipeline` cuidará de upload privado, validação, normalização, extração multimodal, validação determinística, confiança por campo, páginas de origem e detecção de duplicidade.

### 4.6 Gateway de ações

O `action-gateway` persistirá propostas, confirmações e execuções. Toda escrita exigirá `action_id`, usuário autenticado, workspace validado, resumo, validade, confirmação registrada, hash de idempotência e auditoria.

## 5. Segurança e autorização

O fluxo obrigatório de toda requisição será:

1. Receber mensagem, conversa, workspace pretendido e arquivos opcionais.
2. Validar o JWT com Supabase Auth e obter o usuário no servidor.
3. Ignorar qualquer `user_id` fornecido pelo cliente.
4. Confirmar associação ao workspace, função, permissões, plano e limites.
5. Confirmar que a conversa pertence ao mesmo usuário e workspace.
6. Criar um contexto de execução imutável para as ferramentas.
7. Aplicar usuário e workspace em todas as leituras e escritas.
8. Interromper a operação se o workspace não puder ser validado.

O uso de service role ocorrerá somente após autenticação e autorização. Chaves, tokens, segredos, linha digitável completa, Pix copia e cola e conteúdo financeiro desnecessário não serão registrados.

Serão aplicados limites por usuário, workspace e plano; allowlist de modelos; limites de tokens, imagens, arquivos, ferramentas e duração; cancelamento; proteção contra loops e idempotência.

## 6. Dados, cálculos e deduplicação

A camada canônica distinguirá explicitamente:

- receita operacional;
- entrada e saída de caixa;
- transferência interna;
- despesa;
- custo;
- pagamento de dívida;
- saldo disponível;
- resultado de caixa;
- lucro e margem estimados;
- previsão e ponto de equilíbrio.

Cada registro normalizado deverá expor, quando aplicável:

- `source_type`;
- `source_id`;
- usuário e workspace proprietários;
- data de competência e data de caixa;
- estado de confirmação;
- `deduplication_key`;
- relação com o registro originador;
- indicador de transferência interna ou espelhamento.

O modelo não executará somas essenciais quando houver uma ferramenta determinística disponível. Resultados de ferramentas incluirão valores, período, filtros, origem, fórmula e alertas de qualidade.

## 7. Conversa, memória e streaming

O servidor emitirá eventos tipados:

- `response.started`;
- `agent.status`;
- `tool.started`;
- `tool.completed`;
- `text.delta`;
- `visualization.ready`;
- `action.prepared`;
- `response.completed`;
- `response.failed`.

Os estados visuais refletirão eventos reais. O cancelamento interromperá o ciclo e impedirá novas ferramentas.

A memória conterá:

- histórico visível;
- workspace e usuário da conversa;
- período e filtros ativos;
- preferências de resposta;
- ferramentas e fontes utilizadas;
- referências a gráficos, documentos e ações;
- resumo progressivo para controle de tokens;
- identificadores da Responses API quando apropriado.

Dados sensíveis de ferramentas terão retenção explícita. Nenhum estado de conversa será reutilizado em outro workspace.

## 8. Visualizações

Gráficos normais serão renderizados pelo frontend com Recharts a partir de um contrato validado. O contrato conterá:

```json
{
  "type": "line | bar | area | pie | composed | kpi | table",
  "title": "string",
  "description": "string",
  "xAxis": { "key": "string", "label": "string" },
  "yAxis": { "label": "string", "format": "currency | number | percent" },
  "series": [
    {
      "key": "string",
      "label": "string",
      "color": "string",
      "format": "currency | number | percent"
    }
  ],
  "data": [],
  "insight": "string",
  "source": [],
  "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "filters": []
}
```

O renderer tratará dados vazios, valores negativos, moeda, percentuais, responsividade, tema e acessibilidade. O Code Interpreter será reservado para planilhas, projeções especiais e geração de arquivos; não substituirá cálculos canônicos nem autorizará escritas.

## 9. Documentos multimodais

### 9.1 Entrada e normalização

O backend validará MIME declarado e assinatura real, tamanho, quantidade e permissões. Arquivos serão armazenados de forma privada e temporária.

Imagens passarão por correção de EXIF, avaliação de nitidez, iluminação, corte, perspectiva e rotação. Transformações determinísticas poderão testar orientações de 0°, 90°, 180° e 270°, melhorar contraste, reduzir ruído e redimensionar preservando letras pequenas.

PDFs serão enviados como `input_file`, preservando a origem por página. Divisão em páginas ocorrerá apenas quando tamanho, qualidade ou análise exigir.

### 9.2 Extração e validação

Schemas separados cobrirão boleto, nota fiscal e comprovante. A resposta conterá:

```json
{
  "document_type": "boleto | nota_fiscal | comprovante | desconhecido",
  "confidence": 0,
  "fields": {},
  "field_confidence": {},
  "field_sources": {},
  "warnings": [],
  "missing_fields": [],
  "possible_duplicates": [],
  "recommended_action": "string"
}
```

Validações determinísticas verificarão datas, CPF/CNPJ, linha digitável, somas, itens, total e consistência. Campos desconhecidos permanecerão ausentes; não serão inventados. Nova imagem será solicitada somente quando a qualidade impedir uma decisão segura.

## 10. Preparação e confirmação de ações

Uma ação preparada conterá:

- `action_id`;
- tipo e versão;
- usuário e workspace;
- estado anterior e alteração proposta;
- resumo legível;
- alertas e campos editáveis;
- hash de idempotência;
- validade;
- status: preparada, confirmada, executada, cancelada ou expirada.

O modelo poderá selecionar uma proposta pendente a partir do contexto conversacional, mas a execução exigirá confirmação explícita registrada por controle da interface. A confirmação será revalidada no servidor, incluindo identidade, workspace, permissões, validade, conteúdo e idempotência.

Operações destrutivas e alteração direta de saldo ficam fora do escopo inicial. Correções usarão histórico e reversão em vez de exclusão silenciosa.

## 11. Erros e observabilidade

Erros serão classificados em autenticação, autorização, validação, dados insuficientes, ferramenta, provedor, timeout, limite e conflito de escrita. O frontend receberá código estável, mensagem amigável, possibilidade de retry quando segura e identificador de correlação.

Serão registrados de forma sanitizada:

- usuário, workspace e conversa;
- intenção;
- ferramenta, duração e estado;
- modelo e uso de tokens;
- custo estimado;
- documento e confiança agregada;
- ação preparada, confirmada ou executada;
- erro e correlação.

O painel administrativo exibirá uso, custo, falhas, sucesso, baixa confiança, ações e latência, respeitando permissões e minimização de dados.

## 12. Controle de custo

O backend controlará os modelos permitidos e selecionará uma classe de modelo por tarefa: consultas simples, análise complexa e documentos. O frontend não poderá escolher livremente qualquer modelo.

Serão implementados limites de entrada e saída, cache seguro de consultas e contexto, quotas diárias e mensais, contabilização de uso, custo estimado, alertas e interrupção de ciclos excessivos. O cache sempre incluirá workspace, usuário, permissões, versão das regras, filtros e período em sua chave.

## 13. Testes e avaliações

### 13.1 Testes automatizados

- Unitários: schemas, datas, fórmulas, deduplicação e contratos.
- Integração: ferramentas, camada canônica, orquestração e streaming.
- Segurança: JWT inválido, workspace cruzado, permissões e manipulação de IDs.
- Documentos: rotações, iluminação, PDFs, somas e campos ilegíveis.
- Ações: edição, confirmação, cancelamento, expiração, concorrência e idempotência.
- Frontend: streaming, cancelamento, retry, gráficos e propostas.
- Resiliência: OpenAI indisponível, timeout, rate limit e falhas parciais.

### 13.2 Conjunto de avaliação

O conjunto inicial terá no mínimo:

- 50 perguntas financeiras;
- 20 imagens de documentos;
- 10 PDFs;
- 10 cenários de ações;
- 10 conflitos ou ambiguidades;
- 10 tentativas de acesso indevido.

As métricas serão precisão numérica, alucinação, escolha de ferramenta, extração, confirmação, autorização, latência, custo e satisfação.

## 14. Implantação e rollback

1. Segurança e autenticação server-side, com isolamento por workspace.
2. Camada financeira canônica, incluindo regras e deduplicação.
3. Ferramentas de consulta em ambiente controlado.
4. Orquestrador, memória e streaming no chat privado.
5. Contratos e renderização nativa de gráficos.
6. Pipeline multimodal de documentos.
7. Preparação, edição e execução confirmada de ações.
8. Integração posterior com grupos operacionais de permissões limitadas.
9. Aumento gradual da disponibilidade conforme métricas e avaliações.
10. Remoção do motor antigo somente após estabilidade comprovada.

Cada fase terá feature flag própria quando necessário e poderá ser desativada sem desligar as capacidades anteriores. A primeira entrega funcional será o chat privado autorizado; grupos operacionais não bloquearão sua entrada em produção controlada.

O rollback desligará a V2 sem apagar conversas, documentos ou propostas. Nenhuma migration destrutiva fará parte da primeira entrega.

## 15. Critérios de aceite

A V2 somente será considerada pronta quando:

- compreender variações naturais sem roteamento por palavras-chave;
- transmitir respostas e estados em streaming;
- manter contexto isolado por workspace;
- validar autenticação e autorização no servidor;
- filtrar toda ferramenta por usuário e workspace;
- exigir confirmação persistida para escritas;
- produzir auditoria sanitizada e aplicar rate limiting;
- processar imagens rotacionadas e PDFs como arquivos;
- retornar confiança por campo e solicitar nova imagem quando necessário;
- gerar contratos de gráfico válidos e renderizá-los nativamente;
- impedir duplicidade entre fontes;
- consultar os módulos autorizados definidos no catálogo de ferramentas;
- diferenciar saldo, caixa, lucro, margem e projeção;
- permitir editar, confirmar e cancelar propostas;
- passar TypeScript, lint, testes e build;
- restringir o acesso financeiro completo ao chat privado autorizado;
- impedir que grupos operacionais herdem contexto ou permissões do chat privado;
- atingir pelo menos 95% de precisão nos valores financeiros do conjunto de avaliação;
- atingir pelo menos 90% de sucesso na extração de documentos classificados como legíveis;
- bloquear 100% das tentativas de acesso a outro workspace no conjunto de segurança;
- executar zero ações de escrita sem confirmação técnica persistida;
- produzir zero duplicidades nos cenários de teste de nota fiscal, boleto e pagamento.

Precisão financeira será calculada por comparação entre resultado esperado e resultado retornado para valores, períodos, filtros e fórmulas do conjunto versionado. Sucesso documental exigirá classificação correta do documento e extração correta dos campos obrigatórios legíveis. Qualquer violação de isolamento, escrita sem confirmação ou duplicidade crítica será bloqueadora para produção, independentemente da média das demais métricas.

## 16. Entregáveis

- código e migrations;
- Edge Functions e ferramentas;
- camada financeira canônica;
- streaming e componentes de chat;
- contratos e renderer de gráficos;
- pipeline de documentos;
- gateway de ações;
- testes e conjunto de avaliação;
- documentação técnica e operacional;
- variáveis de ambiente;
- plano de rollback;
- relatórios de segurança e custo;
- exemplos de uso, changelog e inventário de arquivos alterados;
- relatório final com implementado, pendências, riscos, testes, custos, branch, commit e parecer de produção.

## 17. Restrições de implementação

- Preservar funcionalidades existentes e entender cada implementação antes de substituí-la.
- Comparar branch atual, `develop`, `master` e branches relacionadas à IA antes da primeira alteração funcional.
- Executar e registrar baseline de testes, lint, TypeScript e build.
- Trabalhar em `feat/ia-agente-financeiro-v2`, baseada na branch mais adequada após a comparação.
- Alterações de banco somente por migrations reversíveis.
- Não alterar dados de produção diretamente.
- Não declarar conclusão enquanto houver critérios de aceite pendentes.
