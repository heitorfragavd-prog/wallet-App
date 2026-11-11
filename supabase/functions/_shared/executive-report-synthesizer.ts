/**
 * executive-report-synthesizer.ts
 *
 * Módulo de síntese executiva inteligente com Fallback Determinístico Obrigatório
 * para o Relatório Executivo Diário do Wallet CEO.
 * Compatível com Supabase Edge Functions (Deno) e Node.js/Vitest.
 */

import {
  ExecutiveReportFinancialIndicators,
  ExecutiveRecommendation,
  ReportStatus,
} from "./executive-report-types.ts";

export interface SynthesisResult {
  executiveSummary: string;
  recommendations: ExecutiveRecommendation[];
  status: ReportStatus;
  aiModel?: string | null;
  aiTokensUsed: number;
  aiEstimatedCostUsd: number;
  dataQualityAlerts: string[];
}

export interface AiSynthesisOptions {
  indicators: ExecutiveReportFinancialIndicators;
  referenceDate: string; // "YYYY-MM-DD"
  workspaceId: string;
  ownerName?: string;
  geminiApiKey?: string;
  orchestratorUrl?: string;
  serviceRoleKey?: string;
}

/**
 * Gerador 100% Determinístico de Resumo Executivo e Recomendações
 * (Garante funcionamento resiliente caso a IA esteja fora do ar ou sem quota)
 */
export function generateDeterministicSynthesis(
  indicators: ExecutiveReportFinancialIndicators,
  referenceDate: string
): { executiveSummary: string; recommendations: ExecutiveRecommendation[] } {
  const { faturamento, despesas, resultado, produtos, operacao } = indicators;
  const recommendations: ExecutiveRecommendation[] = [];

  // Formatação de valores em BRL
  const fmtBrl = (v: number) =>
    Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // 1. Geração do Resumo Executivo
  const resumoLinhas: string[] = [];
  resumoLinhas.push(`Relatório Executivo referente a ${referenceDate} (${faturamento.diaSemanaOntemNome}).`);

  if (faturamento.faturamentoOntem > 0) {
    let compSemana = "";
    if (faturamento.variacaoOntemVsMediaPercent !== null) {
      const sinal = faturamento.variacaoOntemVsMediaPercent >= 0 ? "+" : "";
      compSemana = ` (${sinal}${faturamento.variacaoOntemVsMediaPercent.toFixed(1)}% vs média de ${faturamento.diaSemanaOntemNome}s)`;
    }
    resumoLinhas.push(
      `Faturamento de ontem: ${fmtBrl(faturamento.faturamentoOntem)} em ${faturamento.pedidosOntem} pedidos (ticket médio de ${fmtBrl(faturamento.ticketMedioOntem || 0)})${compSemana}.`
    );
  } else {
    resumoLinhas.push("Sem movimentação de faturamento registrada para ontem.");
  }

  resumoLinhas.push(
    `No acumulado do mês, o faturamento atinge ${fmtBrl(faturamento.faturamentoMesAcumulado)} contra ${fmtBrl(despesas.despesasMesAcumulado)} em despesas.`
  );

  if (resultado.resultadoOperacional !== 0) {
    const statusRes = resultado.resultadoOperacional >= 0 ? "positivo" : "negativo";
    const margem = resultado.margemOperacionalPercent !== null ? ` (margem de ${resultado.margemOperacionalPercent.toFixed(1)}%)` : "";
    resumoLinhas.push(`Resultado operacional do período: ${fmtBrl(resultado.resultadoOperacional)} ${statusRes}${margem}.`);
  }

  if (despesas.contasVencidasQuantidade > 0) {
    resumoLinhas.push(
      `Atenção financeira: ${despesas.contasVencidasQuantidade} conta(s) vencida(s) totalizando ${fmtBrl(despesas.contasVencidasValor)}.`
    );
  }

  const executiveSummary = resumoLinhas.join(" ");

  // 2. Geração das Recomendações Prioritárias (Até 5)
  let recIndex = 1;

  // Recomendação 1: Queda no Faturamento de Ontem vs Média
  if (faturamento.alertaQueda && faturamento.variacaoOntemVsMediaPercent !== null) {
    recommendations.push({
      numero: recIndex++,
      titulo: `Investigar oscilação de faturamento na ${faturamento.diaSemanaOntemNome}`,
      problemaOuOportunidade: `O faturamento de ontem (${fmtBrl(faturamento.faturamentoOntem)}) ficou ${Math.abs(faturamento.variacaoOntemVsMediaPercent).toFixed(1)}% abaixo da média histórica do dia.`,
      evidencia: `Média das últimas 4 semanas para ${faturamento.diaSemanaOntemNome} é de ${fmtBrl(faturamento.mediaDiaSemanaOntem || 0)}.`,
      impactoEstimado: `Recuperação de até ${fmtBrl((faturamento.mediaDiaSemanaOntem || 0) - faturamento.faturamentoOntem)} por dia equivalente.`,
      grauConfianca: "alto",
      acaoRecomendada: "Verificar o fluxo de clientes no PDV, ruptura de itens do cardápio e funcionamento das maquininhas ou canais de delivery.",
    });
  }

  // Recomendação 2: Contas Vencidas
  if (despesas.contasVencidasQuantidade > 0) {
    recommendations.push({
      numero: recIndex++,
      titulo: "Regularizar passivo vencido para evitar juros e suspensões",
      problemaOuOportunidade: `Existem ${despesas.contasVencidasQuantidade} conta(s) em aberto já com prazo de vencimento expirado.`,
      evidencia: `Total vencido apurado de ${fmtBrl(despesas.contasVencidasValor)}.`,
      impactoEstimado: "Mitigação de juros, multas diárias e bloqueio de fornecedores.",
      grauConfianca: "alto",
      acaoRecomendada: "Priorizar a quitação dos boletos em atraso ou renegociar prazo junto aos credores na central de dívidas.",
    });
  }

  // Recomendação 3: Contas a Vencer nos Próximos 7 Dias
  if (despesas.contasVencer7DiasQuantidade > 0 && recommendations.length < 5) {
    recommendations.push({
      numero: recIndex++,
      titulo: "Planejamento de liquidez para compromissos da semana",
      problemaOuOportunidade: `${despesas.contasVencer7DiasQuantidade} conta(s) têm vencimento previsto para os próximos 7 dias.`,
      evidencia: `Compromissos agendados somam ${fmtBrl(despesas.contasVencer7DiasValor)}.`,
      impactoEstimado: "Preservação do capital de giro e previsibilidade de caixa.",
      grauConfianca: "alto",
      acaoRecomendada: "Conferir a posição de saldo bancário e projetar os recebíveis de cartão/Pix para honrar os compromissos sem cheque especial.",
    });
  }

  // Recomendação 4: Destaque Comercial do Produto Líder
  if (produtos.top5Faturamento.length > 0 && recommendations.length < 5) {
    const topProd = produtos.top5Faturamento[0];
    recommendations.push({
      numero: recIndex++,
      titulo: `Alavancar o carro-chefe "${topProd.nome}"`,
      problemaOuOportunidade: `O item "${topProd.nome}" é o maior gerador de receita do catálogo, com ${fmtBrl(topProd.faturamento)} faturados no mês.`,
      evidencia: `${topProd.quantidade} unidades comercializadas no período analisado.`,
      impactoEstimado: "Potencial incremento de 10% a 15% de margem com combos promocionais.",
      grauConfianca: "medio",
      acaoRecomendada: "Estruturar combo do produto líder associado a acompanhamentos de alta margem bruta (bebidas/sobremesas) no balcão e delivery.",
    });
  }

  // Recomendação 5: Atividades e Tarefas Atrasadas
  if (operacao.atividadesAtrasadasQuantidade > 0 && recommendations.length < 5) {
    recommendations.push({
      numero: recIndex++,
      titulo: "Concluir pendências operacionais atrasadas",
      problemaOuOportunidade: `Identificadas ${operacao.atividadesAtrasadasQuantidade} atividade(s) ou lembrete(s) com data limite expirada.`,
      evidencia: "Registros pendentes na esteira de rotinas e manutenção do workspace.",
      impactoEstimado: "Redução de gargalos operacionais e prevenção de falhas de conformidade.",
      grauConfianca: "medio",
      acaoRecomendada: "Acessar a agenda de lembretes e despachar as rotinas pendentes com os responsáveis operacionais.",
    });
  }

  // Recomendação Suporte (caso haja poucas recomendações específicas)
  if (recommendations.length === 0) {
    recommendations.push({
      numero: 1,
      titulo: "Monitoramento de Estabilidade e Crescimento",
      problemaOuOportunidade: "A operação financeira está operando dentro dos parâmetros de normalidade.",
      evidencia: `Faturamento estável em ${fmtBrl(faturamento.faturamentoMesAcumulado)} com contas sob controle.`,
      impactoEstimado: "Consolidação de margem operacional positiva.",
      grauConfianca: "alto",
      acaoRecomendada: "Manter o registro diário de compras e conciliação bancária matinal às 10h.",
    });
  }

  return { executiveSummary, recommendations };
}

/**
 * Síntese Executiva via IA com Fallback Determinístico
 */
export async function synthesizeExecutiveReport(
  options: AiSynthesisOptions
): Promise<SynthesisResult> {
  const { indicators, referenceDate, geminiApiKey } = options;
  const dataQualityAlerts: string[] = [];

  // Se não houver chave de IA configurada, ativa imediatamente o fallback determinístico
  if (!geminiApiKey) {
    const det = generateDeterministicSynthesis(indicators, referenceDate);
    return {
      executiveSummary: det.executiveSummary,
      recommendations: det.recommendations,
      status: "fallback_deterministic",
      aiModel: "deterministic_engine_v1",
      aiTokensUsed: 0,
      aiEstimatedCostUsd: 0,
      dataQualityAlerts: ["Chave de IA não informada. Relatório sintetizado pelo motor determinístico."],
    };
  }

  try {
    const promptContext = JSON.stringify({
      dataReferencia: referenceDate,
      faturamento: indicators.faturamento,
      despesas: indicators.despesas,
      resultado: indicators.resultado,
      topProdutos: indicators.produtos.top5Faturamento,
      operacao: indicators.operacao,
    });

    const systemPrompt = `Você é o Wallet CEO 3.0, conselheiro executivo estratégico de alta precisão.
Analise os indicadores financeiros reais e produza:
1. "executiveSummary": Um parágrafo executivo conciso, direto e sem rodeios, resumindo o dia de ontem e o mês.
2. "recommendations": Uma lista de até 5 recomendações prioritárias, onde cada uma tem:
   - "numero": inteiro
   - "titulo": frase curta
   - "problemaOuOportunidade": texto
   - "evidencia": dados numéricos comprovados
   - "impactoEstimado": estimativa financeira ou operacional
   - "grauConfianca": "alto", "medio" ou "baixo"
   - "acaoRecomendada": instrução prática e clara

Responda ESTRITAMENTE em formato JSON puro:
{
  "executiveSummary": "...",
  "recommendations": [...]
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12 segundos timeout

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: systemPrompt },
              { text: `Dados reais do dia:\n${promptContext}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Falha no Gemini: HTTP ${response.status}`);
    }

    const resJson = await response.json();
    const textResp = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResp) {
      throw new Error("Resposta vazia da IA");
    }

    const parsed = JSON.parse(textResp);
    if (!parsed.executiveSummary || !Array.isArray(parsed.recommendations)) {
      throw new Error("Estrutura JSON da IA incompatível");
    }

    const tokensUsed = resJson.usageMetadata?.totalTokenCount || 450;
    const estimatedCost = (tokensUsed / 1_000_000) * 0.15; // Custo estimado Flash

    return {
      executiveSummary: parsed.executiveSummary,
      recommendations: parsed.recommendations.slice(0, 5),
      status: "completed",
      aiModel: "gemini-1.5-flash",
      aiTokensUsed: tokensUsed,
      aiEstimatedCostUsd: Number(estimatedCost.toFixed(6)),
      dataQualityAlerts,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    dataQualityAlerts.push(`Síntese IA indisponível (${errMsg}). Ativado Fallback Determinístico do Wallet CEO.`);

    const fallback = generateDeterministicSynthesis(indicators, referenceDate);
    return {
      executiveSummary: fallback.executiveSummary,
      recommendations: fallback.recommendations,
      status: "fallback_deterministic",
      aiModel: "deterministic_engine_v1",
      aiTokensUsed: 0,
      aiEstimatedCostUsd: 0,
      dataQualityAlerts,
    };
  }
}
