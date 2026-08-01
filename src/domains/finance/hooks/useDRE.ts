import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import type { DREGerencial, LinhaDRE } from "@/domains/finance/types/foodCost";

export const DRE_QUERY_KEY = ["dre_gerencial"] as const;

// ─── Alíquotas Simples Nacional (cafeteria/lanchonete — comércio) ────────────
const ALIQUOTA_ICMS_SIMPLES = 0.07;         // 7%
const ALIQUOTA_PIS_COFINS = 0.0365;         // 3,65%
const ALIQUOTA_ISS = 0.02;                  // 2% (sobre serviços eventuais)
const ALIQUOTA_CMV_ESTIMADO = 0.30;         // 30% quando não há fichas técnicas
const ALIQUOTA_IR = 0.15;                   // IRPJ simplificado

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

async function calcularDRE({ mes, ano, workspaceId }: FetchDREParams): Promise<DREGerencial> {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const mesPad = String(mes).padStart(2, "0");
  const inicioStr = `${ano}-${mesPad}-01`;
  const fimStr = `${ano}-${mesPad}-${String(ultimoDia).padStart(2, "0")}T23:59:59`;

  // 1. RECEITAS
  // 1.1 Tabela `receitas`
  let qReceitas = supabase
    .from("receitas")
    .select("valor, workspace_id")
    .gte("data", inicioStr)
    .lte("data", fimStr);

  // 1.2 Tabela `transacoes` (tipo = 'receita')
  let qTransacoesReceita = supabase
    .from("transacoes")
    .select("valor, workspace_id")
    .eq("tipo", "receita")
    .gte("data", inicioStr)
    .lte("data", fimStr);

  // 1.3 Tabela `despesas`
  let qDespesas = supabase
    .from("despesas")
    .select("valor, workspace_id")
    .gte("data", inicioStr)
    .lte("data", fimStr);

  // 1.4 Tabela `transacoes` (tipo = 'despesa')
  let qTransacoesDespesa = supabase
    .from("transacoes")
    .select("valor, workspace_id")
    .eq("tipo", "despesa")
    .gte("data", inicioStr)
    .lte("data", fimStr);

  // Se houver workspaceId, tenta filtrar por workspace ou itens globais (sem workspace)
  if (workspaceId) {
    qReceitas = qReceitas.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
    qTransacoesReceita = qTransacoesReceita.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
    qDespesas = qDespesas.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
    qTransacoesDespesa = qTransacoesDespesa.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
  }

  const [recResp, transRecResp, despResp, transDespResp] = await Promise.all([
    qReceitas,
    qTransacoesReceita,
    qDespesas,
    qTransacoesDespesa,
  ]);

  const soma = (rows: any[] | null) =>
    (rows ?? []).reduce((acc: number, r: any) => acc + Number(r.valor || 0), 0);

  let somaReceitasBanco = soma(recResp.data) + soma(transRecResp.data);
  let despesasOperacionais = soma(despResp.data) + soma(transDespResp.data);

  // 1.5 Buscar Entradas Divipay do período
  let somaDivipay = 0;
  try {
    const divipayResp = await divipayService.listMovements({
      initialDate: `${inicioStr}T00:00:00`,
      finalDate: fimStr,
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

  // Receita Bruta Total = receitas manuais + vendas banco + entradas Divipay ao vivo
  const receitaBruta = somaReceitasBanco + somaDivipay;

  // 2. CÁLCULO HIERÁRQUICO DA DRE
  const impostosSimples = receitaBruta * ALIQUOTA_ICMS_SIMPLES;
  const pisCofinsSobreReceita = receitaBruta * ALIQUOTA_PIS_COFINS;
  const issServicos = receitaBruta * ALIQUOTA_ISS;
  const totalImpostos = impostosSimples + pisCofinsSobreReceita + issServicos;

  const receitaLiquida = receitaBruta - totalImpostos;

  // CMV: usa ficha técnica se disponível, senão estima 30% da Receita Bruta
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
  const ebitda = lucroBruto - despesasOperacionais;
  const depreciacao = receitaBruta * 0.01; // estimativa de 1%
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
    { label: "= EBITDA", valor: ebitda, percentualSobreReceita: pct(ebitda), tipo: "subtotal" },
    { label: "(-) Depreciação estimada (1%)", valor: -depreciacao, percentualSobreReceita: pct(depreciacao), tipo: "negativo", indent: 1 },
    { label: "= LAIR (Lucro antes do IR)", valor: lair, percentualSobreReceita: pct(lair), tipo: "subtotal" },
    { label: "(-) IRPJ (15%)", valor: -irpj, percentualSobreReceita: pct(irpj), tipo: "negativo", indent: 1 },
    { label: "= Lucro Líquido", valor: lucroLiquido, percentualSobreReceita: pct(lucroLiquido), tipo: "total" },
  ];

  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  return {
    periodo: `${meses[mes - 1]}/${ano}`,
    mes,
    ano,
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
  };
}

export function useDRE(mes?: number, ano?: number) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;

  const hoje = new Date();
  const mesAtual = mes ?? hoje.getMonth() + 1;
  const anoAtual = ano ?? hoje.getFullYear();

  const { data: dre, isLoading: loading } = useQuery({
    queryKey: [...DRE_QUERY_KEY, mesAtual, anoAtual, workspaceId],
    queryFn: () => calcularDRE({ mes: mesAtual, ano: anoAtual, workspaceId }),
    staleTime: 1000 * 60 * 5,
  });

  return { dre, loading };
}
