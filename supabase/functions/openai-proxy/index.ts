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
      description: "Retorna saldo de todas as contas do usuário (corrente, poupança, carteira, etc).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_categorias",
      description: "Lista categorias de transações disponíveis para o usuário.",
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
      description: "Registra nova receita ou despesa. Use consultar_categorias antes para escolher a categoria correta.",
      parameters: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          valor: { type: "number", description: "Valor positivo" },
          tipo: { type: "string", enum: ["receita", "despesa"] },
          data: { type: "string", description: "YYYY-MM-DD" },
          categoria_id: { type: "string" },
          conta_id: { type: "string", description: "ID da conta (opcional)" },
        },
        required: ["descricao", "valor", "tipo", "data"],
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
];

// deno-lint-ignore no-explicit-any
async function executeTool(name: string, args: Record<string, unknown>, supabase: any, userId: string): Promise<unknown> {
  switch (name) {
    case "buscar_transacoes": {
      // deno-lint-ignore no-explicit-any
      let q = supabase.from("transacoes").select("id,descricao,valor,tipo,data,created_at,categorias(nome)").eq("user_id", userId).order("data", { ascending: false }).limit((args.limit as number) || 50);
      if (args.data_inicio) q = q.gte("data", args.data_inicio as string);
      if (args.data_fim) q = q.lte("data", args.data_fim as string);
      if (args.tipo) q = q.eq("tipo", args.tipo as string);
      if (args.categoria_id) q = q.eq("categoria_id", args.categoria_id as string);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return data;
    }
    case "consultar_resumo_mensal": {
      const { ano, mes } = args as { ano: number; mes: number };
      const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
      const { data, error } = await supabase.from("transacoes").select("valor,tipo,categorias(nome)").eq("user_id", userId).gte("data", inicio).lte("data", fim);
      if (error) return { error: error.message };
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
      return { periodo: `${mes}/${ano}`, receitas, despesas, saldo: receitas - despesas, topCategorias };
    }
    case "comparar_periodos": {
      const { ano1, mes1, ano2, mes2 } = args as { ano1: number; mes1: number; ano2: number; mes2: number };
      async function getResumo(ano: number, mes: number) {
        const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
        const { data } = await supabase.from("transacoes").select("valor,tipo").eq("user_id", userId).gte("data", inicio).lte("data", fim);
        // deno-lint-ignore no-explicit-any
        const receitas = (data || []).filter((t: any) => t.tipo === "receita").reduce((s: number, t: any) => s + Number(t.valor), 0);
        // deno-lint-ignore no-explicit-any
        const despesas = (data || []).filter((t: any) => t.tipo === "despesa").reduce((s: number, t: any) => s + Number(t.valor), 0);
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
      const { descricao, valor, tipo, data, categoria_id, conta_id } = args as Record<string, unknown>;
      const { data: result, error } = await supabase.from("transacoes").insert({ user_id: userId, descricao, valor: Number(valor), tipo, data, categoria_id: categoria_id || null, conta_id: conta_id || null }).select("id,descricao,valor,tipo,data").single();
      if (error) return { error: error.message };
      return { sucesso: true, transacao: result };
    }
    case "deletar_transacao": {
      const { error } = await supabase.from("transacoes").delete().eq("id", args.transacao_id as string).eq("user_id", userId);
      if (error) return { error: error.message };
      return { sucesso: true };
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
  const MAX_ITERATIONS = 5;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: body.model, messages, tools: TOOLS, tool_choice: "auto", max_tokens: body.max_tokens || 2000, temperature: body.temperature ?? 0.4 }),
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify(data), { status: response.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message) break;

    messages.push(message);

    // No tool calls → final response
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    // Execute tool calls in parallel
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
