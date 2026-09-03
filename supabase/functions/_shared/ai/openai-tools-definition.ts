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
];
