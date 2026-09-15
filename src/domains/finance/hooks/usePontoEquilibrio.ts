import { useMemo } from "react";
import { useReceitas } from "./useReceitas";
import { useDespesas } from "./useDespesas";
import { useDividas } from "./useDividas";
import { useRecurringTransactions } from "./useRecurringTransactions";
import { getHojeSaoPaulo } from "../utils/dateHelpers";

function normalizeText(text?: string | null): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Termos e categorias que identificam custos fixos reais (incluindo categorias reais do banco como "Moradia", "Salário", etc.)
const TERMOS_CUSTOS_FIXOS = [
  "aluguel",
  "moradia",
  "salario",
  "salarios",
  "folha",
  "folguista",
  "adicional noturno",
  "vale alimentacao",
  "internet",
  "luz",
  "energia",
  "agua",
  "telefone",
  "condominio",
  "iptu",
  "seguro",
  "contador",
  "contabilidade",
  "marketing",
  "limpeza",
];

export function usePontoEquilibrio() {
  const hojeStr = getHojeSaoPaulo();
  const [ano, mes] = hojeStr.split("-");
  const inicioMes = `${ano}-${mes}-01`;
  const fimMes = new Date(Number(ano), Number(mes), 0).toISOString().split("T")[0];

  // Vendas consolidadas do dia de hoje (Eyemobile PDV + Divipay + manuais)
  const { receitas: receitasHoje } = useReceitas({ startDate: hojeStr, endDate: hojeStr });
  // Despesas do mês para apuração de custos fixos reais
  const { despesas: despesasMes } = useDespesas({ startDate: inicioMes, endDate: fimMes });
  const { dividas } = useDividas();
  const { recorrentes } = useRecurringTransactions();

  return useMemo(() => {
    // Vendas consolidadas do dia de hoje
    const vendasHoje = receitasHoje.reduce((s, r) => s + Number(r.valor || 0), 0);

    // 1. Despesas fixas do mês (apenas categorias e descrições estritamente fixas, NUNCA saques da Divipay)
    const fixasDespesas = despesasMes
      .filter(d => {
        // Exclui saques dinâmicos da Divipay (são despesas variáveis operacionais)
        if (d.id?.startsWith("divipay-")) return false;
        if (d.status && d.status !== "pago") return false;

        const nomeCatNorm = normalizeText(d.categorias?.nome);
        const descNorm = normalizeText(d.descricao);

        if (nomeCatNorm.includes("divipay") || nomeCatNorm.includes("transferencia")) return false;

        return TERMOS_CUSTOS_FIXOS.some(termo =>
          nomeCatNorm === termo || nomeCatNorm.includes(termo) || descNorm.includes(termo)
        );
      })
      .reduce((s, d) => s + Number(d.valor || 0), 0);

    // 2. Recorrentes fixas do mês (usar como proxy se não houver lançamentos)
    const fixasRecorrentes = recorrentes
      .filter(r => r.ativo && r.tipo_transacao === "despesa")
      .reduce((s, r) => s + Number(r.valor), 0);

    // Usa o maior valor entre despesas fixas registradas e recorrentes (fallback inteligente)
    const fixas = Math.max(fixasDespesas, fixasRecorrentes);

    // Se não há custos fixos (nem despesas fixas lançadas nem recorrentes ativas),
    // não há base para apuração de ponto de equilíbrio operacional.
    // Evita calcular meta artificial espúria (ex: dívida residual de comida gerando meta de R$ 1,65).
    if (fixas <= 0) {
      return {
        pontoEquilibrio: 0,
        vendasHoje,
        percentual: 0,
        custoFixoDiario: 0,
      };
    }

    // 3. Parcelas de dívidas a vencer no mês (somadas aos custos fixos existentes)
    const parcelas = dividas
      .filter(d => d.status !== "quitada" && d.data_vencimento >= inicioMes && d.data_vencimento <= fimMes)
      .reduce((s, d) => s + (d.parcelas > 1 ? Number(d.valor_total) / d.parcelas : Number(d.valor_restante)), 0);

    const diasUteis = 26;
    const margemContribuicao = 0.70; // Margem de contribuição (1 - CMV de 30%)
    const custoFixoDiario = (fixas + parcelas) / diasUteis;
    const pontoEquilibrio = custoFixoDiario / margemContribuicao;

    // Se vendasHoje >= pontoEquilibrio, limitar visualmente a 100%; caso contrário, calcular o percentual real
    const percentual = pontoEquilibrio > 0
      ? (vendasHoje >= pontoEquilibrio ? 100 : Number(((vendasHoje / pontoEquilibrio) * 100).toFixed(2)))
      : 0;

    return { pontoEquilibrio, vendasHoje, percentual, custoFixoDiario };
  }, [receitasHoje, despesasMes, dividas, recorrentes, inicioMes, fimMes]);
}
