/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createBackendLogger,
  getCorrelationId,
  withCorrelationHeader,
  createErrorResponse,
  OPENAI_ERROR_CODES,
} from "../_shared/observability/index.ts";

const logger = createBackendLogger("openai-proxy");

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function fetchWithTimeout(url: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 45000, ...fetchInit } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchInit, signal: controller.signal }).finally(() => clearTimeout(id));
}

function maskId(id?: string | null): string {
  if (!id) return "NULL";
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

/** Retorna a data atual no fuso horário do Brasil (America/Sao_Paulo) no formato YYYY-MM-DD */
function getHojeBrasil(): string {
  try {
    const now = new Date();
    const spDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const y = spDate.getFullYear();
    const m = String(spDate.getMonth() + 1).padStart(2, "0");
    const d = String(spDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

/** Sanitiza strings para uso seguro em queries com ilike */
function sanitizeIlike(input: string): string {
  return String(input || "").replace(/[%_\\]/g, "\\$&");
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "consultar_metricas_ia",
      description: "Consulta o Painel de Métricas & Custos de IA do Wallet Agent, incluindo total de requisições, tokens processados, custo acumulado em USD e BRL, latência média e últimas ações auditadas. Use SEMPRE que o usuário perguntar sobre métricas de IA, custos de IA, gasto com IA, telemetria ou painel de IA.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_vendas_eyemobile",
      description: "Consulta vendas do PDV Eyemobile para uma data específica via API em tempo real. Retorna total de vendas, quantidade de transações, ticket médio e detalhamento por método de pagamento. Use esta ferramenta quando o usuário perguntar sobre vendas do dia, ontem, semana ou mês, especialmente quando os dados da tabela transacoes podem estar desatualizados.",
      parameters: {
        type: "object",
        properties: {
          data: {
            type: "string",
            description: "Data no formato YYYY-MM-DD para consultar vendas. Ex: 2026-08-17",
          },
          data_inicio: {
            type: "string",
            description: "Data início opcional para períodos (YYYY-MM-DD)",
          },
          data_fim: {
            type: "string",
            description: "Data fim opcional para períodos (YYYY-MM-DD)",
          },
        },
        required: ["data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_saidas_caixa_periodo",
      description: "Consulta TODAS as saídas de dinheiro do período: despesas, pagamentos de pró-labore, salários de funcionários, vales, pagamentos de dívidas, transferências e saques. Use SEMPRE que o usuário perguntar 'quanto paguei', 'quanto gastei', 'quanto saiu de dinheiro', 'despesas de hoje/ontem/mês' ou 'pró-labore'.",
      parameters: {
        type: "object",
        properties: {
          data_inicio: {
            type: "string",
            description: "Data de início no formato YYYY-MM-DD (ex: 2026-08-18 para hoje).",
          },
          data_fim: {
            type: "string",
            description: "Data de fim no formato YYYY-MM-DD.",
          },
        },
        required: ["data_inicio", "data_fim"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_despesas_periodo",
      description: "Consulta despesas e todas as saídas de caixa do usuário para um dia ou período específico. Retorna total pago, quantidade de transações, agrupamento por método e lista das saídas (despesas, pró-labore, salários).",
      parameters: {
        type: "object",
        properties: {
          data_inicio: {
            type: "string",
            description: "Data de início no formato YYYY-MM-DD.",
          },
          data_fim: {
            type: "string",
            description: "Data de fim no formato YYYY-MM-DD.",
          },
        },
        required: ["data_inicio", "data_fim"],
      },
    },
  },
  { type: "function", function: { name: "buscar_transacoes", description: "Busca transações, despesas e pagamentos do usuário com filtros por termo de busca (nome de pessoa, colaborador como 'Shuellen' ou 'Heitor', fornecedor ou texto da descrição), período, tipo e categoria.", parameters: { type: "object", properties: { busca: { type: "string", description: "Termo de busca na descrição ou nome de pessoa/colaborador/fornecedor (ex: 'Shuellen', 'Aluguel', 'Passagem')" }, data_inicio: { type: "string", description: "Data início no formato YYYY-MM-DD" }, data_fim: { type: "string", description: "Data fim no formato YYYY-MM-DD" }, tipo: { type: "string", enum: ["receita", "despesa"], description: "Tipo da transação" }, categoria_id: { type: "string", description: "ID da categoria para filtrar" }, categoria_nome: { type: "string", description: "Nome da categoria para filtrar" }, limit: { type: "number", description: "Limite de resultados (padrão 50)" } } } } },
  { type: "function", function: { name: "consultar_resumo_mensal", description: "Retorna resumo financeiro de um mês específico: total receitas, despesas, saldo e top categorias.", parameters: { type: "object", properties: { ano: { type: "number", description: "Ano (ex: 2025)" }, mes: { type: "number", description: "Mês 1-12" } }, required: ["ano", "mes"] } } },
  { type: "function", function: { name: "comparar_periodos", description: "Compara dois meses mostrando variação percentual de receitas, despesas e saldo.", parameters: { type: "object", properties: { ano1: { type: "number" }, mes1: { type: "number" }, ano2: { type: "number" }, mes2: { type: "number" } }, required: ["ano1", "mes1", "ano2", "mes2"] } } },
  { type: "function", function: { name: "consultar_saldos", description: "Lista todas as contas do usuário com ID, nome, tipo e saldo. Use para descobrir o ID de uma conta pelo nome.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "consultar_categorias", description: "Lista categorias de transações com ID e nome. Use para descobrir o ID de uma categoria pelo nome.", parameters: { type: "object", properties: { tipo: { type: "string", enum: ["receita", "despesa"], description: "Filtrar por tipo" } } } } },
  { type: "function", function: { name: "buscar_categorias", description: "Busca categorias de despesa ou dívida existentes por termo ou nome do credor/beneficiário.", parameters: { type: "object", properties: { busca: { type: "string", description: "Termo de busca (ex: 'Xodó', 'Alimentação')" }, tipo: { type: "string", enum: ["despesa", "receita"] } }, required: ["busca"] } } },
  { type: "function", function: { name: "consultar_transacoes_recorrentes", description: "Lista gastos e receitas fixos mensais (assinaturas, aluguel, salário).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "projetar_gastos", description: "Projeta receitas e despesas dos próximos N meses com base nas recorrências cadastradas.", parameters: { type: "object", properties: { meses: { type: "number", description: "Número de meses para projetar (1-12)" } }, required: ["meses"] } } },
  { type: "function", function: { name: "consultar_dividas", description: "Lista dívidas do usuário com status, vencimentos e valores pendentes.", parameters: { type: "object", properties: { status: { type: "string", enum: ["pendente", "vencida", "quitada"], description: "Filtrar por status" } } } } },
  { type: "function", function: { name: "consultar_metas", description: "Lista metas financeiras do usuário com progresso, valor alvo e prazo.", parameters: { type: "object", properties: { status: { type: "string", enum: ["ativa", "concluida", "pausada", "vencida"] } } } } },
  { type: "function", function: { name: "consultar_veiculos", description: "Lista veículos do usuário com manutenções pendentes ou atrasadas.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "consultar_orcamentos", description: "Lista orçamentos de compras/mercado com itens pendentes.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "cadastrar_transacao", description: "Registra nova receita ou despesa. Aceita nomes de conta e categoria (resolve automaticamente para IDs). SEMPRE forneça categoria_nome e conta_nome quando o usuário mencionar.", parameters: { type: "object", properties: { descricao: { type: "string" }, valor: { type: "number", description: "Valor positivo" }, tipo: { type: "string", enum: ["receita", "despesa"] }, data: { type: "string", description: "YYYY-MM-DD" }, categoria_id: { type: "string", description: "UUID da categoria (use se já tiver o ID)" }, categoria_nome: { type: "string", description: "Nome da categoria (ex: 'Vendas', 'Alimentação'). Resolvido automaticamente para ID." }, conta_id: { type: "string", description: "UUID da conta (use se já tiver o ID)" }, conta_nome: { type: "string", description: "Nome da conta (ex: 'PagSeguro', 'Sicoob', 'Nubank'). Resolvido automaticamente para ID." }, metodo_pagamento: { type: "string", description: "Método: pix, cartao, dinheiro, boleto, transferencia, voucher" }, observacoes: { type: "string", description: "Observações adicionais" } }, required: ["descricao", "valor", "tipo", "data"] } } },
  { type: "function", function: { name: "atualizar_transacao", description: "Atualiza uma transação existente (receita ou despesa). Aceita nomes de conta e categoria.", parameters: { type: "object", properties: { transacao_id: { type: "string", description: "ID da transação" }, descricao: { type: "string" }, valor: { type: "number" }, data: { type: "string", description: "YYYY-MM-DD" }, categoria_id: { type: "string" }, categoria_nome: { type: "string", description: "Nome da categoria (resolvido automaticamente)" }, conta_id: { type: "string" }, conta_nome: { type: "string", description: "Nome da conta (resolvido automaticamente)" }, metodo_pagamento: { type: "string" }, observacoes: { type: "string" } }, required: ["transacao_id"] } } },
  { type: "function", function: { name: "deletar_transacao", description: "Remove transação cadastrada incorretamente. Requer confirmação explícita do usuário.", parameters: { type: "object", properties: { transacao_id: { type: "string" } }, required: ["transacao_id"] } } },
  { type: "function", function: { name: "criar_conta", description: "Cria uma nova conta financeira para o usuário.", parameters: { type: "object", properties: { nome: { type: "string", description: "Nome da conta (ex: 'PagSeguro', 'Nubank')" }, tipo: { type: "string", enum: ["conta_corrente", "poupanca", "carteira", "investimento", "cartao_credito", "outro"], description: "Tipo da conta" }, saldo: { type: "number", description: "Saldo inicial (padrão 0)" } }, required: ["nome", "tipo"] } } },
  { type: "function", function: { name: "atualizar_conta", description: "Atualiza dados de uma conta existente. Aceita nome da conta para resolver o ID.", parameters: { type: "object", properties: { conta_id: { type: "string", description: "UUID da conta (use se já tiver)" }, conta_nome: { type: "string", description: "Nome da conta para localizar (alternativa ao ID)" }, nome: { type: "string", description: "Novo nome" }, saldo: { type: "number", description: "Novo saldo" } }, required: [] } } },
  { type: "function", function: { name: "cadastrar_divida", description: "Registra nova dívida ou financiamento. Aceita categoria_id ou categoria_nome para associação automática.", parameters: { type: "object", properties: { descricao: { type: "string" }, valor_total: { type: "number" }, credor: { type: "string" }, data_vencimento: { type: "string", description: "YYYY-MM-DD" }, parcelas: { type: "number" }, categoria_id: { type: "string" }, categoria_nome: { type: "string" } }, required: ["descricao", "valor_total"] } } },
  { type: "function", function: { name: "atualizar_divida", description: "Atualiza status de dívida (ex: marcar como paga, registrar pagamento parcial).", parameters: { type: "object", properties: { divida_id: { type: "string" }, status: { type: "string", enum: ["pendente", "vencida", "quitada"] }, valor_pago: { type: "number" } }, required: ["divida_id"] } } },
  { type: "function", function: { name: "cadastrar_meta", description: "Cria nova meta financeira com valor alvo e prazo.", parameters: { type: "object", properties: { nome: { type: "string" }, valor_alvo: { type: "number" }, valor_atual: { type: "number", description: "Valor já acumulado (padrão 0)" }, data_limite: { type: "string", description: "YYYY-MM-DD" }, descricao: { type: "string" } }, required: ["nome", "valor_alvo"] } } },
  { type: "function", function: { name: "atualizar_meta", description: "Atualiza progresso ou dados de uma meta existente.", parameters: { type: "object", properties: { meta_id: { type: "string" }, valor_atual: { type: "number" }, status: { type: "string", enum: ["ativa", "concluida", "pausada"] }, nome: { type: "string" }, valor_alvo: { type: "number" }, data_limite: { type: "string" } }, required: ["meta_id"] } } },
  { type: "function", function: { name: "atualizar_custo_produto_eyemobile", description: "Atualiza o custo de um produto no Eyemobile PDV e adiciona quantidade ao estoque. Use após analisar uma NF de compra.", parameters: { type: "object", properties: { produto_id: { type: "string" }, produto_nome: { type: "string" }, codigo_barras: { type: "string" }, novo_custo: { type: "number" }, quantidade_estoque: { type: "number" } }, required: ["novo_custo"] } } },
  { type: "function", function: { name: "cadastrar_despesa_nf", description: "Cadastra uma despesa no sistema a partir dos dados de uma Nota Fiscal de compra.", parameters: { type: "object", properties: { descricao: { type: "string" }, valor: { type: "number" }, data: { type: "string" }, categoria_nome: { type: "string" }, fornecedor: { type: "string" }, metodo_pagamento: { type: "string", enum: ["pix", "boleto", "cartao_credito", "cartao_debito", "dinheiro", "outros"] }, numero_nf: { type: "string" } }, required: ["descricao", "valor", "data"] } } },
  { type: "function", function: { name: "cadastrar_divida_boleto", description: "Cadastra uma nova dívida no sistema a partir dos dados de um boleto analisado.", parameters: { type: "object", properties: { descricao: { type: "string" }, valor_total: { type: "number" }, credor: { type: "string" }, data_vencimento: { type: "string" }, codigo_barras: { type: "string" }, linha_digitavel: { type: "string" }, pix_copia_cola: { type: "string" }, parcelas: { type: "number" }, categoria_id: { type: "string" }, categoria_nome: { type: "string" } }, required: ["descricao", "valor_total", "data_vencimento"] } } },
  { type: "function", function: { name: "cadastrar_boleto", description: "Cadastra um boleto como dívida pendente no sistema. Recebe: valor, vencimento (YYYY-MM-DD), beneficiario (ou credor), descricao (opcional), categoria_id (opcional), categoria_nome (opcional), linha_digitavel (opcional), codigo_barras (opcional).", parameters: { type: "object", properties: { valor: { type: "number", description: "Valor do boleto em reais" }, vencimento: { type: "string", description: "Data de vencimento YYYY-MM-DD" }, beneficiario: { type: "string", description: "Nome do beneficiário ou credor" }, descricao: { type: "string", description: "Descrição do boleto/dívida" }, categoria_id: { type: "string" }, categoria_nome: { type: "string" }, linha_digitavel: { type: "string", description: "Linha digitável do boleto (opcional)" }, codigo_barras: { type: "string", description: "Código de barras do boleto (opcional)" } }, required: ["valor", "vencimento", "beneficiario"] } } },
  { type: "function", function: { name: "validar_fechamento_caixa", description: "Analisa o valor relatado pelo funcionário no fechamento de turno e cruza com as vendas registradas no Eyemobile PDV e transferências para encontrar furos de caixa.", parameters: { type: "object", properties: { valor_relatado: { type: "number" }, turno_data: { type: "string", description: "Data do turno a validar (YYYY-MM-DD)" } }, required: ["valor_relatado", "turno_data"] } } },
];

async function resolveContaByName(supabase: any, userId: string, nome: string): Promise<string | null> {
  const { data } = await supabase.from("contas_usuario").select("id,nome").eq("user_id", userId);
  if (!data || data.length === 0) return null;
  const lower = nome.toLowerCase().trim();
  const exact = data.find((c: any) => c.nome.toLowerCase() === lower);
  if (exact) return exact.id;
  const partial = data.find((c: any) => c.nome.toLowerCase().includes(lower) || lower.includes(c.nome.toLowerCase()));
  if (partial) return partial.id;
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  const normalizedInput = normalize(nome);
  const normalized = data.find((c: any) => normalize(c.nome) === normalizedInput || normalize(c.nome).includes(normalizedInput) || normalizedInput.includes(normalize(c.nome)));
  return normalized?.id || null;
}

async function resolveCategoriaByName(supabase: any, userId: string, nome: string, tipo?: string): Promise<string | null> {
  let q = supabase.from("categorias").select("id,nome,tipo").eq("user_id", userId);
  if (tipo) q = q.eq("tipo", tipo);
  const { data } = await q;
  if (!data || data.length === 0) return null;
  const lower = nome.toLowerCase().trim();
  const exact = data.find((c: any) => c.nome.toLowerCase() === lower);
  if (exact) return exact.id;
  const partial = data.find((c: any) => c.nome.toLowerCase().includes(lower) || lower.includes(c.nome.toLowerCase()));
  if (partial) return partial.id;
  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  const normalizedInput = normalize(nome);
  const normalized = data.find((c: any) => normalize(c.nome) === normalizedInput || normalize(c.nome).includes(normalizedInput) || normalizedInput.includes(normalize(c.nome)));
  return normalized?.id || null;
}

async function resolveCategoriaByCredor(supabase: any, userId: string, credorOrDesc: string): Promise<{ id: string; nome: string } | null> {
  const { data } = await supabase.from("categorias").select("id,nome,tipo").eq("user_id", userId);
  if (!data || data.length === 0) return null;

  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, " ").trim();
  const inputNorm = normalize(credorOrDesc);

  // 1. Match exato
  const exact = data.find((c: any) => normalize(c.nome) === inputNorm);
  if (exact) return { id: exact.id, nome: exact.nome };

  // 2. Inclusão completa
  const fullInc = data.find((c: any) => {
    const catNorm = normalize(c.nome);
    return catNorm.length >= 3 && (inputNorm.includes(catNorm) || catNorm.includes(inputNorm));
  });
  if (fullInc) return { id: fullInc.id, nome: fullInc.nome };

  // 3. Match por palavras-chave do beneficiário
  const ignoreWords = new Set(["e", "de", "do", "da", "em", "para", "com", "ltda", "me", "epp", "sa", "s/a", "eireli", "comercio", "distribuicao", "distribuidora", "servicos", "pagamentos", "brasil", "alimentos", "foods", "industria", "cia"]);
  const inputTokens = inputNorm.split(/\s+/).filter((t: string) => t.length >= 3 && !ignoreWords.has(t));

  for (const token of inputTokens) {
    const match = data.find((c: any) => {
      const catNorm = normalize(c.nome);
      return catNorm === token || catNorm.includes(token) || token.includes(catNorm);
    });
    if (match) return { id: match.id, nome: match.nome };
  }

  return null;
}

interface TransacaoRow { id: string; descricao: string; valor: number; tipo: string; data: string; created_at: string; categoria_id?: string | null; categorias?: { nome: string } | null; metodo_pagamento?: string | null; observacoes?: string | null; conta_id?: string | null; origem: "transacoes" | "receitas" | "despesas"; }

async function fetchAllTransacoes(supabase: any, userId: string, opts?: { dataInicio?: string; dataFim?: string; tipo?: string; categoriaId?: string; limit?: number; select?: string }): Promise<TransacaoRow[]> {
  const sel = opts?.select || "id,descricao,valor,tipo,data,created_at,categoria_id,metodo_pagamento,observacoes,conta_id";
  const selNonTipo = sel.replace(",tipo", "");

  const fetchTableAll = async (table: string, hasTipo: boolean) => {
    const allData: any[] = [];
    let from = 0;
    const step = 1000;
    const maxRows = opts?.limit || 10000;

    while (true) {
      let q = supabase.from(table).select(hasTipo ? sel : selNonTipo).eq("user_id", userId);
      if (opts?.dataInicio) q = q.gte("data", opts.dataInicio);
      if (opts?.dataFim) q = q.lte("data", opts.dataFim);
      if (hasTipo && opts?.tipo) q = q.eq("tipo", opts.tipo);
      if (opts?.categoriaId) q = q.eq("categoria_id", opts.categoriaId);

      const { data, error } = await q.range(from, from + step - 1);
      if (error || !data || data.length === 0) break;
      allData.push(...data);
      if (data.length < step || allData.length >= maxRows) break;
      from += step;
    }
    return { data: allData };
  };

  const skipReceitas = opts?.tipo === "despesa";
  const skipDespesas = opts?.tipo === "receita";
  const promises = [
    fetchTableAll("transacoes", true),
    skipReceitas ? Promise.resolve({ data: [] }) : fetchTableAll("receitas", false),
    skipDespesas ? Promise.resolve({ data: [] }) : fetchTableAll("despesas", false)
  ];
  const [resT, resR, resD] = await Promise.all(promises);
  const transacoes = (resT.data || []).map((t: any) => ({ ...t, origem: "transacoes" }));
  const receitas = (resR.data || []).map((r: any) => ({ ...r, tipo: "receita", origem: "receitas" }));
  const despesas = (resD.data || []).map((d: any) => ({ ...d, tipo: "despesa", origem: "despesas" }));
  const merged = [...transacoes, ...receitas, ...despesas];
  merged.sort((a: TransacaoRow, b: TransacaoRow) => (b.data || "").localeCompare(a.data || ""));
  if (opts?.limit) return merged.slice(0, opts.limit);
  return merged;
}

/** Consulta vendas do PDV Eyemobile via Edge Function eyemobile-sync em tempo real */
/** Converte timestamp ISO para data local America/Sao_Paulo (yyyy-MM-dd) */
function toSaoPauloDate(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    const spDate = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const y = spDate.getFullYear();
    const m = String(spDate.getMonth() + 1).padStart(2, "0");
    const d = String(spDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return String(isoTimestamp || "").split("T")[0];
  }
}

/** Consulta vendas do PDV Eyemobile via Edge Function / API e banco de dados */
async function consultarVendasEyemobile(
  supabase: any,
  userId: string,
  dataStr: string,
  dataFimStr?: string
): Promise<Record<string, unknown>> {
  const startDate = dataStr || getHojeBrasil();
  const endDate = dataFimStr || startDate;

  logger.info("Iniciando consulta de vendas Eyemobile", {
    operation: "consultarVendasEyemobile",
    userId: maskId(userId),
    metadata: { startDate, endDate },
  });

  try {
    // 1. Busca primeiro as transações registradas no banco para o período (já convertidas em horário de Brasília)
    const { data: dbTxs, error: dbErr } = await supabase
      .from("transacoes")
      .select("valor, data, metodo_pagamento, descricao, created_at, observacoes")
      .eq("user_id", userId)
      .eq("tipo", "receita")
      .gte("data", startDate)
      .lte("data", endDate);

    if (dbErr) {
      logger.error("Erro ao consultar transações locais", {
        operation: "consultarVendasEyemobile",
        metadata: { error: dbErr.message },
      });
    }

    const localTxs = dbTxs || [];

    // 2. Busca configuração do Eyemobile para tentar atualizar via API em tempo real
    const { data: config } = await supabase
      .from("eyemobile_config")
      .select("access_key, secret_key, environment, store_id, last_synced_offset")
      .eq("user_id", userId)
      .maybeSingle();

    let apiSales: any[] = [];
    if (config?.access_key && config?.secret_key) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const syncUrl = `${supabaseUrl}/functions/v1/eyemobile-sync`;

      try {
        const response = await fetchWithTimeout(syncUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            access_key: config.access_key,
            secret_key: config.secret_key,
            environment: config.environment || "production",
            store_id: config.store_id,
            mode: "DASHBOARD",
            start_date: startDate,
            end_date: endDate,
          }),
          timeout: 20000,
        });

        if (response.ok) {
          const result = await response.json();
          const rawList = result.transactions || result.sales || [];
          // Filtra rigorosamente pelo fuso horário de Brasília para não misturar dias
          apiSales = rawList.filter((s: any) => {
            if (s.completed === false || s.cancelled) return false;
            const saleDate = toSaoPauloDate(s.time || s.created_at || "");
            return saleDate >= startDate && saleDate <= endDate;
          });
        } else {
          logger.warn("eyemobile-sync respondeu com status não-ok", {
            operation: "consultarVendasEyemobile",
            metadata: { status: response.status },
          });
        }
      } catch (syncErr: any) {
        logger.warn("Falha ao invocar eyemobile-sync", {
          operation: "consultarVendasEyemobile",
          metadata: { error: syncErr.message },
        });
      }
    }

    const dataFormatada = startDate === endDate 
      ? startDate.split("-").reverse().join("/") 
      : `${startDate.split("-").reverse().join("/")} a ${endDate.split("-").reverse().join("/")}`;

    // Escolhe o conjunto de dados mais completo (API em tempo real ou banco local sincronizado)
    const activeSales = (apiSales.length >= localTxs.length && apiSales.length > 0) ? apiSales : localTxs;
    const isFromApi = (activeSales === apiSales && apiSales.length > 0);

    if (activeSales.length > 0) {
      const totalVendas = activeSales.reduce((sum: number, t: any) => sum + Number(t.amount || t.value || t.total || t.price || t.valor || 0), 0);
      const qtdTransacoes = activeSales.length;
      const ticketMedio = qtdTransacoes > 0 ? totalVendas / qtdTransacoes : 0;

      const metodos: Record<string, number> = {};
      for (const t of activeSales) {
        const metodo = t.payment_method || t.metodo_pagamento || t.transaction_pays?.[0]?.pay_type_name || t.payment_type || "outros";
        const val = Number(t.amount || t.value || t.total || t.price || t.valor || 0);
        metodos[metodo] = (metodos[metodo] || 0) + val;
      }

      const resultado = {
        data_consultada: startDate === endDate ? startDate : `${startDate} a ${endDate}`,
        data_formatada: dataFormatada,
        origem: isFromApi ? "eyemobile_api_realtime" : "banco_local",
        total_vendas: totalVendas,
        quantidade_transacoes: qtdTransacoes,
        ticket_medio: ticketMedio,
        metodos_pagamento: metodos,
        vendas_por_metodo: metodos,
        observacao: `Vendas do PDV Eyemobile em ${dataFormatada}: Total de R$ ${totalVendas.toFixed(2)} em ${qtdTransacoes} transações. Ticket médio: R$ ${ticketMedio.toFixed(2)}.`,
      };
      return resultado;
    }

    // Se realmente não há vendas
    const resultado = {
      data: startDate === endDate ? startDate : `${startDate} a ${endDate}`,
      total_vendas: 0,
      quantidade_transacoes: 0,
      ticket_medio: 0,
      metodos_pagamento: {},
      vendas_por_metodo: {},
      observacao: "Nenhuma venda encontrada para esta data ou período no PDV Eyemobile.",
    };
    return resultado;
  } catch (err: any) {
    logger.error("Exceção ao consultar vendas Eyemobile", {
      operation: "consultarVendasEyemobile",
      metadata: { error: err.message },
    });
    return {
      erro: "Erro interno ao consultar vendas do Eyemobile.",
      detalhe: err.message,
    };
  }
}

/** Consulta TODAS as saídas de dinheiro do período: despesas, pró-labore, salários de equipe, pagamentos de dívidas e transferências */
async function consultarSaidasCaixaPeriodo(
  supabase: any,
  userId: string,
  dataInicio: string,
  dataFim?: string
): Promise<Record<string, unknown>> {
  const startDate = dataInicio || getHojeBrasil();
  const endDate = dataFim || startDate;

  logger.info("Iniciando consulta de saídas de caixa", {
    operation: "consultarSaidasCaixaPeriodo",
    userId: maskId(userId),
    metadata: { startDate, endDate },
  });

  try {
    // 1. Categorias e Colaboradores para mapear nomes
    const [{ data: categorias }, { data: colaboradores }] = await Promise.all([
      supabase.from("categorias").select("id,nome").eq("user_id", userId),
      supabase.from("colaboradores").select("id,nome"),
    ]);

    const catMap = new Map<string, string>();
    (categorias || []).forEach((c: any) => catMap.set(c.id, c.nome));

    const colabMap = new Map<string, string>();
    (colaboradores || []).forEach((c: any) => colabMap.set(c.id, c.nome));
    const colabIds = Array.from(colabMap.keys());

    // 2. Busca paralela nas 4 fontes de saídas no banco e DiviPay API
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const [despRes, txRes, custosRes, pagDividasRes, diviResp] = await Promise.all([
      supabase
        .from("despesas")
        .select("id,descricao,valor,data,metodo_pagamento,categoria_id,created_at")
        .eq("user_id", userId)
        .gte("data", startDate)
        .lte("data", endDate),
      supabase
        .from("transacoes")
        .select("id,descricao,valor,data,metodo_pagamento,categoria_id,tipo,created_at")
        .eq("user_id", userId)
        .eq("tipo", "despesa")
        .gte("data", startDate)
        .lte("data", endDate),
      colabIds.length > 0
        ? supabase
            .from("colaborador_custos")
            .select("id,colaborador_id,tipo,valor,data,descricao,lancado_na_despesa")
            .in("colaborador_id", colabIds)
            .gte("data", startDate)
            .lte("data", endDate)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("pagamentos_dividas")
        .select("id,divida_id,valor,data_pagamento,metodo_pagamento,observacoes,created_at,dividas(descricao,credor)")
        .eq("user_id", userId)
        .gte("data_pagamento", startDate)
        .lte("data_pagamento", endDate),
      fetchWithTimeout(`${supabaseUrl}/functions/v1/divipay-api`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "listWithdraws",
          user_id: userId,
          limit: 100,
          offset: 0,
        }),
        timeout: 15000,
      }).then(r => r.ok ? r.json() : { data: [] }).catch(err => {
        logger.warn("Erro ao consultar DiviPay API", {
          operation: "consultarSaidasCaixaPeriodo",
          metadata: { error: err.message },
        });
        return { data: [] };
      }),
    ]);

    const itens: any[] = [];
    const chavesUnicas = new Set<string>();

    // Processa Despesas tradicionais
    for (const d of despRes.data || []) {
      const val = Number(d.valor || 0);
      const chave = `${d.data}_${val}_${(d.descricao || "").trim().toLowerCase()}`;
      chavesUnicas.add(chave);
      itens.push({
        tipo_saida: "Despesa",
        descricao: d.descricao || "Sem descrição",
        valor: val,
        categoria: d.categoria_id ? (catMap.get(d.categoria_id) || "Despesas") : "Despesas",
        metodo_pagamento: d.metodo_pagamento || "Outros",
        data: d.data,
      });
    }

    // Processa Transações de Despesa
    for (const t of txRes.data || []) {
      const val = Number(t.valor || 0);
      const chave = `${t.data}_${val}_${(t.descricao || "").trim().toLowerCase()}`;
      if (!chavesUnicas.has(chave)) {
        chavesUnicas.add(chave);
        itens.push({
          tipo_saida: "Despesa",
          descricao: t.descricao || "Sem descrição",
          valor: val,
          categoria: t.categoria_id ? (catMap.get(t.categoria_id) || "Transações") : "Transações",
          metodo_pagamento: t.metodo_pagamento || "Outros",
          data: t.data,
        });
      }
    }

    // Processa Saídas / Saques da DiviPay em tempo real
    const rawDivi = diviResp?.data || [];
    const divipayList = Array.isArray(rawDivi) ? rawDivi : (rawDivi.items || []);
    for (const w of divipayList) {
      const status = String(w.status || "").toUpperCase();
      if (status && ["PENDING", "FAILED", "ERROR", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(status)) {
        continue;
      }
      const val = Number(w.amount || w.valor || 0);
      const dataStr = toSaoPauloDate(w.createdAt || w.created_at || w.date || "");
      if (dataStr < startDate || dataStr > endDate) {
        continue;
      }
      const isBoleto = w.type === "BILLET" || String(w.description || "").toLowerCase().includes("boleto");
      const desc = w.description || (isBoleto ? "Pagamento de boleto" : "Saque Pix");
      const fav = w.name || "";
      const descFinal = (fav && !desc.includes(fav)) ? `${desc} - ${fav}` : desc;
      const isProLabore = descFinal.toLowerCase().includes("heitor") || descFinal.toLowerCase().includes("pro-labore") || descFinal.toLowerCase().includes("pró-labore");
      const tipoSaida = isProLabore ? "Pró-labore" : (isBoleto ? "Pagamento de Boleto" : "Transferência / Saque Divipay");

      const chave = `${dataStr}_${val}_${descFinal.toLowerCase()}`;
      if (!chavesUnicas.has(chave)) {
        chavesUnicas.add(chave);
        itens.push({
          tipo_saida: tipoSaida,
          descricao: descFinal,
          valor: val,
          categoria: isProLabore ? "Equipe / Sócios" : "Transferências e Saques Divipay",
          metodo_pagamento: isBoleto ? "Boleto" : "Pix",
          data: dataStr,
        });
      }
    }

    // Processa Custos de Colaborador (Pró-labore de sócio, Salários, Vales)
    for (const c of custosRes.data || []) {
      const val = Number(c.valor || 0);
      const nomeColab = colabMap.get(c.colaborador_id) || "Colaborador";
      const isProLabore = (c.tipo || "").toLowerCase().includes("pro") || (c.descricao || "").toLowerCase().includes("pro");
      const tipoFormatado = isProLabore ? "Pró-labore" : "Pagamento de Equipe";
      const descCompleta = c.descricao ? `${c.descricao} (${nomeColab})` : `${tipoFormatado} — ${nomeColab}`;
      const chave = `${c.data}_${val}_${descCompleta.toLowerCase()}`;
      if (!chavesUnicas.has(chave) && !c.lancado_na_despesa) {
        chavesUnicas.add(chave);
        itens.push({
          tipo_saida: tipoFormatado,
          descricao: descCompleta,
          valor: val,
          categoria: "Equipe / Sócios",
          metodo_pagamento: "Pix / Transferência",
          data: c.data,
        });
      }
    }

    // Processa Pagamentos de Dívidas e Boletos
    for (const pd of pagDividasRes.data || []) {
      const val = Number(pd.valor || 0);
      const descDivida = (pd as any).dividas?.descricao || "Pagamento de Dívida";
      const credor = (pd as any).dividas?.credor ? ` (${(pd as any).dividas.credor})` : "";
      const descCompleta = `${descDivida}${credor}`;
      const chave = `${pd.data_pagamento}_${val}_${descCompleta.toLowerCase()}`;
      if (!chavesUnicas.has(chave)) {
        chavesUnicas.add(chave);
        itens.push({
          tipo_saida: "Pagamento de Dívida",
          descricao: descCompleta,
          valor: val,
          categoria: "Dívidas e Boletos",
          metodo_pagamento: pd.metodo_pagamento || "Pix / Boleto",
          data: pd.data_pagamento,
        });
      }
    }

    itens.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

    const totalSaidas = itens.reduce((sum, item) => sum + item.valor, 0);
    const qtd = itens.length;
    const ticketMedio = qtd > 0 ? totalSaidas / qtd : 0;

    const porTipo: Record<string, number> = {};
    const porMetodo: Record<string, number> = {};
    for (const item of itens) {
      porTipo[item.tipo_saida] = (porTipo[item.tipo_saida] || 0) + item.valor;
      porMetodo[item.metodo_pagamento] = (porMetodo[item.metodo_pagamento] || 0) + item.valor;
    }

    const dataFormatada = startDate === endDate 
      ? startDate.split("-").reverse().join("/") 
      : `${startDate.split("-").reverse().join("/")} a ${endDate.split("-").reverse().join("/")}`;

    const resultado = {
      periodo: dataFormatada,
      data_inicio: startDate,
      data_fim: endDate,
      total_saidas: totalSaidas,
      total_despesas: totalSaidas,
      quantidade_transacoes: qtd,
      ticket_medio: ticketMedio,
      saidas_por_tipo: porTipo,
      despesas_por_metodo: porMetodo,
      transacoes: itens.slice(0, 30),
      observacao: `Total de saídas de caixa em ${dataFormatada}: R$ ${totalSaidas.toFixed(2)} em ${qtd} lançamentos.`
    };

    return resultado;
  } catch (err: any) {
    logger.error("Exceção ao consultar saídas de caixa", {
      operation: "consultarSaidasCaixaPeriodo",
      metadata: { error: err.message },
    });
    return {
      erro: "Erro ao consultar saídas de caixa do período.",
      detalhe: err.message
    };
  }
}

async function executeTool(name: string, args: Record<string, unknown>, supabase: any, userId: string): Promise<unknown> {
  switch (name) {
    case "consultar_metricas_ia": {
      const { data: events } = await supabase
        .from("wallet_ai_audit_events")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      const evts = events || [];
      const totalCalls = evts.length;
      const successfulCalls = evts.filter((e: any) => e.execution_status === "success").length;
      const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 100;
      const totalTokens = evts.reduce((acc: number, e: any) => acc + (Number(e.tokens_total) || 500), 0);
      const estimatedCostUsd = (totalTokens / 1_000_000) * 0.15;
      const estimatedCostBrl = estimatedCostUsd * 5.65;
      const avgDuration = totalCalls > 0
        ? Math.round(evts.reduce((acc: number, e: any) => acc + (Number(e.duration_ms) || 0), 0) / totalCalls)
        : 0;

      return {
        painel: "Painel de Métricas & Custos de IA",
        total_requisicoes: totalCalls,
        taxa_sucesso: `${successRate.toFixed(1)}%`,
        tokens_processados: totalTokens,
        custo_acumulado_usd: `$${estimatedCostUsd.toFixed(4)}`,
        custo_acumulado_brl: `R$ ${estimatedCostBrl.toFixed(2)}`,
        tempo_medio_resposta_ms: avgDuration,
        ultimas_acoes_auditadas: evts.slice(0, 5).map((e: any) => ({
          data_hora: e.created_at,
          ferramenta: e.tool_name,
          duracao_ms: e.duration_ms,
          status: e.execution_status
        }))
      };
    }
    case "consultar_vendas_eyemobile": {
      const targetStart = (args.data_inicio as string) || (args.data as string) || getHojeBrasil();
      const targetEnd = (args.data_fim as string) || (args.data as string) || targetStart;
      return await consultarVendasEyemobile(supabase, userId, targetStart, targetEnd);
    }
    case "consultar_saidas_caixa_periodo":
    case "consultar_despesas_periodo": {
      const targetStart = (args.data_inicio as string) || (args.data as string) || getHojeBrasil();
      const targetEnd = (args.data_fim as string) || (args.data as string) || targetStart;
      return await consultarSaidasCaixaPeriodo(supabase, userId, targetStart, targetEnd);
    }
    case "buscar_transacoes": {
      const termoBusca = (args.busca as string) || (args.termo as string) || "";
      let categoriaId = args.categoria_id as string | undefined;

      if (!categoriaId && args.categoria_nome) {
        categoriaId = await resolveCategoriaByName(supabase, userId, args.categoria_nome as string) || undefined;
      }

      // Se passou categoria_nome que não existe como categoria, trata como busca textual (ex: "Shuellen")
      const effectiveSearch = termoBusca || (!categoriaId && args.categoria_nome ? String(args.categoria_nome) : "");

      if (effectiveSearch) {
        const termClean = effectiveSearch.trim();
        const termNorm = termClean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Gera variantes fonéticas comuns (ex: Shuellen <-> Suellen <-> Suelen)
        const variantes: string[] = [termClean, termNorm];
        if (termNorm.startsWith("sh")) {
          variantes.push(termNorm.replace(/^sh/, "s"));
          variantes.push(termNorm.replace(/^sh/, "su"));
        } else if (termNorm.startsWith("s")) {
          variantes.push(termNorm.replace(/^s/, "sh"));
        }
        if (termNorm.includes("ll")) {
          variantes.push(termNorm.replace(/ll/g, "l"));
        } else if (termNorm.includes("l")) {
          variantes.push(termNorm.replace(/l/g, "ll"));
        }

        // 1. Busca colaboradores (nome, pix_chave, telefone, cpf)
        const { data: colabs } = await supabase
          .from("colaboradores")
          .select("id, nome, pix_chave, telefone, cpf");

        const digitsOnly = (s: string) => (s || "").replace(/\D/g, "");
        const inputDigits = digitsOnly(termClean);

        const colabsMatched = (colabs || []).filter((c: any) => {
          const cNorm = (c.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const matchNome = variantes.some(v => cNorm.includes(v) || v.includes(cNorm.split(" ")[0]));
          const matchPix = inputDigits.length >= 8 && (digitsOnly(c.pix_chave).includes(inputDigits) || inputDigits.includes(digitsOnly(c.pix_chave)));
          const matchTel = inputDigits.length >= 8 && (digitsOnly(c.telefone).includes(inputDigits) || inputDigits.includes(digitsOnly(c.telefone)));
          return matchNome || matchPix || matchTel;
        });

        const colabIds = colabsMatched.map((c: any) => c.id);

        // Expande variantes com as chaves Pix e telefones dos colaboradores encontrados
        colabsMatched.forEach((c: any) => {
          if (c.pix_chave) {
            variantes.push(c.pix_chave.trim());
            const d = digitsOnly(c.pix_chave);
            if (d) variantes.push(d);
          }
          if (c.telefone) {
            variantes.push(c.telefone.trim());
            const d = digitsOnly(c.telefone);
            if (d) variantes.push(d);
          }
          if (c.nome) {
            const primeiroNome = c.nome.split(" ")[0].toLowerCase();
            variantes.push(primeiroNome);
            if (primeiroNome.startsWith("sh")) variantes.push(primeiroNome.replace(/^sh/, "s"));
            if (primeiroNome.startsWith("s")) variantes.push(primeiroNome.replace(/^s/, "sh"));
          }
        });

        // 2. Busca em despesas
        let qDesp = supabase.from("despesas").select("id, descricao, valor, data, created_at, metodo_pagamento, categoria_id, observacoes").eq("user_id", userId);
        if (args.data_inicio) qDesp = qDesp.gte("data", args.data_inicio);
        if (args.data_fim) qDesp = qDesp.lte("data", args.data_fim);

        const { data: despData } = await qDesp.order("data", { ascending: false }).limit(200);

        // Filtra por variantes no texto ou ID do colaborador
        const matchedDesp = (despData || []).filter((d: any) => {
          const descNorm = ((d.descricao || "") + " " + (d.observacoes || "")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const descDigits = digitsOnly(d.descricao || "") + digitsOnly(d.observacoes || "");
          const matchTexto = variantes.some(v => descNorm.includes(v.toLowerCase()) || (inputDigits.length >= 8 && descDigits.includes(inputDigits)));
          const matchColab = d.colaborador_id && colabIds.includes(d.colaborador_id);
          return matchTexto || matchColab;
        }).map((d: any) => ({ ...d, tipo: "despesa", origem: "despesas" }));

        // 3. Busca em transacoes
        let qTx = supabase.from("transacoes").select("id, descricao, valor, tipo, data, created_at, metodo_pagamento, categoria_id").eq("user_id", userId);
        if (args.data_inicio) qTx = qTx.gte("data", args.data_inicio);
        if (args.data_fim) qTx = qTx.lte("data", args.data_fim);

        const { data: txData } = await qTx.order("data", { ascending: false }).limit(200);
        const matchedTx = (txData || []).filter((t: any) => {
          const descNorm = (t.descricao || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return variantes.some(v => descNorm.includes(v));
        }).map((t: any) => ({ ...t, origem: "transacoes" }));

        const resultadoBusca = [...matchedDesp, ...matchedTx];
        resultadoBusca.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

        const totalEncontrado = resultadoBusca.reduce((s, r) => s + Number(r.valor || 0), 0);

        return {
          termo_buscado: effectiveSearch,
          total_itens: resultadoBusca.length,
          total_valor: totalEncontrado,
          transacoes: resultadoBusca.slice(0, 50),
          observacao: `Encontrados ${resultadoBusca.length} pagamentos/lançamentos para '${effectiveSearch}' totalizando R$ ${totalEncontrado.toFixed(2)}.`
        };
      }

      const data = await fetchAllTransacoes(supabase, userId, { dataInicio: args.data_inicio as string | undefined, dataFim: args.data_fim as string | undefined, tipo: args.tipo as string | undefined, categoriaId, limit: (args.limit as number) || 50 });
      return data;
    }
    case "consultar_resumo_mensal": {
      const { ano, mes } = args as { ano: number; mes: number };
      const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
      const data = await fetchAllTransacoes(supabase, userId, { dataInicio: inicio, dataFim: fim, select: "id,descricao,valor,tipo,data,created_at,categoria_id,categorias(nome)" });
      const receitas = data.filter((t: any) => t.tipo === "receita").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const despesas = data.filter((t: any) => t.tipo === "despesa").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const porCategoria: Record<string, number> = {};
      data.filter((t: any) => t.tipo === "despesa").forEach((t: any) => { const cat = t.categorias?.nome || "Sem categoria"; porCategoria[cat] = (porCategoria[cat] || 0) + Number(t.valor); });
      const topCategorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, valor]) => ({ nome, valor }));
      return { periodo: `${mes}/${ano}`, receitas, despesas, saldo: receitas - despesas, topCategorias, total_transacoes: data.length };
    }
    case "comparar_periodos": {
      const { ano1, mes1, ano2, mes2 } = args as { ano1: number; mes1: number; ano2: number; mes2: number };
      async function getResumo(ano: number, mes: number) {
        const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const fim = new Date(ano, mes, 0).toISOString().split("T")[0];
        const data = await fetchAllTransacoes(supabase, userId, { dataInicio: inicio, dataFim: fim, select: "id,valor,tipo,data,created_at,categoria_id" });
        const receitas = data.filter((t: any) => t.tipo === "receita").reduce((s: number, t: any) => s + Number(t.valor), 0);
        const despesas = data.filter((t: any) => t.tipo === "despesa").reduce((s: number, t: any) => s + Number(t.valor), 0);
        return { receitas, despesas, saldo: receitas - despesas };
      }
      const [p1, p2] = await Promise.all([getResumo(ano1, mes1), getResumo(ano2, mes2)]);
      const variacao = (a: number, b: number) => b === 0 ? null : ((a - b) / b * 100).toFixed(1) + "%";
      return { periodo1: `${mes1}/${ano1}`, periodo2: `${mes2}/${ano2}`, periodo1_dados: p1, periodo2_dados: p2, variacao: { receitas: variacao(p2.receitas, p1.receitas), despesas: variacao(p2.despesas, p1.despesas), saldo: variacao(p2.saldo, p1.saldo) } };
    }
    case "consultar_saldos": { const { data, error } = await supabase.from("contas_usuario").select("id,nome,tipo,saldo").eq("user_id", userId); if (error) return { error: error.message }; const total = (data || []).reduce((s: number, c: any) => s + Number(c.saldo), 0); return { contas: data, total_geral: total }; }
    case "consultar_categorias": { let q = supabase.from("categorias").select("id,nome,tipo").eq("user_id", userId); if (args.tipo) q = q.eq("tipo", args.tipo as string); const { data, error } = await q; if (error) return { error: error.message }; return data; }
    case "consultar_transacoes_recorrentes": { const { data, error } = await supabase.from("transacoes_recorrentes").select("id,descricao,valor,tipo,recorrencia,proxima_execucao,ativo").eq("user_id", userId).eq("ativo", true); if (error) return { error: error.message }; return data; }
    case "projetar_gastos": { const meses = (args.meses as number) || 3; const { data } = await supabase.from("transacoes_recorrentes").select("valor,tipo,recorrencia").eq("user_id", userId).eq("ativo", true); const recorrentes = data || []; const projecoes = []; const hoje = new Date(); for (let i = 1; i <= meses; i++) { const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1); let receitas = 0, despesas = 0; recorrentes.forEach((t: any) => { const v = Number(t.valor); const mult = t.recorrencia === "semanal" ? 4 : t.recorrencia === "diaria" ? 30 : t.recorrencia === "anual" ? 1 / 12 : 1; if (t.tipo === "receita") receitas += v * mult; else despesas += v * mult; }); projecoes.push({ mes: `${d.getMonth() + 1}/${d.getFullYear()}`, receitas_projetadas: receitas, despesas_projetadas: despesas, saldo_projetado: receitas - despesas }); } return projecoes; }
    case "consultar_dividas": { let q = supabase.from("dividas").select("id,descricao,valor_total,valor_pago,credor,data_vencimento,status,parcelas").eq("user_id", userId); if (args.status) q = q.eq("status", args.status as string); const { data, error } = await q.order("data_vencimento", { ascending: true }); if (error) return { error: error.message }; return data; }
    case "consultar_metas": { let q = supabase.from("metas").select("id,nome,descricao,valor_alvo,valor_atual,data_limite,status").eq("user_id", userId); if (args.status) q = q.eq("status", args.status as string); const { data, error } = await q; if (error) return { error: error.message }; return data; }
    case "consultar_veiculos": { const { data, error } = await supabase.from("veiculos").select("id,marca,modelo,ano,quilometragem,manutencoes(id,data_realizada,proxima_data,status,tipos_manutencao(nome))").eq("user_id", userId); if (error) return { error: error.message }; return data; }
    case "consultar_orcamentos": { const { data, error } = await supabase.from("orcamentos_mercado").select("id,nome,total_estimado,created_at,itens_mercado(id,nome,quantidade,unidade,status,categorias_mercado(nome))").eq("user_id", userId); if (error) return { error: error.message }; return data; }
    case "cadastrar_transacao": {
      const { descricao, valor, tipo, data, metodo_pagamento, observacoes } = args as Record<string, unknown>;
      let contaId = args.conta_id as string | null;
      if (!contaId && args.conta_nome) { contaId = await resolveContaByName(supabase, userId, args.conta_nome as string); if (!contaId) { const { data: contas } = await supabase.from("contas_usuario").select("id,nome").eq("user_id", userId); const nomesDisponiveis = (contas || []).map((c: { nome: string }) => c.nome).join(", "); return { error: `Conta "${args.conta_nome}" não encontrada. Contas disponíveis: ${nomesDisponiveis || "nenhuma"}. Use criar_conta para criar uma nova.` }; } }
      let categoriaId = args.categoria_id as string | null;
      if (!categoriaId && args.categoria_nome) { categoriaId = await resolveCategoriaByName(supabase, userId, args.categoria_nome as string, tipo as string); if (!categoriaId) { const { data: cats } = await supabase.from("categorias").select("nome").eq("user_id", userId).eq("tipo", tipo as string); const nomesDisponiveis = (cats || []).map((c: { nome: string }) => c.nome).join(", "); return { error: `Categoria "${args.categoria_nome}" não encontrada para tipo "${tipo}". Categorias disponíveis: ${nomesDisponiveis || "nenhuma"}.` }; } }
      const table = tipo === "receita" ? "receitas" : tipo === "despesa" ? "despesas" : "transacoes";
      const insertData: Record<string, unknown> = { user_id: userId, descricao, valor: Number(valor), data, categoria_id: categoriaId || null, conta_id: contaId || null };
      if (table !== "transacoes") { insertData.metodo_pagamento = metodo_pagamento || null; insertData.observacoes = observacoes || null; } else { insertData.tipo = tipo; }
      const { data: result, error } = await supabase.from(table).insert(insertData).select("id,descricao,valor,data").single();
      if (error) return { error: error.message };
      return { sucesso: true, transacao: { ...result, tipo }, tabela: table };
    }
    case "atualizar_transacao": {
      const id = args.transacao_id as string;
      let contaId = args.conta_id as string | undefined;
      if (!contaId && args.conta_nome) { contaId = await resolveContaByName(supabase, userId, args.conta_nome as string) || undefined; if (!contaId) return { error: `Conta "${args.conta_nome}" não encontrada.` }; }
      let categoriaId = args.categoria_id as string | undefined;
      if (!categoriaId && args.categoria_nome) { categoriaId = await resolveCategoriaByName(supabase, userId, args.categoria_nome as string) || undefined; if (!categoriaId) return { error: `Categoria "${args.categoria_nome}" não encontrada.` }; }
      const updates: Record<string, unknown> = {};
      if (args.descricao) updates.descricao = args.descricao;
      if (args.valor !== undefined) updates.valor = Number(args.valor);
      if (args.data) updates.data = args.data;
      if (categoriaId) updates.categoria_id = categoriaId;
      if (contaId) updates.conta_id = contaId;
      if (args.metodo_pagamento) updates.metodo_pagamento = args.metodo_pagamento;
      if (args.observacoes !== undefined) updates.observacoes = args.observacoes;
      const tables = ["receitas", "despesas", "transacoes"];
      for (const table of tables) { const { data: result, error } = await supabase.from(table).update(updates).eq("id", id).eq("user_id", userId).select("id,descricao,valor,data").maybeSingle(); if (result) return { sucesso: true, transacao: result, tabela: table }; if (error && error.code !== "PGRST116") return { error: error.message }; }
      return { error: `Transação ${id} não encontrada.` };
    }
    case "buscar_categorias": {
      const { busca, tipo } = args as { busca: string; tipo?: string };
      let q = supabase.from("categorias").select("id,nome,tipo").eq("user_id", userId);
      if (tipo) q = q.eq("tipo", tipo);
      if (busca) {
        const sanitized = sanitizeIlike(busca);
        q = q.ilike("nome", `%${sanitized}%`);
      }
      const { data, error } = await q.limit(10);
      if (error) return { error: error.message };
      return { sucesso: true, busca, categorias: data || [], total: data?.length || 0 };
    }
    case "deletar_transacao": { const id = args.transacao_id as string; const results = await Promise.all([supabase.from("transacoes").delete().eq("id", id).eq("user_id", userId), supabase.from("receitas").delete().eq("id", id).eq("user_id", userId), supabase.from("despesas").delete().eq("id", id).eq("user_id", userId)]); const anyError = results.find(r => r.error); if (anyError?.error) return { error: anyError.error.message }; return { sucesso: true }; }
    case "criar_conta": { const { nome, tipo, saldo } = args as { nome: string; tipo: string; saldo?: number }; const { data: result, error } = await supabase.from("contas_usuario").insert({ user_id: userId, nome, tipo, saldo: Number(saldo || 0) }).select("id,nome,tipo,saldo").single(); if (error) return { error: error.message }; return { sucesso: true, conta: result }; }
    case "atualizar_conta": { let contaId = args.conta_id as string | undefined; if (!contaId && args.conta_nome) { contaId = await resolveContaByName(supabase, userId, args.conta_nome as string) || undefined; if (!contaId) return { error: `Conta "${args.conta_nome}" não encontrada.` }; } if (!contaId) return { error: "Informe conta_id ou conta_nome para localizar a conta." }; const updates: Record<string, unknown> = {}; if (args.nome) updates.nome = args.nome; if (args.saldo !== undefined) updates.saldo = Number(args.saldo); const { data: result, error } = await supabase.from("contas_usuario").update(updates).eq("id", contaId).eq("user_id", userId).select("id,nome,tipo,saldo").single(); if (error) return { error: error.message }; return { sucesso: true, conta: result }; }
    case "cadastrar_divida": {
      const { descricao, valor_total, credor, data_vencimento, parcelas, categoria_id, categoria_nome } = args as Record<string, unknown>;
      let catId = (categoria_id as string) || null;
      if (!catId && (categoria_nome || credor || descricao)) {
        const found = await resolveCategoriaByCredor(supabase, userId, String(categoria_nome || credor || descricao));
        if (found) catId = found.id;
      }
      const { data: result, error } = await supabase
        .from("dividas")
        .insert({
          user_id: userId,
          descricao,
          valor_total: Number(valor_total),
          valor_restante: Number(valor_total),
          credor: credor || null,
          data_vencimento: data_vencimento || null,
          parcelas: parcelas || null,
          categoria_id: catId,
          status: "pendente"
        })
        .select("id,descricao,valor_total,status,categoria_id")
        .single();
      if (error) return { error: error.message };
      return { sucesso: true, divida: result };
    }
    case "atualizar_divida": { const updates: Record<string, unknown> = {}; if (args.status) updates.status = args.status; if (args.valor_pago !== undefined) updates.valor_pago = Number(args.valor_pago); const { error } = await supabase.from("dividas").update(updates).eq("id", args.divida_id as string).eq("user_id", userId); if (error) return { error: error.message }; return { sucesso: true }; }
    case "cadastrar_meta": { const { nome, valor_alvo, valor_atual, data_limite, descricao } = args as Record<string, unknown>; const { data: result, error } = await supabase.from("metas").insert({ user_id: userId, nome, valor_alvo: Number(valor_alvo), valor_atual: Number(valor_atual || 0), data_limite: data_limite || null, descricao: descricao || null, status: "ativa" }).select("id,nome,valor_alvo,status").single(); if (error) return { error: error.message }; return { sucesso: true, meta: result }; }
    case "atualizar_meta": { const { meta_id, ...rest } = args as Record<string, unknown>; const updates: Record<string, unknown> = {}; if (rest.valor_atual !== undefined) updates.valor_atual = Number(rest.valor_atual); if (rest.status) updates.status = rest.status; if (rest.nome) updates.nome = rest.nome; if (rest.valor_alvo !== undefined) updates.valor_alvo = Number(rest.valor_alvo); if (rest.data_limite) updates.data_limite = rest.data_limite; const { error } = await supabase.from("metas").update(updates).eq("id", meta_id as string).eq("user_id", userId); if (error) return { error: error.message }; return { sucesso: true }; }
    case "analisar_documento": { return { acao: "analisar_imagem", tipo: args.tipo_suspeito || "desconhecido", mensagem: "Analisando documento..." }; }
    case "atualizar_custo_produto_eyemobile": {
      const { produto_id, produto_nome, codigo_barras, novo_custo, quantidade_estoque } = args as Record<string, unknown>;
      let foundProduct: any = null;
      if (codigo_barras) {
        const { data } = await supabase.from("eyemobile_produtos").select("*").eq("user_id", userId).eq("codigo_barras", codigo_barras).maybeSingle();
        if (data) foundProduct = data;
      }
      if (!foundProduct && produto_id) {
        const { data } = await supabase.from("eyemobile_produtos").select("*").eq("user_id", userId).eq("produto_id", produto_id).maybeSingle();
        if (data) foundProduct = data;
      }
      if (!foundProduct && produto_nome) {
        const sanitizedNome = sanitizeIlike(produto_nome as string);
        const { data } = await supabase.from("eyemobile_produtos").select("*").eq("user_id", userId).ilike("nome", `%${sanitizedNome}%`).limit(1).maybeSingle();
        if (data) foundProduct = data;
      }
      if (foundProduct) {
        const { data: updated, error } = await supabase.from("eyemobile_produtos").update({ custo: Number(novo_custo), estoque: Number(quantidade_estoque ?? foundProduct.estoque ?? 0), updated_at: new Date().toISOString() }).eq("id", foundProduct.id).select("*").single();
        if (error) return { error: error.message };
        return { sucesso: true, produto: updated };
      }
      return { error: `Produto "${produto_nome || codigo_barras || 'desconhecido'}" não localizado na tabela de produtos do Eyemobile.`, sugerir_cadastro: true, dados: { nome: produto_nome || "", codigo_barras: codigo_barras || "", custo: novo_custo, estoque: quantidade_estoque } };
    }
    case "cadastrar_despesa_nf": { const { descricao, valor, data, categoria_nome, fornecedor, metodo_pagamento, numero_nf } = args as Record<string, unknown>; let categoriaId: string | null = null; if (categoria_nome) { categoriaId = await resolveCategoriaByName(supabase, userId, categoria_nome as string, "despesa"); } const { data: result, error } = await supabase.from("despesas").insert({ user_id: userId, descricao: descricao, valor: Number(valor), data: data, categoria_id: categoriaId || null, metodo_pagamento: metodo_pagamento || null, observacoes: `Nota Fiscal nº ${numero_nf || ""}. Fornecedor: ${fornecedor || ""}.` }).select("id,descricao,valor,data").single(); if (error) return { error: error.message }; return { sucesso: true, despesa: result }; }
    case "cadastrar_boleto":
    case "cadastrar_divida_boleto": {
      const { descricao, valor_total, valor, credor, beneficiario, data_vencimento, vencimento, codigo_barras, linha_digitavel, pix_copia_cola, parcelas, categoria_id, categoria_nome } = args as Record<string, unknown>;
      const val = Number(valor_total ?? valor ?? 0);
      const dtVenc = (data_vencimento ?? vencimento) as string;
      const benef = (credor ?? beneficiario ?? "Beneficiário Boleto") as string;
      const desc = (descricao as string) || `Boleto - ${benef}`;
      let catId = (categoria_id as string) || null;
      if (!catId && (categoria_nome || benef || desc)) {
        const found = await resolveCategoriaByCredor(supabase, userId, String(categoria_nome || benef || desc));
        if (found) catId = found.id;
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
          descricao: desc,
          valor_total: val,
          valor_restante: val,
          valor_pago: 0,
          credor: benef,
          data_vencimento: dtVenc,
          parcelas: Number(parcelas || 1),
          parcelas_pagas: 0,
          status: "pendente",
          metodo_pagamento_esperado: "boleto",
          categoria_id: catId,
          codigo_barras: codigo_barras || null,
          linha_digitavel: linha_digitavel || null,
          observacoes: obsParts.join(" ") || null,
        })
        .select("id,descricao,valor_total,data_vencimento,credor,categoria_id")
        .single();
      if (error) return { error: error.message };
      return { sucesso: true, divida: result };
    }
    case "validar_fechamento_caixa": {
      const { valor_relatado, turno_data } = args as Record<string, unknown>;
      const { data: defaultWs } = await supabase.from("workspaces").select("id").eq("user_id", userId).eq("is_default", true).maybeSingle();
      const wsId = defaultWs?.id || null;
      let queryVendas = supabase.from("transacoes").select("valor").eq("user_id", userId).eq("tipo", "receita").eq("data", turno_data as string);
      if (wsId) queryVendas = queryVendas.eq("workspace_id", wsId);
      const { data: vendas, error: errV } = await queryVendas;
      if (errV) return { error: errV.message };
      const totalVendas = (vendas || []).reduce((sum: number, v: any) => sum + Number(v.valor || 0), 0);
      
      const diviFilter = sanitizeIlike("divipay");
      let querySaques = supabase.from("transacoes").select("valor").eq("user_id", userId).eq("tipo", "despesa").eq("data", turno_data as string).ilike("descricao", `%${diviFilter}%`);
      if (wsId) querySaques = querySaques.eq("workspace_id", wsId);
      const { data: saques, error: errS } = await querySaques;
      if (errS) return { error: errS.message };
      const totalSaques = (saques || []).reduce((sum: number, s: any) => sum + Number(s.valor || 0), 0);
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
      return { sucesso: true, dados: { total_vendas_pdv: totalVendas, total_saques_divipay: totalSaques, saldo_esperado: esperado, saldo_relatado: relatado, diferenca, status, mensagem: msg } };
    }
    default: return { error: `Ferramenta desconhecida: ${name}` };
  }
}

Deno.serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withCorrelationHeader(CORS_HEADERS, correlationId),
    });
  }

  if (req.method !== "POST") {
    return createErrorResponse(req, {
      status: 405,
      message: "Method not allowed",
      correlationId,
      corsHeaders: CORS_HEADERS,
    });
  }

  const url = new URL(req.url);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return createErrorResponse(req, {
      status: 401,
      message: "Missing authorization header",
      correlationId,
      corsHeaders: CORS_HEADERS,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwt = authHeader.replace("Bearer ", "").trim();

  // ================================================================
  // ENDPOINT: /transcribe-audio (Whisper Transcription)
  // ================================================================
  if (url.pathname.endsWith("/transcribe-audio") || (req.headers.get("content-type") || "").includes("multipart/form-data")) {
    try {
      const formData = await req.formData();
      const audioFile = formData.get("audio") as File;
      const targetUserId = (formData.get("user_id") as string) || "";

      if (!audioFile) {
        return createErrorResponse(req, {
          status: 400,
          message: "Nenhum arquivo de áudio fornecido",
          correlationId,
          corsHeaders: CORS_HEADERS,
        });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      let openaiApiKey = Deno.env.get("OPENAI_API_KEY");
      if (targetUserId) {
        const { data: cfg } = await supabase.from("ia_configuracoes").select("api_key").eq("user_id", targetUserId).maybeSingle();
        if (cfg?.api_key) openaiApiKey = cfg.api_key;
      }

      if (!openaiApiKey) {
        logger.error("OpenAI API Key não configurada para transcrição", {
          correlationId,
          operation: "transcribe_audio",
          userId: maskId(targetUserId),
        });
        return createErrorResponse(req, {
          status: 500,
          message: "OpenAI API Key não configurada para transcrição",
          correlationId,
          corsHeaders: CORS_HEADERS,
        });
      }

      const openaiFormData = new FormData();
      openaiFormData.append("file", audioFile, audioFile.name || "audio.ogg");
      openaiFormData.append("model", "whisper-1");
      openaiFormData.append("language", "pt");
      openaiFormData.append("response_format", "json");

      const whisperResp = await fetchWithTimeout("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: openaiFormData,
        timeout: 30000,
      });

      if (!whisperResp.ok) {
        const errText = await whisperResp.text();
        logger.error("Falha na transcrição Whisper", {
          correlationId,
          operation: "transcribe_audio",
          metadata: { status: whisperResp.status, error: errText.slice(0, 300) },
        });
        return createErrorResponse(req, {
          status: whisperResp.status === 429 ? 429 : 502,
          message: "Falha na transcrição de áudio pelo provedor.",
          correlationId,
          corsHeaders: CORS_HEADERS,
        });
      }

      const whisperData = await whisperResp.json();
      return new Response(
        JSON.stringify({
          success: true,
          transcription: whisperData.text,
          language: whisperData.language || "pt",
          correlation_id: correlationId,
        }),
        {
          status: 200,
          headers: withCorrelationHeader({ ...CORS_HEADERS, "Content-Type": "application/json" }, correlationId),
        },
      );
    } catch (err: any) {
      logger.error("Exceção na transcrição Whisper", {
        correlationId,
        operation: "transcribe_audio",
        metadata: { error: err.message },
      });
      return createErrorResponse(req, {
        status: 500,
        message: "Erro interno no processamento do áudio.",
        correlationId,
        corsHeaders: CORS_HEADERS,
      });
    }
  }

  let body: { model?: string; messages: unknown[]; max_tokens?: number; temperature?: number; user_id?: string; response_format?: unknown; tools?: unknown; _startTime?: number; workspace_id?: string };
  try {
    body = await req.json();
  } catch {
    return createErrorResponse(req, {
      status: 400,
      message: "Invalid JSON body",
      correlationId,
      corsHeaders: CORS_HEADERS,
    });
  }

  let userId: string;

  // Validação segura do JWT / Service Role para chamadas internas e de usuários
  let isServiceRoleCall = Boolean(jwt === supabaseServiceKey && body.user_id);
  if (!isServiceRoleCall && jwt.startsWith("eyJ")) {
    try {
      const payloadBase64 = jwt.split(".")[1];
      const decoded = JSON.parse(atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")));
      if (decoded.role === "service_role" || decoded.iss === "supabase") {
        isServiceRoleCall = true;
      }
    } catch (_) {
      // Ignora payload malformado para prosseguir com autenticação padrão
    }
  }

  if (isServiceRoleCall && body.user_id) {
    // Chamada interna autorizada por service-role (ex: telegram-webhook)
    userId = body.user_id;
  } else {
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !user) {
      return createErrorResponse(req, {
        status: 401,
        message: "Invalid or expired token",
        correlationId,
        corsHeaders: CORS_HEADERS,
      });
    }
    userId = user.id;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: config } = await supabase.from("ia_configuracoes").select("api_key").eq("user_id", userId).maybeSingle();
  const openaiKey = config?.api_key || Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return createErrorResponse(req, {
      status: 400,
      message: "API key não configurada. Configure sua chave OpenAI na aba Configurações.",
      correlationId,
      corsHeaders: CORS_HEADERS,
    });
  }

  logger.info("Requisição recebida", {
    correlationId,
    operation: "chat_completion",
    userId: maskId(userId),
    metadata: {
      model: body.model || "gpt-4o-mini",
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      toolsCount: TOOLS.length,
    },
  });

  const messages = [...body.messages] as Record<string, unknown>[];
  const hojeBrasil = getHojeBrasil();
  const hasSystem = messages.some((m) => m.role === "system");
  if (!hasSystem) {
    messages.unshift({
      role: "system",
      content: `Você é o Assistente Financeiro Inteligente do Wallet App.
Data atual no Brasil: ${hojeBrasil} (America/Sao_Paulo).
Ao responder perguntas sobre vendas, entradas ou faturamento de "hoje" ou datas relativas, utilize a ferramenta consultar_vendas_eyemobile com data_inicio = "${hojeBrasil}" e data_fim = "${hojeBrasil}".
Ao detalhar as vendas, apresente o valor total, quantidade de vendas, ticket médio e a quebra por métodos de pagamento (Pix, Débito, Crédito, Dinheiro).`,
    });
  }
  const MAX_ITERATIONS = 8;

  const toolsToUse = Array.isArray(body.tools) ? (body.tools.length > 0 ? body.tools : undefined) : (body.tools === null ? undefined : TOOLS);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let modelToUse = body.model || "gpt-4o-mini";
    let response = await fetchWithTimeout(OPENAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelToUse,
        messages,
        ...(toolsToUse ? { tools: toolsToUse, tool_choice: "auto" } : {}),
        max_tokens: body.max_tokens || 2000,
        temperature: body.temperature ?? 0.3,
        response_format: body.response_format || undefined,
      }),
      timeout: 45000,
    });

    let data = await response.json();
    if (!response.ok && (modelToUse === "gpt-4o-mini" || modelToUse.includes("mini"))) {
      const errStr = JSON.stringify(data);
      if (errStr.includes("vision") || errStr.includes("image") || response.status === 400) {
        logger.warn("Retentando com gpt-4o devido a erro no mini", {
          correlationId,
          operation: "chat_fallback_gpt4o",
          metadata: { error: errStr.slice(0, 300) },
        });
        modelToUse = "gpt-4o";
        response = await fetchWithTimeout(OPENAI_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelToUse,
            messages,
            ...(toolsToUse ? { tools: toolsToUse, tool_choice: "auto" } : {}),
            max_tokens: body.max_tokens || 2000,
            temperature: body.temperature ?? 0.3,
            response_format: body.response_format || undefined,
          }),
          timeout: 45000,
        });
        data = await response.json();
      }
    }

    if (!response.ok) {
      const isRateLimit = response.status === 429;
      const isAuthError = response.status === 401 || response.status === 403;
      const isTimeout = response.status === 504;
      const errorCode = isRateLimit
        ? OPENAI_ERROR_CODES.RATE_LIMIT
        : isAuthError
        ? OPENAI_ERROR_CODES.AUTH_ERROR
        : isTimeout
        ? OPENAI_ERROR_CODES.TIMEOUT
        : OPENAI_ERROR_CODES.UPSTREAM_ERROR;

      logger.error("OpenAI retornou erro", {
        correlationId,
        operation: "openai_response_error",
        errorCode,
        metadata: { status: response.status, error: JSON.stringify(data).slice(0, 300) },
      });
      return createErrorResponse(req, {
        status: isRateLimit ? 429 : isTimeout ? 504 : response.status >= 500 ? 502 : response.status,
        code: errorCode,
        message: data.error?.message || "Erro retornado pelo provedor OpenAI",
        correlationId,
        corsHeaders: CORS_HEADERS,
      });
    }

    const choice = data.choices?.[0];
    const message = choice?.message;
    if (!message) {
      break;
    }
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      const usage = data.usage || {};
      const durationMs = Date.now() - (body._startTime || Date.now());
      const toolsExecuted = (messages.filter((m: any) => m.role === "tool") as any[]).length;
      
      supabase.from("wallet_ai_audit_events").insert({
        user_id: userId,
        workspace_id: body.workspace_id || null,
        tool_name: toolsExecuted > 0 ? "consultar_vendas_eyemobile" : "chat_assistente",
        model: modelToUse,
        tokens_prompt: usage.prompt_tokens || 0,
        tokens_completion: usage.completion_tokens || 0,
        tokens_total: usage.total_tokens || 0,
        duration_ms: Math.max(50, durationMs),
        execution_status: "success",
      }).then(() => {});

      return new Response(JSON.stringify({ ...data, correlation_id: correlationId }), {
        status: 200,
        headers: withCorrelationHeader({ "Content-Type": "application/json", ...CORS_HEADERS }, correlationId),
      });
    }

    logger.info(`Executando ${message.tool_calls.length} ferramenta(s)`, {
      correlationId,
      operation: "tool_execution",
      metadata: { tools: message.tool_calls.map((tc: any) => tc.function.name) },
    });

    await Promise.all(
      message.tool_calls.map(async (tc: any) => {
        let toolResult: unknown;
        try {
          const toolArgs = JSON.parse(tc.function.arguments || "{}");
          toolResult = await executeTool(tc.function.name, toolArgs, supabase, userId);
        } catch (e) {
          logger.error(`Exceção na ferramenta ${tc.function.name}`, {
            correlationId,
            operation: "executeTool",
            metadata: { error: e instanceof Error ? e.message : String(e) },
          });
          toolResult = { error: e instanceof Error ? e.message : String(e) };
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
        });
      }),
    );
  }

  return createErrorResponse(req, {
    status: 500,
    message: "Máximo de iterações atingido sem resposta conclusiva.",
    correlationId,
    corsHeaders: CORS_HEADERS,
  });
});
