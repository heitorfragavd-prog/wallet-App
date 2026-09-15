import { useMemo } from "react";
import { useReceitas } from "./useReceitas";
import { useDespesas } from "./useDespesas";
import { useDividas } from "./useDividas";
import { useRecurringTransactions } from "./useRecurringTransactions";
import { useColaboradores, type Colaborador } from "./useColaboradores";
import { getHojeSaoPaulo } from "../utils/dateHelpers";

export type NaturezaEconomica =
  | "custo_fixo"
  | "custo_variavel"
  | "cmv"
  | "despesa_financeira"
  | "investimento"
  | "retirada_socio"
  | "outros";

export interface DespesaItemParaClassificacao {
  id?: string | null;
  descricao?: string | null;
  tipo?: string | null;
  categorias?: { nome?: string | null } | null;
}

export type ColaboradorClassificacao = Pick<Colaborador, "nome" | "tipo">;

function normalizeText(text?: string | null): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchPalavraChave(texto: string, padroes: string[]): boolean {
  if (!texto) return false;
  return padroes.some(p => {
    const reg = new RegExp(`(^|\\b|\\s)${p}(\\b|\\s|$)`, "i");
    return reg.test(texto);
  });
}

/**
 * Classifica a natureza econômica de uma despesa, desacoplando a origem/meio financeiro (Divipay, banco, caixa)
 * de sua real função contábil e operacional (Custo Fixo, Custo Variável, CMV, Retirada de Sócio, etc.).
 */
export function classificarNaturezaEconomica(
  despesa: DespesaItemParaClassificacao,
  colaboradores?: ColaboradorClassificacao[] | null
): NaturezaEconomica {
  const descNorm = normalizeText(despesa.descricao);
  const catNorm = normalizeText(despesa.categorias?.nome);
  const textoCompleto = `${catNorm} ${descNorm}`.trim();

  // 1. CMV / Mercadorias para Revenda (Alimentos, Bebidas, Tabacaria e Fornecedores de Estoque)
  const termosCmv = [
    "salgado",
    "salgados",
    "ambev",
    "coca",
    "coca-cola",
    "cigarro",
    "bebida",
    "bebidas",
    "biscoito",
    "bananinha",
    "kek bananinha",
    "sorvete",
    "cerveja",
    "gelo",
    "bomboniere",
    "seu osvaldo",
    "gerson salgados",
    "doces",
    "refrigerante",
    "fornecedor",
  ];
  if (termosCmv.some(termo => catNorm.includes(termo) || descNorm.includes(termo))) {
    return "cmv";
  }

  // 2. Custos Variáveis Operacionais (Folguistas, Diárias sob Demanda, Metas, Comissões, Passagens)
  const termosVariaveis = [
    "folguista",
    "diaria",
    "diarias",
    "meta",
    "metas",
    "passagem",
    "passagens",
    "comissao",
    "comissoes",
    "bonificacao",
    "adicional noturno",
    "vale alimentacao",
    "vale transporte",
  ];
  if (termosVariaveis.some(termo => catNorm.includes(termo) || descNorm.includes(termo))) {
    return "custo_variavel";
  }

  // 3. Retiradas de Sócios e Gastos Pessoais (Não compõem custo operacional fixo da loja)
  const termosSocios = [
    "pro-labore",
    "pro labore",
    "retirada",
    "distribuicao de lucros",
  ];
  if (termosSocios.some(termo => catNorm.includes(termo) || descNorm.includes(termo))) {
    return "retirada_socio";
  }

  // 4. Verificação Estrutural de Colaboradores (Cadastrados no banco de dados)
  if (colaboradores && colaboradores.length > 0) {
    for (const c of colaboradores) {
      const cNomeNorm = normalizeText(c.nome);
      const cPrimeiroNome = cNomeNorm.split(" ")[0];
      const matchColab = (cNomeNorm && descNorm.includes(cNomeNorm)) ||
                         (cPrimeiroNome && cPrimeiroNome.length > 2 && descNorm.includes(cPrimeiroNome));
      if (matchColab) {
        if (c.tipo === "folguista") return "custo_variavel";
        if (c.tipo === "socio") return "retirada_socio";
        if (c.tipo === "funcionario") return "custo_fixo";
      }
    }
  }

  // Fallbacks de identificação de colaboradores conhecidos da loja
  const sociosConhecidos = ["viviane", "heitor"];
  if (sociosConhecidos.some(s => descNorm.includes(s))) {
    return "retirada_socio";
  }

  const folguistasConhecidos = ["victor", "kenia", "luiz"];
  if (folguistasConhecidos.some(f => descNorm.includes(f))) {
    return "custo_variavel";
  }

  // 5. Custos Fixos de Infraestrutura e Utilidades Essenciais
  const termosFixosInfra = [
    "aluguel",
    "moradia",
    "internet",
    "luz",
    "energia",
    "agua",
    "concessionaria",
    "telefone",
    "condominio",
    "iptu",
    "seguro",
    "seguros",
    "contador",
    "contabilidade",
    "limpeza",
    "sistema",
    "software",
  ];
  if (matchPalavraChave(textoCompleto, termosFixosInfra)) {
    return "custo_fixo";
  }

  // 6. Folha de Pagamento Regular (Salário de funcionários fixos)
  const termosFolhaFixa = [
    "salario",
    "salarios",
    "folha",
    "adiantamento salarial",
    "suellen",
    "shuellen",
  ];
  if (termosFolhaFixa.some(termo => catNorm.includes(termo) || descNorm.includes(termo))) {
    return "custo_fixo";
  }

  // 7. Despesas Financeiras
  const termosFinanceiros = [
    "juros",
    "tarifa bancaria",
    "taxa maq",
    "taxa maquineta",
    "anuidade",
  ];
  if (termosFinanceiros.some(termo => catNorm.includes(termo) || descNorm.includes(termo))) {
    return "despesa_financeira";
  }

  // 8. Boletos genéricos sem discriminação
  if (descNorm.includes("pagamento de boleto") || descNorm === "boleto" || descNorm.includes("saque divipay")) {
    return "outros";
  }

  // 9. Tipo estrutural da despesa (se marcado explicitamente como fixo no cadastro)
  if (despesa.tipo === "fixo") {
    return "custo_fixo";
  }

  return "outros";
}

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
  const { data: colaboradores } = useColaboradores();

  return useMemo(() => {
    // Vendas consolidadas do dia de hoje
    const vendasHoje = receitasHoje.reduce((s, r) => s + Number(r.valor || 0), 0);

    // 1. Despesas fixas do mês por classificação econômica (independente da origem/meio financeiro Divipay ou local)
    const fixasDespesas = despesasMes
      .filter(d => {
        if (d.status && d.status !== "pago") return false;
        return classificarNaturezaEconomica(d, colaboradores) === "custo_fixo";
      })
      .reduce((s, d) => s + Number(d.valor || 0), 0);

    // 2. Recorrentes fixas do mês (usar como proxy/piso se não houver lançamentos)
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
  }, [receitasHoje, despesasMes, dividas, recorrentes, colaboradores, inicioMes, fimMes]);
}
