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
