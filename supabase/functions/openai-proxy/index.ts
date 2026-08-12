import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "buscar_transacoes",
      description: "Busca transações financeiras do usuário com filtros opcionais por período, tipo e categoria.",
      parameters: {
        type: "object",
        properties: {
          data_inicio: { type: "string", description: "Data início no formato YYYY-MM-DD" },
          data_fim: { type: "string", description: "Data fim no formato YYYY-MM-DD" },
          tipo: { type: "string", enum: ["receita", "despesa"], description: "Tipo da transação" },
          categoria_id: { type: "string", description: "ID da categoria para filtrar" },
          categoria_nome: { type: "string", description: "Nome da categoria para filtrar (alternativa ao ID)" },
          limit: { type: "number", description: "Limite de resultados (padrão 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_resumo_mensal",
      description: "Retorna resumo financeiro de um mês específico: total receitas, despesas, saldo e top categorias.",
      parameters: {
        type: "object",
        properties: {
          ano: { type: "number", description: "Ano (ex: 2025)" },
          mes: { type: "number", description: "Mês 1-12" },
        },
        required: ["ano", "mes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comparar_periodos",
      description: "Compara dois meses mostrando variação percentual de receitas, despesas e saldo.",
      parameters: {
        type: "object",
        properties: {
          ano1: { type: "number" }, mes1: { type: "number" },
          ano2: { type: "number" }, mes2: { type: "number" },
        },
        required: ["ano1", "mes1", "ano2", "mes2"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_saldos",
      description: "Lista todas as contas do usuário com ID, nome, tipo e saldo. Use para descobrir o ID de uma conta pelo nome.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_categorias",
      description: "Lista categorias de transações com ID e nome. Use para descobrir o ID de uma categoria pelo nome.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["receita", "despesa"], description: "Filtrar por tipo" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_transacoes_recorrentes",
      description: "Lista gastos e receitas fixos mensais (assinaturas, aluguel, salário).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "projetar_gastos",
      description: "Projeta receitas e despesas dos próximos N meses com base nas recorrências cadastradas.",
      parameters: {
        type: "object",
        properties: {
          meses: { type: "number", description: "Número de meses para projetar (1-12)" },
        },
        required: ["meses"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_dividas",
      description: "Lista dívidas do usuário com status, vencimentos e valores pendentes.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pendente", "vencida", "quitada"], description: "Filtrar por status" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_metas",
      description: "Lista metas financeiras do usuário com progresso, valor alvo e prazo.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ativa", "concluida", "pausada", "vencida"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_veiculos",
      description: "Lista veículos do usuário com manutenções pendentes ou atrasadas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_orcamentos",
      description: "Lista orçamentos de compras/mercado com itens pendentes.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_transacao",
      description: "Registra nova receita ou despesa. Aceita nomes de conta e categoria (resolve automaticamente para IDs). SEMPRE forneça categoria_nome e conta_nome quando o usuário mencionar.",
      parameters: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          valor: { type: "number", description: "Valor positivo" },
          tipo: { type: "string", enum: ["receita", "despesa"] },
          data: { type: "string", description: "YYYY-MM-DD" },
          categoria_id: { type: "string", description: "UUID da categoria (use se já tiver o ID)" },
          categoria_nome: { type: "string", description: "Nome da categoria (ex: 'Vendas', 'Alimentação'). Resolvido automaticamente para ID." },
          conta_id: { type: "string", description: "UUID da conta (use se já tiver o ID)" },
          conta_nome: { type: "string", description: "Nome da conta (ex: 'PagSeguro', 'Sicoob', 'Nubank'). Resolvido automaticamente para ID." },
          metodo_pagamento: { type: "string", description: "Método: pix, cartao, dinheiro, boleto, transferencia, voucher" },
          observacoes: { type: "string", description: "Observações adicionais" },
        },
        required: ["descricao", "valor", "tipo", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_transacao",
      description: "Atualiza uma transação existente (receita ou despesa). Aceita nomes de conta e categoria.",
      parameters: {
        type: "object",
        properties: {
          transacao_id: { type: "string", description: "ID da transação" },
          descricao: { type: "string" },
          valor: { type: "number" },
          data: { type: "string", description: "YYYY-MM-DD" },
          categoria_id: { type: "string" },
          categoria_nome: { type: "string", description: "Nome da categoria (resolvido automaticamente)" },
          conta_id: { type: "string" },
          conta_nome: { type: "string", description: "Nome da conta (resolvido automaticamente)" },
          metodo_pagamento: { type: "string" },
          observacoes: { type: "string" },
        },
        required: ["transacao_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deletar_transacao",
      description: "Remove transação cadastrada incorretamente. Requer confirmação explícita do usuário.",
      parameters: {
        type: "object",
        properties: {
          transacao_id: { type: "string" },
        },
        required: ["transacao_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_conta",
      description: "Cria uma nova conta financeira para o usuário.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome da conta (ex: 'PagSeguro', 'Nubank')" },
          tipo: { type: "string", enum: ["conta_corrente", "poupanca", "carteira", "investimento", "cartao_credito", "outro"], description: "Tipo da conta" },
          saldo: { type: "number", description: "Saldo inicial (padrão 0)" },
        },
        required: ["nome", "tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_conta",
      description: "Atualiza dados de uma conta existente. Aceita nome da conta para resolver o ID.",
      parameters: {
        type: "object",
        properties: {
          conta_id: { type: "string", description: "UUID da conta (use se já tiver)" },
          conta_nome: { type: "string", description: "Nome da conta para localizar (alternativa ao ID)" },
          nome: { type: "string", description: "Novo nome" },
          saldo: { type: "number", description: "Novo saldo" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_divida",
      description: "Registra nova dívida ou financiamento.",
      parameters: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          valor_total: { type: "number" },
          credor: { type: "string" },
          data_vencimento: { type: "string", description: "YYYY-MM-DD" },
          parcelas: { type: "number" },
        },
        required: ["descricao", "valor_total"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_divida",
      description: "Atualiza status de dívida (ex: marcar como paga, registrar pagamento parcial).",
      parameters: {
        type: "object",
        properties: {
          divida_id: { type: "string" },
          status: { type: "string", enum: ["pendente", "vencida", "quitada"] },
          valor_pago: { type: "number" },
        },
        required: ["divida_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_meta",
      description: "Cria nova meta financeira com valor alvo e prazo.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string" },
          valor_alvo: { type: "number" },
          valor_atual: { type: "number", description: "Valor já acumulado (padrão 0)" },
          data_limite: { type: "string", description: "YYYY-MM-DD" },
          descricao: { type: "string" },
        },
        required: ["nome", "valor_alvo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_meta",
      description: "Atualiza progresso ou dados de uma meta existente.",
      parameters: {
        type: "object",
        properties: {
          meta_id: { type: "string" },
          valor_atual: { type: "number" },
          status: { type: "string", enum: ["ativa", "concluida", "pausada"] },
          nome: { type: "string" },
          valor_alvo: { type: "number" },
          data_limite: { type: "string" },
        },
        required: ["meta_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analisar_documento",
      description: "Analisa uma imagem ou PDF de documento financeiro (Nota Fiscal ou Boleto) e extrai dados estruturados em JSON. Use quando o usuário enviar qualquer imagem de documento.",
      parameters: {
        type: "object",
        properties: {
          image_base64: { type: "string", description: "Documento em base64" },
          tipo_suspeito: { type: "string", enum: ["nota_fiscal", "boleto", "desconhecido"] },
        },
        required: ["image_base64"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_custo_produto_eyemobile",
      description: "Atualiza o custo de um produto no Eyemobile PDV e adiciona quantidade ao estoque. Use após analisar uma NF de compra.",
      parameters: {
        type: "object",
        properties: {
          produto_id: { type: "string" },
          produto_nome: { type: "string" },
          codigo_barras: { type: "string" },
          novo_custo: { type: "number" },
          quantidade_estoque: { type: "number" },
        },
        required: ["novo_custo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_despesa_nf",
      description: "Cadastra uma despesa no sistema a partir dos dados de uma Nota Fiscal de compra.",
      parameters: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          valor: { type: "number" },
          data: { type: "string" },
          categoria_nome: { type: "string" },
          fornecedor: { type: "string" },
          metodo_pagamento: { type: "string", enum: ["pix", "boleto", "cartao_credito", "cartao_debito", "dinheiro", "outros"] },
          numero_nf: { type: "string" },
        },
        required: ["descricao", "valor", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_divida_boleto",
      description: "Cadastra uma nova dívida no sistema a partir dos dados de um boleto analisado.",
      parameters: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          valor_total: { type: "number" },
          credor: { type: "string" },
          data_vencimento: { type: "string" },
          codigo_barras: { type: "string" },
          linha_digitavel: { type: "string" },
          pix_copia_cola: { type: "string" },
          parcelas: { type: "number" },
          categoria_nome: { type: "string" },
        },
        required: ["descricao", "valor_total", "data_vencimento"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validar_fechamento_caixa",
      description: "Analisa o valor relatado pelo funcionário no fechamento de turno e cruza com as vendas registradas no Eyemobile PDV e transferências para encontrar furos de caixa.",
      parameters: {
        type: "object",
        properties: {
          valor_relatado: { type: "number" },
          turno_data: { type: "string", description: "Data do turno a validar (YYYY-MM-DD)" },
        },
        required: ["valor_relatado", "turno_data"],
      },
    },
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Helper: fuzzy name resolution for accounts and categories
// ──────────────────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function resolveContaByName(supabase: any, userId: string, nome: string): Promise<string | null> {
  const { data } = await supabase.from("contas_usuario").select("id,nome").eq("user_id", userId);
  if (!data || data.length === 0) return null;
  const lower = nome.toLowerCase().trim();
  // Exact match first
  // deno-lint-ignore no-explicit-any
  const exact = data.find((c: any) => c.nome.toLowerCase() === lower);
  if (exact) return exact.id;
  // Partial match (contains)
  // deno-lint-ignore no-explicit-any
  const partial = data.find((c: any) => c.nome.toLowerCase().includes(lower) || lower.includes(c.nome.toLowerCase()));
  if (partial) return partial.id;
  // Normalized match (remove spaces, accents)
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  const normalizedInput = normalize(nome);
  // deno-lint-ignore no-explicit-any
  const normalized = data.find((c: any) => normalize(c.nome) === normalizedInput || normalize(c.nome).includes(normalizedInput) || normalizedInput.includes(normalize(c.nome)));
  return normalized?.id || null;
}

// deno-lint-ignore no-explicit-any
async function resolveCategoriaByName(supabase: any, userId: string, nome: string, tipo?: string): Promise<string | null> {
  let q = supabase.from("categorias").select("id,nome,tipo").eq("user_id", userId);
  if (tipo) q = q.eq("tipo", tipo);
  const { data } = await q;
  if (!data || data.length === 0) return null;
  const lower = nome.toLowerCase().trim();
  // deno-lint-ignore no-explicit-any
  const exact = data.find((c: any) => c.nome.toLowerCase() === lower);
  if (exact) return exact.id;
  // deno-lint-ignore no-explicit-any
  const partial = data.find((c: any) => c.nome.toLowerCase().includes(lower) || lower.includes(c.nome.toLowerCase()));
  if (partial) return partial.id;
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  const normalizedInput = normalize(nome);
  // deno-lint-ignore no-explicit-any
  const normalized = data.find((c: any) => normalize(c.nome) === normalizedInput || normalize(c.nome).includes(normalizedInput) || normalizedInput.includes(normalize(c.nome)));
  return normalized?.id || null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: fetch transactions from ALL 3 tables (transacoes + receitas + despesas)
// ──────────────────────────────────────────────────────────────────────────────
interface TransacaoRow {
  id: string;
  descricao: string;
  valor: number;
  tipo: string;
  data: string;
  created_at: string;
  categoria_id?: string | null;
  categorias?: { nome: string } | null;
  metodo_pagamento?: string | null;
  observacoes?: string | null;
  conta_id?: string | null;
  origem: "transacoes" | "receitas" | "despesas";
}

// deno-lint-ignore no-explicit-any
async function fetchAllTransacoes(supabase: any, userId: string, opts?: {
  dataInicio?: string;
  dataFim?: string;
  tipo?: string;
  categoriaId?: string;
  limit?: number;
  select?: string;
}): Promise<TransacaoRow[]> {
  const sel = opts?.select || "id,descricao,valor,tipo,data,created_at,categoria_id,categorias(nome)";
  const selNonTipo = sel.replace(",tipo", "");

  // deno-lint-ignore no-explicit-any
  const buildQuery = (table: string, hasTipo: boolean) => {
    let q = supabase.from(table).select(hasTipo ? sel : selNonTipo).eq("user_id", userId);
    if (opts?.dataInicio) q = q.gte("data", opts.dataInicio);
    if (opts?.dataFim) q = q.lte("data", opts.dataFim);
    if (hasTipo && opts?.tipo) q = q.eq("tipo", opts.tipo);
    if (opts?.categoriaId) q = q.eq("categoria_id", opts.categoriaId);
    return q;
  };

  const skipReceitas = opts?.tipo === "despesa";
  const skipDespesas = opts?.tipo === "receita";

  const promises = [
    buildQuery("transacoes", true),
    skipReceitas ? Promise.resolve({ data: [], error: null }) : buildQuery("receitas", false),
    skipDespesas ? Promise.resolve({ data: [], error: null }) : buildQuery("despesas", false),
  ];

  const [resT, resR, resD] = await Promise.all(promises);

  // deno-lint-ignore no-explicit-any
  const transacoes = (resT.data || []).map((t: any) => ({ ...t, origem: "transacoes" }));
  // deno-lint-ignore no-explicit-any
  const receitas = (resR.data || []).map((r: any) => ({ ...r, tipo: "receita", origem: "receitas" }));
  // deno-lint-ignore no-explicit-any
  const despesas = (resD.data || []).map((d: any) => ({ ...d, tipo: "despesa", origem: "despesas" }));

  const merged = [...transacoes, ...receitas, ...despesas];
  merged.sort((a: TransacaoRow, b: TransacaoRow) => (b.data || "").localeCompare(a.data || ""));

  if (opts?.limit) {
    return merged.slice(0, opts.limit);
  }
  return merged;
}

// deno-lint-ignore no-explicit-any
async function executeTool(name: string, args: Record<string, unknown>, supabase: any, userId: string): Promise<unknown> {
  switch (name) {
    case "buscar_transacoes": {
      // Resolve categoria_nome to ID if provided
      let categoriaId = args.categoria_id as string | undefined;
      if (!categoriaId && args.categoria_nome) {
        categoriaId = await resolveCategoriaByName(supabase, userId, args.categoria_nome as string) || undefined;
        if (!categoriaId) return { error: `Categoria "${args.categoria_nome}" não encontrada. Use consultar_categorias para ver as categorias disponíveis.` };
      }
      const data = await fetchAllTransacoes(supabase, userId, {
        dataInicio: args.data_inicio as string | undefined,
        dataFim: args.data_fim as string | undefined,
        tipo: args.tipo as string | undefined,
        categoriaId,
        limit: (args.limit as number) || 50,
      });
      return data;
    }
    case "consultar_resumo_mensal": {
      const { ano, mes } = args as { ano: number; mes: number };
      const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
      const data = await fetchAllTransacoes(supabase, userId, {
        dataInicio: inicio,
        dataFim: fim,
        select: "id,descricao,valor,tipo,data,created_at,categoria_id,categorias(nome)",
      });
      // deno-lint-ignore no-explicit-any
      const receitas = data.filter((t: any) => t.tipo === "receita").reduce((s: number, t: any) => s + Number(t.valor), 0);
      // deno-lint-ignore no-explicit-any
      const despesas = data.filter((t: any) => t.tipo === "despesa").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const porCategoria: Record<string, number> = {};
      // deno-lint-ignore no-explicit-any
      data.filter((t: any) => t.tipo === "despesa").forEach((t: any) => {
        const cat = t.categorias?.nome || "Sem categoria";
        porCategoria[cat] = (porCategoria[cat] || 0) + Number(t.valor);
      });
      const topCategorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, valor]) => ({ nome, valor }));
      return { periodo: `${mes}/${ano}`, receitas, despesas, saldo: receitas - despesas, topCategorias, total_transacoes: data.length };
    }
    case "comparar_periodos": {
      const { ano1, mes1, ano2, mes2 } = args as { ano1: number; mes1: number; ano2: number; mes2: number };
      async function getResumo(ano: number, mes: number) {
        const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
        const data = await fetchAllTransacoes(supabase, userId, {
          dataInicio: inicio,
          dataFim: fim,
          select: "id,valor,tipo,data,created_at,categoria_id",
        });
        // deno-lint-ignore no-explicit-any
        const receitas = data.filter((t: any) => t.tipo === "receita").reduce((s: number, t: any) => s + Number(t.valor), 0);
        // deno-lint-ignore no-explicit-any
        const despesas = data.filter((t: any) => t.tipo === "despesa").reduce((s: number, t: any) => s + Number(t.valor), 0);
        return { receitas, despesas, saldo: receitas - despesas };
      }
      const [p1, p2] = await Promise.all([getResumo(ano1, mes1), getResumo(ano2, mes2)]);
      const variacao = (a: number, b: number) => b === 0 ? null : ((a - b) / b * 100).toFixed(1) + "%";
      return { periodo1: `${mes1}/${ano1}`, periodo2: `${mes2}/${ano2}`, periodo1_dados: p1, periodo2_dados: p2, variacao: { receitas: variacao(p2.receitas, p1.receitas), despesas: variacao(p2.despesas, p1.despesas), saldo: variacao(p2.saldo, p1.saldo) } };
    }
    case "consultar_saldos": {
      const { data, error } = await supabase.from("contas_usuario").select("id,nome,tipo,saldo").eq("user_id", userId);
      if (error) return { error: error.message };
      // deno-lint-ignore no-explicit-any
      const total = (data || []).reduce((s: number, c: any) => s + Number(c.saldo), 0);
      return { contas: data, total_geral: total };
    }
    case "consultar_categorias": {
      let q = supabase.from("categorias").select("id,nome,tipo").eq("user_id", userId);
      if (args.tipo) q = q.eq("tipo", args.tipo as string);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return data;
    }
    case "consultar_transacoes_recorrentes": {
      const { data, error } = await supabase.from("transacoes_recorrentes").select("id,descricao,valor,tipo,recorrencia,proxima_execucao,ativo").eq("user_id", userId).eq("ativo", true);
      if (error) return { error: error.message };
      return data;
    }
    case "projetar_gastos": {
      const meses = (args.meses as number) || 3;
      const { data } = await supabase.from("transacoes_recorrentes").select("valor,tipo,recorrencia").eq("user_id", userId).eq("ativo", true);
      const recorrentes = data || [];
      const projecoes = [];
      const hoje = new Date();
      for (let i = 1; i <= meses; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        let receitas = 0, despesas = 0;
        // deno-lint-ignore no-explicit-any
        recorrentes.forEach((t: any) => {
          const v = Number(t.valor);
          const mult = t.recorrencia === "semanal" ? 4 : t.recorrencia === "diaria" ? 30 : t.recorrencia === "anual" ? 1 / 12 : 1;
          if (t.tipo === "receita") receitas += v * mult;
          else despesas += v * mult;
        });
        projecoes.push({ mes: `${d.getMonth() + 1}/${d.getFullYear()}`, receitas_projetadas: receitas, despesas_projetadas: despesas, saldo_projetado: receitas - despesas });
      }
      return projecoes;
    }
    case "consultar_dividas": {
      let q = supabase.from("dividas").select("id,descricao,valor_total,valor_pago,credor,data_vencimento,status,parcelas").eq("user_id", userId);
      if (args.status) q = q.eq("status", args.status as string);
      const { data, error } = await q.order("data_vencimento", { ascending: true });
      if (error) return { error: error.message };
      return data;
    }
    case "consultar_metas": {
      let q = supabase.from("metas").select("id,nome,descricao,valor_alvo,valor_atual,data_limite,status").eq("user_id", userId);
      if (args.status) q = q.eq("status", args.status as string);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return data;
    }
    case "consultar_veiculos": {
      const { data, error } = await supabase.from("veiculos").select("id,marca,modelo,ano,quilometragem,manutencoes(id,data_realizada,proxima_data,status,tipos_manutencao(nome))").eq("user_id", userId);
      if (error) return { error: error.message };
      return data;
    }
    case "consultar_orcamentos": {
      const { data, error } = await supabase.from("orcamentos_mercado").select("id,nome,total_estimado,created_at,itens_mercado(id,nome,quantidade,unidade,status,categorias_mercado(nome))").eq("user_id", userId);
      if (error) return { error: error.message };
      return data;
    }
    case "cadastrar_transacao": {
      const { descricao, valor, tipo, data, metodo_pagamento, observacoes } = args as Record<string, unknown>;

      // Resolve conta by name if conta_nome is provided
      let contaId = args.conta_id as string | null;
      if (!contaId && args.conta_nome) {
        contaId = await resolveContaByName(supabase, userId, args.conta_nome as string);
        if (!contaId) {
          // List available accounts to help the agent
          const { data: contas } = await supabase.from("contas_usuario").select("id,nome").eq("user_id", userId);
          const nomesDisponiveis = (contas || []).map((c: { nome: string }) => c.nome).join(", ");
          return { error: `Conta "${args.conta_nome}" não encontrada. Contas disponíveis: ${nomesDisponiveis || "nenhuma"}. Use criar_conta para criar uma nova.` };
        }
      }

      // Resolve categoria by name if categoria_nome is provided
      let categoriaId = args.categoria_id as string | null;
      if (!categoriaId && args.categoria_nome) {
        categoriaId = await resolveCategoriaByName(supabase, userId, args.categoria_nome as string, tipo as string);
        if (!categoriaId) {
          const { data: cats } = await supabase.from("categorias").select("nome").eq("user_id", userId).eq("tipo", tipo as string);
          const nomesDisponiveis = (cats || []).map((c: { nome: string }) => c.nome).join(", ");
          return { error: `Categoria "${args.categoria_nome}" não encontrada para tipo "${tipo}". Categorias disponíveis: ${nomesDisponiveis || "nenhuma"}.` };
        }
      }

      // Insert into the correct table based on tipo
      const table = tipo === "receita" ? "receitas" : tipo === "despesa" ? "despesas" : "transacoes";
      const insertData: Record<string, unknown> = {
        user_id: userId,
        descricao,
        valor: Number(valor),
        data,
        categoria_id: categoriaId || null,
        conta_id: contaId || null,
      };
      if (table !== "transacoes") {
        insertData.metodo_pagamento = metodo_pagamento || null;
        insertData.observacoes = observacoes || null;
      } else {
        insertData.tipo = tipo;
      }
      const { data: result, error } = await supabase.from(table).insert(insertData).select("id,descricao,valor,data").single();
      if (error) return { error: error.message };
      return { sucesso: true, transacao: { ...result, tipo }, tabela: table };
    }
    case "atualizar_transacao": {
      const id = args.transacao_id as string;

      // Resolve conta by name
      let contaId = args.conta_id as string | undefined;
      if (!contaId && args.conta_nome) {
        contaId = await resolveContaByName(supabase, userId, args.conta_nome as string) || undefined;
        if (!contaId) return { error: `Conta "${args.conta_nome}" não encontrada.` };
      }

      // Resolve categoria by name
      let categoriaId = args.categoria_id as string | undefined;
      if (!categoriaId && args.categoria_nome) {
        categoriaId = await resolveCategoriaByName(supabase, userId, args.categoria_nome as string) || undefined;
        if (!categoriaId) return { error: `Categoria "${args.categoria_nome}" não encontrada.` };
      }

      const updates: Record<string, unknown> = {};
      if (args.descricao) updates.descricao = args.descricao;
      if (args.valor !== undefined) updates.valor = Number(args.valor);
      if (args.data) updates.data = args.data;
      if (categoriaId) updates.categoria_id = categoriaId;
      if (contaId) updates.conta_id = contaId;
      if (args.metodo_pagamento) updates.metodo_pagamento = args.metodo_pagamento;
      if (args.observacoes !== undefined) updates.observacoes = args.observacoes;

      // Try updating in all 3 tables
      const tables = ["receitas", "despesas", "transacoes"];
      for (const table of tables) {
        const { data: result, error } = await supabase.from(table).update(updates).eq("id", id).eq("user_id", userId).select("id,descricao,valor,data").maybeSingle();
        if (result) return { sucesso: true, transacao: result, tabela: table };
        if (error && error.code !== "PGRST116") return { error: error.message };
      }
      return { error: `Transação ${id} não encontrada.` };
    }
    case "deletar_transacao": {
      const id = args.transacao_id as string;
      const results = await Promise.all([
        supabase.from("transacoes").delete().eq("id", id).eq("user_id", userId),
        supabase.from("receitas").delete().eq("id", id).eq("user_id", userId),
        supabase.from("despesas").delete().eq("id", id).eq("user_id", userId),
      ]);
      const anyError = results.find(r => r.error);
      if (anyError?.error) return { error: anyError.error.message };
      return { sucesso: true };
    }
    case "criar_conta": {
      const { nome, tipo, saldo } = args as { nome: string; tipo: string; saldo?: number };
      const { data: result, error } = await supabase.from("contas_usuario").insert({
        user_id: userId,
        nome,
        tipo,
        saldo: Number(saldo || 0),
      }).select("id,nome,tipo,saldo").single();
      if (error) return { error: error.message };
      return { sucesso: true, conta: result };
    }
    case "atualizar_conta": {
      let contaId = args.conta_id as string | undefined;
      if (!contaId && args.conta_nome) {
        contaId = await resolveContaByName(supabase, userId, args.conta_nome as string) || undefined;
        if (!contaId) return { error: `Conta "${args.conta_nome}" não encontrada.` };
      }
      if (!contaId) return { error: "Informe conta_id ou conta_nome para localizar a conta." };

      const updates: Record<string, unknown> = {};
      if (args.nome) updates.nome = args.nome;
      if (args.saldo !== undefined) updates.saldo = Number(args.saldo);

      const { data: result, error } = await supabase.from("contas_usuario").update(updates).eq("id", contaId).eq("user_id", userId).select("id,nome,tipo,saldo").single();
      if (error) return { error: error.message };
      return { sucesso: true, conta: result };
    }
    case "cadastrar_divida": {
      const { descricao, valor_total, credor, data_vencimento, parcelas } = args as Record<string, unknown>;
      const { data: result, error } = await supabase.from("dividas").insert({ user_id: userId, descricao, valor_total: Number(valor_total), credor: credor || null, data_vencimento: data_vencimento || null, parcelas: parcelas || null, status: "pendente" }).select("id,descricao,valor_total,status").single();
      if (error) return { error: error.message };
      return { sucesso: true, divida: result };
    }
    case "atualizar_divida": {
      const updates: Record<string, unknown> = {};
      if (args.status) updates.status = args.status;
      if (args.valor_pago !== undefined) updates.valor_pago = Number(args.valor_pago);
      const { error } = await supabase.from("dividas").update(updates).eq("id", args.divida_id as string).eq("user_id", userId);
      if (error) return { error: error.message };
      return { sucesso: true };
    }
    case "cadastrar_meta": {
      const { nome, valor_alvo, valor_atual, data_limite, descricao } = args as Record<string, unknown>;
      const { data: result, error } = await supabase.from("metas").insert({ user_id: userId, nome, valor_alvo: Number(valor_alvo), valor_atual: Number(valor_atual || 0), data_limite: data_limite || null, descricao: descricao || null, status: "ativa" }).select("id,nome,valor_alvo,status").single();
      if (error) return { error: error.message };
      return { sucesso: true, meta: result };
    }
    case "atualizar_meta": {
      const { meta_id, ...rest } = args as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      if (rest.valor_atual !== undefined) updates.valor_atual = Number(rest.valor_atual);
      if (rest.status) updates.status = rest.status;
      if (rest.nome) updates.nome = rest.nome;
      if (rest.valor_alvo !== undefined) updates.valor_alvo = Number(rest.valor_alvo);
      if (rest.data_limite) updates.data_limite = rest.data_limite;
      const { error } = await supabase.from("metas").update(updates).eq("id", meta_id as string).eq("user_id", userId);
      if (error) return { error: error.message };
      return { sucesso: true };
    }
    case "analisar_documento": {
      return { acao: "analisar_imagem", tipo: args.tipo_suspeito || "desconhecido", mensagem: "Analisando documento..." };
    }
    case "atualizar_custo_produto_eyemobile": {
      const { produto_id, produto_nome, codigo_barras, novo_custo, quantidade_estoque } = args as Record<string, unknown>;
      let foundProduct: any = null;

      // 1. Buscar por codigo_barras
      if (codigo_barras) {
        const { data } = await supabase.from("eyemobile_produtos").select("*").eq("user_id", userId).eq("codigo_barras", codigo_barras).maybeSingle();
        if (data) foundProduct = data;
      }

      // 2. Buscar por produto_id
      if (!foundProduct && produto_id) {
        const { data } = await supabase.from("eyemobile_produtos").select("*").eq("user_id", userId).eq("produto_id", produto_id).maybeSingle();
        if (data) foundProduct = data;
      }

      // 3. Buscar por nome
      if (!foundProduct && produto_nome) {
        const { data } = await supabase.from("eyemobile_produtos").select("*").eq("user_id", userId).ilike("nome", `%${produto_nome}%`).limit(1).maybeSingle();
        if (data) foundProduct = data;
      }

      if (foundProduct) {
        const { data: updated, error } = await supabase
          .from("eyemobile_produtos")
          .update({
            custo: Number(novo_custo),
            estoque: Number(quantidade_estoque ?? foundProduct.estoque ?? 0),
            updated_at: new Date().toISOString()
          })
          .eq("id", foundProduct.id)
          .select("*")
          .single();
        if (error) return { error: error.message };
        return { sucesso: true, produto: updated };
      }

      // Se não encontrar, retornar erro com sugestão de cadastro
      return {
        error: `Produto "${produto_nome || codigo_barras || 'desconhecido'}" não localizado na tabela de produtos do Eyemobile.`,
        sugerir_cadastro: true,
        dados: { nome: produto_nome || "", codigo_barras: codigo_barras || "", custo: novo_custo, estoque: quantidade_estoque }
      };
    }
    case "cadastrar_despesa_nf": {
      const { descricao, valor, data, categoria_nome, fornecedor, metodo_pagamento, numero_nf } = args as Record<string, unknown>;
      let categoriaId: string | null = null;
      if (categoria_nome) {
        categoriaId = await resolveCategoriaByName(supabase, userId, categoria_nome as string, "despesa");
      }
      const { data: result, error } = await supabase
        .from("despesas")
        .insert({
          user_id: userId,
          descricao: descricao,
          valor: Number(valor),
          data: data,
          categoria_id: categoriaId || null,
          metodo_pagamento: metodo_pagamento || null,
          observacoes: `Nota Fiscal nº ${numero_nf || ""}. Fornecedor: ${fornecedor || ""}.`
        })
        .select("id,descricao,valor,data")
        .single();
      if (error) return { error: error.message };
      return { sucesso: true, despesa: result };
    }
    case "cadastrar_divida_boleto": {
      const { descricao, valor_total, credor, data_vencimento, codigo_barras, linha_digitavel, pix_copia_cola, parcelas, categoria_nome } = args as Record<string, unknown>;
      let categoriaId: string | null = null;
      if (categoria_nome) {
        categoriaId = await resolveCategoriaByName(supabase, userId, categoria_nome as string, "despesa");
      }
      const obsParts = [
        `Boleto.`,
        linha_digitavel ? `Linha digitável: ${linha_digitavel}` : null,
        codigo_barras ? `Código de barras: ${codigo_barras}` : null,
        pix_copia_cola ? `Pix Copia e Cola: ${pix_copia_cola}` : null,
        categoria_nome ? `Categoria sugerida: ${categoria_nome}` : null
      ].filter(Boolean);

      const { data: result, error } = await supabase
        .from("dividas")
        .insert({
          user_id: userId,
          descricao,
          valor_total: Number(valor_total),
          valor_restante: Number(valor_total),
          valor_pago: 0,
          credor: credor || null,
          data_vencimento,
          parcelas: Number(parcelas || 1),
          parcelas_pagas: 0,
          status: "pendente",
          observacoes: obsParts.join(" | "),
          categoria_id: categoriaId || null,
          metodo_pagamento_esperado: "boleto",
          codigo_barras: codigo_barras || null,
          linha_digitavel: linha_digitavel || null,
          pix_copia_cola: pix_copia_cola || null,
        })
        .select("id,descricao,valor_total,status")
        .single();
      if (error) return { error: error.message };
      return { sucesso: true, divida: result };
    }
    case "validar_fechamento_caixa": {
      const { valor_relatado, turno_data } = args as Record<string, unknown>;
      
      // Buscar o workspace default do usuário
      const { data: defaultWs } = await supabase.from("workspaces").select("id").eq("user_id", userId).eq("is_default", true).maybeSingle();
      const wsId = defaultWs?.id || null;

      // Buscar vendas do dia no Eyemobile
      let queryVendas = supabase
        .from("transacoes")
        .select("valor")
        .eq("user_id", userId)
        .eq("tipo", "receita")
        .eq("data", turno_data as string);
      if (wsId) queryVendas = queryVendas.eq("workspace_id", wsId);
      
      const { data: vendas, error: errV } = await queryVendas;
      if (errV) return { error: errV.message };
      const totalVendas = (vendas || []).reduce((sum, v) => sum + Number(v.valor || 0), 0);

      // Buscar saques/transferências Divipay do dia
      let querySaques = supabase
        .from("transacoes")
        .select("valor")
        .eq("user_id", userId)
        .eq("tipo", "despesa")
        .eq("data", turno_data as string)
        .ilike("descricao", "%divipay%");
      if (wsId) querySaques = querySaques.eq("workspace_id", wsId);

      const { data: saques, error: errS } = await querySaques;
      if (errS) return { error: errS.message };
      const totalSaques = (saques || []).reduce((sum, s) => sum + Number(s.valor || 0), 0);

      const esperado = totalVendas - totalSaques;
      const relatado = Number(valor_relatado);
      const diferenca = relatado - esperado;
      
      let status = "exato";
      let msg = `Fechamento exato! O saldo bateu com o esperado de R$ ${esperado.toFixed(2)}.`;

      if (diferenca < -0.01) {
        status = "furo";
        msg = `Atenção: Furo de caixa detectado! Faltam R$ ${Math.abs(diferenca).toFixed(2)} no caixa (Esperado: R$ ${esperado.toFixed(2)}, Relatado: R$ ${relatado.toFixed(2)}).`;
      } else if (diferenca > 0.01) {
        status = "sobra";
        msg = `Aviso: Sobra de caixa detectada! R$ ${diferenca.toFixed(2)} a mais no caixa (Esperado: R$ ${esperado.toFixed(2)}, Relatado: R$ ${relatado.toFixed(2)}).`;
      }

      return {
        sucesso: true,
        dados: {
          total_vendas_pdv: totalVendas,
          total_saques_divipay: totalSaques,
          saldo_esperado: esperado,
          saldo_relatado: relatado,
          diferenca,
          status,
          mensagem: msg
        }
      };
    }
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const jwt = authHeader.replace("Bearer ", "");
  const payload = JSON.parse(atob(jwt.split(".")[1]));
  const userId = payload.sub;
  if (!userId) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  const { data: config } = await supabase.from("ia_configuracoes").select("api_key").eq("user_id", userId).maybeSingle();
  const openaiKey = config?.api_key || Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return new Response(JSON.stringify({ error: "API key não configurada. Configure sua chave OpenAI na aba Configurações." }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  let body: { model: string; messages: unknown[]; max_tokens?: number; temperature?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  const messages = [...body.messages] as Record<string, unknown>[];
  const MAX_ITERATIONS = 8;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: body.model,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: body.max_tokens || 2000,
        temperature: body.temperature ?? 0.4,
        response_format: body.response_format || undefined
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify(data), { status: response.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message) break;

    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    await Promise.all(
      // deno-lint-ignore no-explicit-any
      message.tool_calls.map(async (tc: any) => {
        let toolResult: unknown;
        try {
          const toolArgs = JSON.parse(tc.function.arguments || "{}");
          toolResult = await executeTool(tc.function.name, toolArgs, supabase, userId);
        } catch (e) {
          toolResult = { error: e instanceof Error ? e.message : String(e) };
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) });
      })
    );
  }

  return new Response(JSON.stringify({ error: "Máximo de iterações atingido" }), { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
});
