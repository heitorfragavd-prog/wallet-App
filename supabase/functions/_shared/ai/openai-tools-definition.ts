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
        "Busca receitas operacionais no período especificado. Retorna lista com data, valor, categoria, descrição e referências canônicas.",
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
