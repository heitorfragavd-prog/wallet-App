export interface OpenAiFunctionDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export const OPENAI_FINANCIAL_TOOLS: OpenAiFunctionDefinition[] = [
  {
    type: "function",
    function: {
      name: "buscar_receitas",
      description:
        "Busca RECEITAS FINANCEIRAS registradas na Wallet no período especificado. " +
        "Inclui: Pix e Cartão (líquidos de taxas Divipay) + Dinheiro PDV Eyemobile + Receitas manuais importadas. " +
        "IMPORTANTE: este é o valor JÁ LÍQUIDO de taxas — diferente do faturamento bruto. " +
        "NÃO usar para responder 'quanto vendi?' ou 'qual meu faturamento?'. " +
        "Para VENDAS BRUTAS do PDV, use buscar_vendas_pdv.",
      parameters: {
        type: "object",
        properties: {
          start: {
            type: "string",
            description: "Data inicial no formato YYYY-MM-DD",
          },
          end: {
            type: "string",
            description: "Data final no formato YYYY-MM-DD",
          },
        },
        required: ["start", "end"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_vendas_pdv",
      description:
        "Busca VENDAS BRUTAS do PDV Eyemobile no período especificado. " +
        "Este é o FATURAMENTO BRUTO — o valor total vendido no caixa antes das taxas. " +
        "Usar para responder: 'quanto vendi?', 'qual meu faturamento?', 'como estão as vendas?'. " +
        "NÃO confundir com receitas: vendas brutas > receitas líquidas (diferença = taxas Divipay). " +
        "Se retornar vazio, Eyemobile pode estar offline ou sem sincronização para o período.",
      parameters: {
        type: "object",
        properties: {
          start: {
            type: "string",
            description: "Data inicial no formato YYYY-MM-DD",
          },
          end: {
            type: "string",
            description: "Data final no formato YYYY-MM-DD",
          },
        },
        required: ["start", "end"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_despesas",
      description:
        "Busca despesas operacionais no período especificado. Retorna lista com data, valor, categoria, descrição e referências canônicas.",
      parameters: {
        type: "object",
        properties: {
          start: {
            type: "string",
            description: "Data inicial no formato YYYY-MM-DD",
          },
          end: {
            type: "string",
            description: "Data final no formato YYYY-MM-DD",
          },
        },
        required: ["start", "end"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_transacoes",
      description:
        "Busca transações financeiras gerais (entradas, saídas, transferências) no período especificado.",
      parameters: {
        type: "object",
        properties: {
          start: {
            type: "string",
            description: "Data inicial no formato YYYY-MM-DD",
          },
          end: {
            type: "string",
            description: "Data final no formato YYYY-MM-DD",
          },
        },
        required: ["start", "end"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_saldos",
      description:
        "Consulta os saldos atuais consolidados de contas bancárias e carteiras do workspace (exclui limites de cartão).",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_dividas",
      description:
        "Consulta dívidas e compromissos financeiros pendentes ou no período.",
      parameters: {
        type: "object",
        properties: {
          start: {
            type: "string",
            description: "Data inicial no formato YYYY-MM-DD",
          },
          end: {
            type: "string",
            description: "Data final no formato YYYY-MM-DD",
          },
        },
        required: ["start", "end"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_resumo_mensal",
      description:
        "Calcula o resumo determinístico consolidado de um mês específico (receitas, despesas, transferências, resultado de caixa e saldos).",
      parameters: {
        type: "object",
        properties: {
          year: {
            type: "integer",
            description: "Ano do resumo (ex: 2026)",
          },
          month: {
            type: "integer",
            description: "Mês do resumo de 1 a 12 (ex: 8 para agosto)",
          },
        },
        required: ["year", "month"],
        additionalProperties: false,
      },
    },
  },
];

export const OPENAI_EXTENDED_READ_TOOLS: OpenAiFunctionDefinition[] = [
  {
    type: "function",
    function: {
      name: "consultar_fluxo_caixa",
      description:
        "Calcula o fluxo de caixa consolidado (total de entradas, saídas e resultado líquido) para o período especificado.",
      parameters: {
        type: "object",
        properties: {
          start: {
            type: "string",
            description: "Data inicial no formato YYYY-MM-DD",
          },
          end: {
            type: "string",
            description: "Data final no formato YYYY-MM-DD",
          },
        },
        required: ["start", "end"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_contas",
      description:
        "Consulta as contas bancárias e carteiras ativas no workspace e seus saldos atuais consolidados.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validar_fechamento_caixa",
      description:
        "Valida o fechamento de caixa operacional cruzando vendas, saídas/sangrias e valores relatados, detectando furos ou sobras de forma determinística.",
      parameters: {
        type: "object",
        properties: {
          data: { type: "string", description: "Data do turno a validar no formato YYYY-MM-DD" },
          turno: { type: "string", description: "Identificador do turno (opcional, ex: manha, noite)" },
          valor_relatado: { type: "number", description: "Valor total em dinheiro ou saldo relatado pelo operador" },
          valores_por_meio: {
            type: "object",
            description: "Valores relatados discriminados por meio de pagamento (dinheiro, debito, credito, pix, voucher)",
            properties: {
              dinheiro: { type: "number" },
              debito: { type: "number" },
              credito: { type: "number" },
              pix: { type: "number" },
              voucher: { type: "number" },
            },
            additionalProperties: false,
          },
        },
        required: ["data"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_vendas_eyemobile",
      description:
        "Consulta as vendas operacionais realizadas no PDV Eyemobile e registradas no workspace, discriminadas por meio de pagamento.",
      parameters: {
        type: "object",
        properties: {
          data_inicio: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
          data_fim: { type: "string", description: "Data final no formato YYYY-MM-DD" },
        },
        required: ["data_inicio"],
        additionalProperties: false,
      },
    },
  },
];

export const OPENAI_ACTION_TOOLS: OpenAiFunctionDefinition[] = [
  {
    type: "function",
    function: {
      name: "cadastrar_transacao",
      description:
        "Gera uma Proposta de Ação (Action Proposal) para registrar uma nova receita ou despesa. NÃO executa a mutação diretamente; exige confirmação humana explícita.",
      parameters: {
        type: "object",
        properties: {
          descricao: { type: "string", description: "Descrição clara da transação" },
          valor: { type: "number", description: "Valor monetário positivo em Reais" },
          tipo: { type: "string", enum: ["receita", "despesa"], description: "Tipo da transação" },
          data: { type: "string", description: "Data no formato YYYY-MM-DD" },
          categoria_nome: { type: "string", description: "Nome da categoria (ex: Alimentação, Vendas)" },
          conta_nome: { type: "string", description: "Nome da conta de origem/destino (ex: Nubank, Caixa)" },
          metodo_pagamento: { type: "string", description: "Método (ex: pix, cartao, dinheiro, boleto)" },
          observacoes: { type: "string", description: "Notas adicionais" },
        },
        required: ["descricao", "valor", "tipo", "data"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_divida",
      description:
        "Gera uma Proposta de Ação para registrar uma nova dívida ou compromisso financeiro. Exige confirmação humana explícita.",
      parameters: {
        type: "object",
        properties: {
          descricao: { type: "string", description: "Descrição do compromisso" },
          valor_total: { type: "number", description: "Valor total devido em Reais" },
          credor: { type: "string", description: "Nome do credor ou fornecedor" },
          data_vencimento: { type: "string", description: "Data de vencimento YYYY-MM-DD" },
          parcelas: { type: "number", description: "Número de parcelas (opcional)" },
        },
        required: ["descricao", "valor_total"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_meta",
      description:
        "Gera uma Proposta de Ação para criar uma meta financeira. Exige confirmação humana explícita.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Título da meta financeira" },
          valor_alvo: { type: "number", description: "Valor total alvo a ser acumulado em Reais" },
          valor_atual: { type: "number", description: "Valor inicial já acumulado (padrão 0)" },
          data_limite: { type: "string", description: "Prazo final no formato YYYY-MM-DD (opcional)" },
          descricao: { type: "string", description: "Motivo ou detalhes da meta" },
        },
        required: ["nome", "valor_alvo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_conta",
      description:
        "Gera uma Proposta de Ação de alto risco para cadastrar nova conta financeira ou carteira. Exige confirmação humana explícita.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome da conta (ex: Banco Inter, Cofre)" },
          tipo: {
            type: "string",
            enum: ["conta_corrente", "carteira", "poupanca", "investimento", "outro"],
            description: "Tipo da conta",
          },
          saldo: { type: "number", description: "Saldo inicial da conta em Reais (padrão 0)" },
        },
        required: ["nome", "tipo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deletar_transacao",
      description:
        "Gera uma Proposta de Ação de alto risco para excluir transação. Bloqueada por padrão; exige aprovação estrita.",
      parameters: {
        type: "object",
        properties: {
          transacao_id: { type: "string", description: "ID único da transação a excluir" },
          motivo: { type: "string", description: "Justificativa da exclusão" },
        },
        required: ["transacao_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_custo_produto_eyemobile",
      description:
        "Gera uma Proposta de Ação (Action Proposal) para atualizar o custo de um produto no Eyemobile PDV e/ou adicionar quantidade ao estoque. Exige confirmação humana explícita.",
      parameters: {
        type: "object",
        properties: {
          produto_id: { type: "string", description: "ID canônico do produto no Eyemobile" },
          produto_nome: { type: "string", description: "Nome do produto para referência" },
          codigo_barras: { type: "string", description: "Código de barras do produto (EAN/GTIN)" },
          novo_custo: { type: "number", description: "Novo custo unitário em Reais" },
          quantidade_estoque: { type: "number", description: "Quantidade atualizada no estoque (opcional)" },
          motivo: { type: "string", description: "Motivo da alteração de custo" },
        },
        required: ["novo_custo"],
        additionalProperties: false,
      },
    },
  },
];

export const OPENAI_ALL_TOOLS: OpenAiFunctionDefinition[] = [
  ...OPENAI_FINANCIAL_TOOLS,
  ...OPENAI_EXTENDED_READ_TOOLS,
  ...OPENAI_ACTION_TOOLS,
];

