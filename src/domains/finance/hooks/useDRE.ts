import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import type { DREGerencial, LinhaDRE } from "@/domains/finance/types/foodCost";

export const DRE_QUERY_KEY = ["dre_gerencial"] as const;

const ALIQUOTA_ICMS_SIMPLES = 0.07;
const ALIQUOTA_PIS_COFINS = 0.0365;
const ALIQUOTA_ISS = 0.02;
const ALIQUOTA_CMV_ESTIMADO = 0.30;
const ALIQUOTA_IR = 0.15;

const DIVIPAY_NON_SETTLED_STATUSES = [
  "PENDING", "PROCESSING", "FAILED", "ERROR", "REJECTED",
  "CANCELED", "CANCELLED", "EXPIRED", "REFUNDED", "CHARGEBACK",
];
const DIVIPAY_CASH_OUT_TYPES = ["CASH_OUT", "CASHOUT", "WITHDRAW", "SAQUE", "TRANSFER_OUT"];

interface FetchDREParams {
  mes: number;
  ano: number;
  workspaceId?: string | null;
}

interface DREHistoricoMes {
  periodo: string;
  mes: number;
  ano: number;
  receitaBruta: number;
  receitaLiquida: number;
  lucroBruto: number;
  despesasOperacionais: number;
  despesasCartao: number;
  ebitda: number;
  lair: number;
  lucroLiquido: number;
  margemBruta: number;
  margemEbitda: number;
  margemLiquida: number;
}

async function fetchAllRows(
  table: string,
  columns: string,
  inicioStr: string,
  fimStr: string,
  tipo?: string,
  workspaceId?: string | null
): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let allRows: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let q = supabase
      .from(table)
      .select(columns)
      .gte("data", inicioStr)
      .lte("data", fimStr);

    if (tipo) {
      q = q.eq("tipo", tipo);
    }

    if (workspaceId) {
      q = q.eq("workspace_id", workspaceId);
    }

    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) {
      break;
    }
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  return allRows;
}

async function calcularDRE({ mes, ano, workspaceId }: FetchDREParams): Promise<DREGerencial> {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const mesPad = String(mes).padStart(2, "0");
  const inicioStr = `${ano}-${mesPad}-01`;
  const fimStr = `${ano}-${mesPad}-${String(ultimoDia).padStart(2, "0")}`;

  const [recRows, transRecRows, despRows, transDespRows] = await Promise.all([
    fetchAllRows("receitas", "valor, workspace_id", inicioStr, fimStr, undefined, workspaceId),
    fetchAllRows("transacoes", "valor, workspace_id", inicioStr, fimStr, "receita", workspaceId),
    fetchAllRows("despesas", "valor, descricao, workspace_id, conta_id, metodo_pagamento, fatura_id", inicioStr, fimStr, undefined, workspaceId),
    fetchAllRows("transacoes", "valor, descricao, workspace_id, cartao_id, metodo_pagamento", inicioStr, fimStr, "despesa", workspaceId),
  ]);

  const soma = (rows: any[] | null) =>
    (rows ?? []).reduce((acc: number, r: any) => acc + Number(r.valor || 0), 0);

  const somaReceitasBanco = soma(recRows) + soma(transRecRows);

  let somaDivipay = 0;
  try {
    const divipayResp = await divipayService.listMovements({
      initialDate: `${inicioStr}T00:00:00`,
      finalDate: `${fimStr}T23:59:59`,
      limit: 1000,
    });
    const items = divipayResp.items ?? [];
    somaDivipay = items
      .filter((m) => {
        const tp = String(m.type || "").toUpperCase();
        const st = String(m.status || "").toUpperCase();
        if (DIVIPAY_CASH_OUT_TYPES.some((t) => tp.includes(t))) return false;
        if (st && DIVIPAY_NON_SETTLED_STATUSES.some((s) => st.includes(s))) return false;
        return true;
      })
      .reduce((acc, m) => acc + (m.amountLiquid > 0 ? m.amountLiquid : Number(m.amount || 0)), 0);
  } catch (err) {
    console.warn("DRE: Erro ao buscar movimentações Divipay", err);
  }

  const receitaBruta = somaReceitasBanco + somaDivipay;

  const impostosSimples = receitaBruta * ALIQUOTA_ICMS_SIMPLES;
  const pisCofinsSobreReceita = receitaBruta * ALIQUOTA_PIS_COFINS;
  const issServicos = receitaBruta * ALIQUOTA_ISS;
  const totalImpostos = impostosSimples + pisCofinsSobreReceita + issServicos;
  const receitaLiquida = receitaBruta - totalImpostos;

  const { data: fichasData } = await (workspaceId
    ? supabase.from("fichas_tecnicas").select("quantidade, custo_unitario").eq("workspace_id", workspaceId)
    : supabase.from("fichas_tecnicas").select("quantidade, custo_unitario"));

  let cmv: number;
  if (fichasData && fichasData.length > 0) {
    cmv = fichasData.reduce((acc, f) => acc + Number(f.quantidade) * Number(f.custo_unitario), 0);
  } else {
    cmv = receitaBruta * ALIQUOTA_CMV_ESTIMADO;
  }

  const lucroBruto = receitaLiquida - cmv;

  // SEPARAÇÃO CORRETA: Despesas Operacionais do Negócio vs Cartão de Crédito
  const isCartao = (r: any) =>
    Boolean(r.cartao_id) || Boolean(r.fatura_id) || String(r.metodo_pagamento || "").toLowerCase().includes("credito");

  const despesasOperacionais =
    despRows.reduce((acc: number, r: any) => (isCartao(r) ? acc : acc + Number(r.valor || 0)), 0) +
    transDespRows.reduce((acc: number, r: any) => (isCartao(r) ? acc : acc + Number(r.valor || 0)), 0);

  const despesasCartao =
    despRows.reduce((acc: number, r: any) => (isCartao(r) ? acc + Number(r.valor || 0) : acc), 0) +
    transDespRows.reduce((acc: number, r: any) => (isCartao(r) ? acc + Number(r.valor || 0) : acc), 0);

  const ebitda = lucroBruto - despesasOperacionais;
  const depreciacao = receitaBruta * 0.01;
  const lair = ebitda - depreciacao;
  const irpj = lair > 0 ? lair * ALIQUOTA_IR : 0;
  const lucroLiquido = lair - irpj;

  const pct = (v: number) =>
    receitaBruta > 0 ? Math.round((v / receitaBruta) * 10000) / 100 : 0;

  const linhas: LinhaDRE[] = [
    { label: "Receita Bruta", valor: receitaBruta, tipo: "total" },
    { label: "(-) Simples Nacional ICMS (7%)", valor: -impostosSimples, percentualSobreReceita: pct(impostosSimples), tipo: "negativo", indent: 1 },
    { label: "(-) PIS/COFINS (3,65%)", valor: -pisCofinsSobreReceita, percentualSobreReceita: pct(pisCofinsSobreReceita), tipo: "negativo", indent: 1 },
    { label: "(-) ISS Serviços (2%)", valor: -issServicos, percentualSobreReceita: pct(issServicos), tipo: "negativo", indent: 1 },
    { label: "= Receita Líquida", valor: receitaLiquida, percentualSobreReceita: pct(receitaLiquida), tipo: "subtotal" },
    { label: "(-) CMV — Custo de Mercadoria Vendida", valor: -cmv, percentualSobreReceita: pct(cmv), tipo: "negativo" },
    { label: "= Lucro Bruto", valor: lucroBruto, percentualSobreReceita: pct(lucroBruto), tipo: "subtotal" },
    { label: "(-) Despesas Operacionais", valor: -despesasOperacionais, percentualSobreReceita: pct(despesasOperacionais), tipo: "negativo" },
    { label: "(-) Despesas com Cartão de Crédito", valor: -despesasCartao, percentualSobreReceita: pct(despesasCartao), tipo: "negativo", indent: 1 },
    { label: "= EBITDA", valor: ebitda, percentualSobreReceita: pct(ebitda), tipo: "subtotal" },
    { label: "(-) Depreciação estimada (1%)", valor: -depreciacao, percentualSobreReceita: pct(depreciacao), tipo: "negativo", indent: 1 },
    { label: "= LAIR (Lucro antes do IR)", valor: lair, percentualSobreReceita: pct(lair), tipo: "subtotal" },
    { label: "(-) IRPJ (15%)", valor: -irpj, percentualSobreReceita: pct(irpj), tipo: "negativo", indent: 1 },
    { label: "= Lucro Líquido", valor: lucroLiquido, percentualSobreReceita: pct(lucroLiquido), tipo: "total" },
  ];

  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  return {
    periodo: `${meses[mes - 1]}/${ano}`,
    mes, ano,
    receitaBruta,
    impostosSimples,
    pisCofinsSobreReceita,
    issServicos,
    receitaLiquida,
    cmv,
    lucroBruto,
    despesasOperacionais,
    ebitda,
    depreciacao,
    lair,
    irpj,
    lucroLiquido,
    margemBruta: pct(lucroBruto),
    margemEbitda: pct(ebitda),
    margemLiquida: pct(lucroLiquido),
    linhas,
    despesasCartao,
  } as any;
}

async function buscarHistoricoDRE(mesAtual: number, anoAtual: number, meses: number, workspaceId?: string | null): Promise<DREHistoricoMes[]> {
  const promises = Array.from({ length: meses }, (_, i) => {
    const d = new Date(anoAtual, mesAtual - 1 - i, 1);
    const m = d.getMonth() + 1;
    const a = d.getFullYear();
    return calcularDRE({ mes: m, ano: a, workspaceId })
      .then((dre) => ({
        periodo: dre.periodo,
        mes: m,
        ano: a,
        receitaBruta: dre.receitaBruta,
        receitaLiquida: dre.receitaLiquida,
        lucroBruto: dre.lucroBruto,
        despesasOperacionais: dre.despesasOperacionais,
        despesasCartao: (dre as any).despesasCartao || 0,
        ebitda: dre.ebitda,
        lair: dre.lair,
        lucroLiquido: dre.lucroLiquido,
        margemBruta: dre.margemBruta,
        margemEbitda: dre.margemEbitda,
        margemLiquida: dre.margemLiquida,
      }))
      .catch(() => null);
  });

  const results = await Promise.all(promises);
  return (results.filter(Boolean) as DREHistoricoMes[]).reverse();
}

export function useDRE(mes?: number, ano?: number) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const hoje = new Date();
  const mesAtual = mes ?? hoje.getMonth() + 1;
  const anoAtual = ano ?? hoje.getFullYear();

  const { data: dre, isLoading: loadingDRE } = useQuery({
    queryKey: [...DRE_QUERY_KEY, mesAtual, anoAtual, workspaceId],
    queryFn: () => calcularDRE({ mes: mesAtual, ano: anoAtual, workspaceId }),
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: historico, isLoading: loadingHistorico } = useQuery({
    queryKey: [...DRE_QUERY_KEY, "historico", mesAtual, anoAtual, workspaceId],
    queryFn: () => buscarHistoricoDRE(mesAtual, anoAtual, 6, workspaceId),
    staleTime: 1000 * 60 * 10,
    enabled: !!dre && !!workspaceId,
  });

  return { dre, historico, loading: loadingDRE, loadingHistorico };
}
