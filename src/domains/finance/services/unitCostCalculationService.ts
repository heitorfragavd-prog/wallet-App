/**
 * WALLET APP — Motor de Cálculo de Custos, Conversão de Embalagens e Lucro Bruto Unitário
 * Módulo: unitCostCalculationService.ts
 * Domínio: Financeiro / Precificação e Custos (Gates 2, 3, 4 e 5)
 *
 * Princípios e Invariantes:
 * 1. FAIL-CLOSED NA CONVERSÃO DE EMBALAGENS (Gate 3):
 *    - Nunca assumir fator = 1 arbitrariamente quando unidades forem distintas.
 *    - Nunca presumir peso, rendimento ou quantidade por embalagem sem evidência comprovada
 *      (especificação de fábrica, dados da NF ou confirmação explícita de ficha técnica).
 *    - Fator deve ser estritamente numérico, positivo, finito e maior que zero.
 * 2. SEGREGAÇÃO CONTÁBIL ESTRITA (Gate 4):
 *    - Lucro Bruto Unitário = Preço de Venda - Custo Unitário Convertido (CMV Unitário).
 *    - Margem Bruta % = (Lucro Bruto / Preço de Venda) * 100.
 *    - Markup % = (Lucro Bruto / Custo Unitário) * 100.
 *    - Markup Multiplicador = Preço de Venda / Custo Unitário.
 *    - NUNCA confundir Lucro Bruto com Lucro Líquido: o lucro bruto não deduz despesas
 *      operacionais, fixas, tributos sobre a venda ou despesas financeiras.
 * 3. RATEIO PROPORCIONAL DE CUSTOS ACESSÓRIOS DA NF (Gate 4):
 *    - Rateio proporcional de frete, seguro, outras despesas acessórias e descontos globais
 *      baseado no peso financeiro do item (valor dos produtos do item / total produtos NF).
 *    - Tributos não recuperáveis (ex: ST, IPI) somados ao custo de aquisição.
 * 4. HISTÓRICO DETERMINÍSTICO E IMUTÁVEL DE CUSTOS (Gate 5):
 *    - Ordenação estritamente cronológica por data de compra.
 *    - Cálculo de variação percentual entre compras consecutivas.
 *    - Alerta quando a variação for superior ao limiar (default: 10%).
 * 5. SINALIZAÇÃO DE RISCOS DE MARGEM:
 *    - Sem custo cadastrado / pendente de auditoria.
 *    - Prejuízo (margem < 0%).
 *    - Margem crítica (< 15%).
 *    - Margem de atenção (< margem mínima cadastrada, default 30%).
 *    - Margem saudável (>= 30%).
 * 6. OPERAÇÃO PURA (READ-ONLY):
 *    - Funções 100% determinísticas e puras.
 *    - NUNCA altera preços de venda ou estoque automaticamente.
 */

// ─── TIPOS DE CONVERSÃO DE EMBALAGENS (GATE 3) ───────────────────

export type TipoEvidenciaConversao =
  | 'especificacao_fabricante'
  | 'equivalencia_confirmada'
  | 'ficha_tecnica_padrao'
  | 'medicao_aferida';

export interface EvidenciaConversao {
  tipo: TipoEvidenciaConversao;
  descricao: string;
  documentoReferencia?: string; // Ex: "NF 3075523", "Ficha Técnica Coado 10g", etc.
  confirmadoPorUsuario: boolean;
}

export interface RegraConversaoEmbalagem {
  unidadeOrigem: string;  // Ex: "CX", "FD", "PCT", "KG", "L"
  unidadeDestino: string; // Ex: "UN", "SACHE", "DOSE", "G", "ML"
  fatorConversao: number; // Estritamente > 0 (1 unidadeOrigem = fatorConversao unidadesDestino)
  evidencia: EvidenciaConversao;
}

export type ResultadoValidacaoConversao =
  | {
      valido: true;
      fatorConversao: number;
      unidadeOrigem: string;
      unidadeDestino: string;
      evidencia: EvidenciaConversao;
    }
  | {
      valido: false;
      motivo:
        | 'fator_invalido'
        | 'sem_evidencia_conversao'
        | 'unidades_incompativeis_sem_regra'
        | 'conversao_nao_confirmada';
      mensagem: string;
    };

// ─── TIPOS DE CUSTO DE AQUISIÇÃO E RATEIO NF (GATE 4) ────────────

export interface ItemNotaFiscalInput {
  codigoProduto: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotalProdutos: number;
  descontoItem?: number;
  valorFreteItem?: number;
  valorSeguroItem?: number;
  outrasDespesasItem?: number;
  valorIpiItem?: number;
  valorStItem?: number;
}

export interface TotaisNotaFiscalInput {
  numeroNf?: string;
  serieNf?: string;
  chaveAcesso?: string;
  dataEmissao: string; // YYYY-MM-DD ou ISO
  fornecedorNome: string;
  fornecedorCnpj: string;
  valorTotalProdutos: number;
  valorTotalNota?: number;
  valorFreteGlobal?: number;
  valorSeguroGlobal?: number;
  outrasDespesasGlobal?: number;
  valorDescontoGlobal?: number;
  valorStGlobal?: number;
  valorIpiGlobal?: number;
}

export interface ItemCustoAquisicaoRateado {
  codigoProduto: string;
  descricao: string;
  unidadeCompra: string;
  quantidadeCompra: number;
  valorUnitarioBase: number;
  valorProdutosTotal: number;
  pesoRateioPercentual: number;
  freteRateado: number;
  seguroRateado: number;
  outrasDespesasRateadas: number;
  descontoRateado: number;
  tributosAcessorios: number; // IPI + ST
  custoTotalAquisicao: number;
  custoUnitarioAquisicaoCompra: number; // Custo de 1 unidade de compra (ex: 1 CX ou 1 KG)
}

export interface ResultadoRateioNotaFiscal {
  numeroNf?: string;
  dataEmissao: string;
  fornecedorNome: string;
  fornecedorCnpj: string;
  valorTotalProdutos: number;
  custoTotalAquisicaoNota: number;
  itens: ItemCustoAquisicaoRateado[];
}

// ─── TIPOS DE FORMAÇÃO DE PREÇO E MARGEM BRUTA (GATE 4) ──────────

export interface CalculoPrecoUnitarioInput {
  custoUnitarioConvertido: number; // Custo por unidade PDV
  precoVendaAtual?: number | null;
  margemMinimaAlvoPercent?: number; // Default: 30%
}

export type ClassificacaoMargemBruta =
  | 'sem_custo'
  | 'prejuizo'        // Margem < 0%
  | 'margem_critica'   // Margem >= 0% e < 15%
  | 'margem_alerta'    // Margem >= 15% e < alvo (ex: 30%)
  | 'saudavel';        // Margem >= alvo

export interface MetricasLucroBrutoUnitario {
  /** Custo de aquisição unitário convertido na unidade de venda do PDV (CMV unitário) */
  custoUnitarioAquisicao: number;
  /** Preço de venda praticado no PDV */
  precoVenda: number;
  /**
   * Lucro Bruto Unitário = Preço de Venda - Custo Unitário.
   * NOTA CONTÁBIL: Trata-se estritamente de Lucro Bruto (Margem de Contribuição Direta).
   * Não confunda com Lucro Líquido (que desconta tributos sobre venda, comissões, custos fixos e operacionais).
   */
  lucroBrutoUnitario: number;
  /** Margem Bruta % = (Lucro Bruto Unitário / Preço de Venda) * 100 */
  margemBrutaPercent: number;
  /** Markup % = (Lucro Bruto Unitário / Custo Unitário) * 100 */
  markupPercent: number;
  /** Multiplicador de Preço = Preço de Venda / Custo Unitário */
  markupMultiplicador: number;
  /** Classificação de conformidade da margem */
  classificacaoMargem: ClassificacaoMargemBruta;
  /** Sugestão determinística de preço de venda para atingir a margem mínima alvo (informativo) */
  precoVendaSugeridoAlvo: number;
  /** Alerta amigável e acionável para o gestor */
  alertaStatus?: string;
}

// ─── TIPOS DE HISTÓRICO DE CUSTOS (GATE 5) ───────────────────────

export interface RegistroHistoricoCusto {
  id?: string;
  produtoCodigo: string;
  produtoDescricao?: string;
  fornecedor: string;
  fornecedorCnpj?: string;
  numeroNf?: string;
  dataCompra: string; // YYYY-MM-DD
  custoUnitarioAquisicao: number; // Na unidade PDV
  quantidadeComprada?: number;
}

export interface ItemEvolucaoCusto {
  dataCompra: string;
  fornecedor: string;
  numeroNf?: string;
  custoUnitario: number;
  variacaoVsAnteriorPercent: number | null;
  alertaAumentoExpressivo: boolean; // true se aumento >= limiar (ex: 10%)
}

export interface RelatorioEvolucaoCustosProduto {
  produtoCodigo: string;
  totalComprasRegistradas: number;
  primeiroCustoHistorico: number | null;
  ultimoCustoHistorico: number | null;
  menorCustoHistorico: number | null;
  maiorCustoHistorico: number | null;
  variacaoTotalPeriodoPercent: number | null;
  mediaPonderadaCustos: number | null;
  historicoOrdenado: ItemEvolucaoCusto[];
  possuiAumentoRecenteAlerta: boolean;
}

// ─── IMPLEMENTAÇÃO 1: CONVERSÃO SEGURA DE EMBALAGENS (GATE 3) ────

/**
 * Normaliza siglas de unidades comerciais para comparação consistente.
 */
export function normalizarUnidade(u?: string | null): string {
  if (!u) return '';
  return u.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Valida e resolve uma regra de conversão de embalagem de forma estritamente segura (fail-closed).
 * Nunca assume fator = 1 se as unidades forem diferentes ou se faltar evidência documental.
 */
export function validarConversaoEmbalagem(
  unidadeOrigem: string,
  unidadeDestino: string,
  regra?: RegraConversaoEmbalagem | null
): ResultadoValidacaoConversao {
  const origemNorm = normalizarUnidade(unidadeOrigem);
  const destinoNorm = normalizarUnidade(unidadeDestino);

  if (!origemNorm || !destinoNorm) {
    return {
      valido: false,
      motivo: 'unidades_incompativeis_sem_regra',
      mensagem: `Unidades inválidas ou não informadas: origem='${unidadeOrigem}', destino='${unidadeDestino}'.`,
    };
  }

  // Se são exatamente a mesma unidade de contagem direta (ex: UN -> UN, CX -> CX)
  if (origemNorm === destinoNorm) {
    return {
      valido: true,
      fatorConversao: 1,
      unidadeOrigem: origemNorm,
      unidadeDestino: destinoNorm,
      evidencia: {
        tipo: 'medicao_aferida',
        descricao: 'Unidades de compra e venda idênticas (conversão direta 1:1).',
        confirmadoPorUsuario: true,
      },
    };
  }

  // Se as unidades são distintas, a regra com evidência é OBRIGATÓRIA (fail-closed)
  if (!regra) {
    return {
      valido: false,
      motivo: 'unidades_incompativeis_sem_regra',
      mensagem: `Impossível converter '${origemNorm}' para '${destinoNorm}' sem regra com evidência cadastrada. Fator 1 não é presumido por segurança.`,
    };
  }

  if (typeof regra.fatorConversao !== 'number' || isNaN(regra.fatorConversao) || regra.fatorConversao <= 0) {
    return {
      valido: false,
      motivo: 'fator_invalido',
      mensagem: `Fator de conversão inválido (${regra.fatorConversao}). O fator deve ser um número estritamente maior que zero.`,
    };
  }

  if (!regra.evidencia || !regra.evidencia.descricao || regra.evidencia.descricao.trim().length === 0) {
    return {
      valido: false,
      motivo: 'sem_evidencia_conversao',
      mensagem: `Regra de conversão '${origemNorm}' -> '${destinoNorm}' não possui evidência documental registrada. Proibido estimar sem evidência.`,
    };
  }

  if (!regra.evidencia.confirmadoPorUsuario && regra.evidencia.tipo === 'medicao_aferida') {
    return {
      valido: false,
      motivo: 'conversao_nao_confirmada',
      mensagem: `Medição aferida para '${origemNorm}' -> '${destinoNorm}' ainda não foi confirmada por usuário responsável.`,
    };
  }

  return {
    valido: true,
    fatorConversao: regra.fatorConversao,
    unidadeOrigem: origemNorm,
    unidadeDestino: destinoNorm,
    evidencia: regra.evidencia,
  };
}

/**
 * Converte custo de embalagem de compra para custo unitário do PDV de forma fail-closed.
 */
export function converterCustoEmbalagem(
  custoEmbalagemCompra: number,
  unidadeOrigem: string,
  unidadeDestino: string,
  regra?: RegraConversaoEmbalagem | null
): {
  sucesso: boolean;
  custoUnitarioConvertido: number | null;
  fatorAplicado: number | null;
  erro?: string;
} {
  if (typeof custoEmbalagemCompra !== 'number' || isNaN(custoEmbalagemCompra) || custoEmbalagemCompra <= 0) {
    return {
      sucesso: false,
      custoUnitarioConvertido: null,
      fatorAplicado: null,
      erro: `Custo de embalagem inválido (${custoEmbalagemCompra}). Deve ser estritamente maior que zero.`,
    };
  }

  const validacao = validarConversaoEmbalagem(unidadeOrigem, unidadeDestino, regra);
  if (!validacao.valido) {
    return {
      sucesso: false,
      custoUnitarioConvertido: null,
      fatorAplicado: null,
      erro: validacao.mensagem,
    };
  }

  const custoConvertido = custoEmbalagemCompra / validacao.fatorConversao;
  return {
    sucesso: true,
    custoUnitarioConvertido: Math.round(custoConvertido * 10000) / 10000,
    fatorAplicado: validacao.fatorConversao,
  };
}

// ─── IMPLEMENTAÇÃO 2: RATEIO PROPORCIONAL DE NOTA FISCAL (GATE 4) ─

/**
 * Executa o rateio contábil proporcional de frete, outras despesas acessórias,
 * tributos não recuperáveis e descontos da Nota Fiscal entre os itens.
 *
 * Fórmula:
 * Peso do item = valorTotalProdutosItem / valorTotalProdutosNota
 * Despesas Rateadas = (Frete + Seguro + OutrasDespesas) * Peso
 * Descontos Rateados = Descontos * Peso
 * Custo Aquisição = Produtos + Despesas + Tributos (IPI + ST) - Descontos
 */
export function calcularRateioCustoNotaFiscal(
  totaisNf: TotaisNotaFiscalInput,
  itens: ItemNotaFiscalInput[]
): ResultadoRateioNotaFiscal {
  if (!itens || itens.length === 0) {
    throw new Error('A lista de itens da nota fiscal não pode ser vazia para cálculo de rateio.');
  }

  const totalProdutosCalculado = itens.reduce((acc, it) => acc + (it.valorTotalProdutos || 0), 0);
  const baseProdutos = totaisNf.valorTotalProdutos > 0 ? totaisNf.valorTotalProdutos : totalProdutosCalculado;

  if (baseProdutos <= 0) {
    throw new Error('Valor total de produtos da nota fiscal deve ser estritamente maior que zero para rateio.');
  }

  const freteGlobal = Math.max(0, totaisNf.valorFreteGlobal || 0);
  const seguroGlobal = Math.max(0, totaisNf.valorSeguroGlobal || 0);
  const outrasGlobal = Math.max(0, totaisNf.outrasDespesasGlobal || 0);
  const descontoGlobal = Math.max(0, totaisNf.valorDescontoGlobal || 0);

  let somaCustoTotalNota = 0;

  const itensRateados: ItemCustoAquisicaoRateado[] = itens.map((item) => {
    const qtd = item.quantidade > 0 ? item.quantidade : 1;
    const vProd = Math.max(0, item.valorTotalProdutos || item.valorUnitario * qtd);
    const peso = vProd / baseProdutos;

    // Rateio proporcional dos custos acessórios globais
    const freteItem = item.valorFreteItem !== undefined ? item.valorFreteItem : freteGlobal * peso;
    const seguroItem = item.valorSeguroItem !== undefined ? item.valorSeguroItem : seguroGlobal * peso;
    const outrasItem = item.outrasDespesasItem !== undefined ? item.outrasDespesasItem : outrasGlobal * peso;
    const descontoItem = item.descontoItem !== undefined ? item.descontoItem : descontoGlobal * peso;

    // Tributos não compensáveis do item (IPI e ST aumentam o custo de aquisição do varejo)
    const ipiItem = Math.max(0, item.valorIpiItem || 0);
    const stItem = Math.max(0, item.valorStItem || 0);
    const tributosAcessorios = ipiItem + stItem;

    const custoTotalItem = Math.max(0, vProd + freteItem + seguroItem + outrasItem + tributosAcessorios - descontoItem);
    const custoUnitarioCompra = custoTotalItem / qtd;

    somaCustoTotalNota += custoTotalItem;

    return {
      codigoProduto: item.codigoProduto,
      descricao: item.descricao,
      unidadeCompra: item.unidade,
      quantidadeCompra: qtd,
      valorUnitarioBase: Math.round(item.valorUnitario * 10000) / 10000,
      valorProdutosTotal: Math.round(vProd * 100) / 100,
      pesoRateioPercentual: Math.round(peso * 10000) / 100,
      freteRateado: Math.round(freteItem * 100) / 100,
      seguroRateado: Math.round(seguroItem * 100) / 100,
      outrasDespesasRateadas: Math.round(outrasItem * 100) / 100,
      descontoRateado: Math.round(descontoItem * 100) / 100,
      tributosAcessorios: Math.round(tributosAcessorios * 100) / 100,
      custoTotalAquisicao: Math.round(custoTotalItem * 100) / 100,
      custoUnitarioAquisicaoCompra: Math.round(custoUnitarioCompra * 10000) / 10000,
    };
  });

  return {
    numeroNf: totaisNf.numeroNf,
    dataEmissao: totaisNf.dataEmissao,
    fornecedorNome: totaisNf.fornecedorNome,
    fornecedorCnpj: totaisNf.fornecedorCnpj,
    valorTotalProdutos: Math.round(baseProdutos * 100) / 100,
    custoTotalAquisicaoNota: Math.round(somaCustoTotalNota * 100) / 100,
    itens: itensRateados,
  };
}

// ─── IMPLEMENTAÇÃO 3: FORMAÇÃO DE PREÇO E MARGEM BRUTA UNITÁRIA (GATE 4) ───

/**
 * Calcula metricamente Preço de Venda, Lucro Bruto Unitário, Margem Bruta % e Markup.
 * Garante segregação contábil inequívoca: Lucro Bruto NÃO é Lucro Líquido.
 * NUNCA altera preços de venda no catálogo.
 */
export function calcularMetricasLucroBrutoUnitario(
  input: CalculoPrecoUnitarioInput
): MetricasLucroBrutoUnitario {
  const custo = input.custoUnitarioConvertido;
  const precoVenda = input.precoVendaAtual ?? 0;
  const margemAlvo = input.margemMinimaAlvoPercent ?? 30.0;

  // Caso 1: Produto sem custo cadastrado ou com custo zero/negativo
  if (typeof custo !== 'number' || isNaN(custo) || custo <= 0) {
    return {
      custoUnitarioAquisicao: 0,
      precoVenda: precoVenda > 0 ? precoVenda : 0,
      lucroBrutoUnitario: 0,
      margemBrutaPercent: 0,
      markupPercent: 0,
      markupMultiplicador: 0,
      classificacaoMargem: 'sem_custo',
      precoVendaSugeridoAlvo: 0,
      alertaStatus: 'Produto sem custo cadastrado. Necessita conferência de nota fiscal.',
    };
  }

  // Preço de venda sugerido para atingir a margem mínima alvo:
  // PV = Custo / (1 - (margemAlvo / 100))
  const divisorMargem = 1 - margemAlvo / 100;
  const precoSugerido = divisorMargem > 0 ? custo / divisorMargem : custo * 1.5;

  // Caso 2: Produto com custo, mas sem preço de venda ou preço zero
  if (precoVenda <= 0) {
    return {
      custoUnitarioAquisicao: Math.round(custo * 10000) / 10000,
      precoVenda: 0,
      lucroBrutoUnitario: -custo,
      margemBrutaPercent: -100,
      markupPercent: -100,
      markupMultiplicador: 0,
      classificacaoMargem: 'prejuizo',
      precoVendaSugeridoAlvo: Math.round(precoSugerido * 100) / 100,
      alertaStatus: 'Produto com preço de venda zerado ou não cadastrado no PDV.',
    };
  }

  const lucroBruto = precoVenda - custo;
  const margemBrutaPct = (lucroBruto / precoVenda) * 100;
  const markupPct = (lucroBruto / custo) * 100;
  const markupMultiplicador = precoVenda / custo;

  let classificacao: ClassificacaoMargemBruta = 'saudavel';
  let alerta: string | undefined;

  if (lucroBruto < 0) {
    classificacao = 'prejuizo';
    alerta = `Atenção Crítica: Produto com prejuízo bruto unitário de R$ ${Math.abs(lucroBruto).toFixed(2)} por unidade vendida.`;
  } else if (margemBrutaPct < 15.0) {
    classificacao = 'margem_critica';
    alerta = `Margem bruta crítica (${margemBrutaPct.toFixed(1)}%). Abaixo do patamar mínimo de sustentação (15%).`;
  } else if (margemBrutaPct < margemAlvo) {
    classificacao = 'margem_alerta';
    alerta = `Margem bruta baixa (${margemBrutaPct.toFixed(1)}%). Meta estabelecida: ${margemAlvo.toFixed(1)}%.`;
  } else {
    classificacao = 'saudavel';
  }

  return {
    custoUnitarioAquisicao: Math.round(custo * 10000) / 10000,
    precoVenda: Math.round(precoVenda * 100) / 100,
    lucroBrutoUnitario: Math.round(lucroBruto * 100) / 100,
    margemBrutaPercent: Math.round(margemBrutaPct * 10) / 10,
    markupPercent: Math.round(markupPct * 10) / 10,
    markupMultiplicador: Math.round(markupMultiplicador * 100) / 100,
    classificacaoMargem: classificacao,
    precoVendaSugeridoAlvo: Math.round(precoSugerido * 100) / 100,
    alertaStatus: alerta,
  };
}

// ─── IMPLEMENTAÇÃO 4: HISTÓRICO DE EVOLUÇÃO DE CUSTOS (GATE 5) ───

/**
 * Analisa a evolução cronológica dos custos de aquisição de um produto,
 * calculando variações percentuais, tendência e alertando aumentos expressivos (>= 10%).
 */
export function calcularEvolucaoCustosProduto(
  registros: RegistroHistoricoCusto[],
  limiarAumentoExpressivoPercent: number = 10.0
): RelatorioEvolucaoCustosProduto {
  if (!registros || registros.length === 0) {
    return {
      produtoCodigo: '',
      totalComprasRegistradas: 0,
      primeiroCustoHistorico: null,
      ultimoCustoHistorico: null,
      menorCustoHistorico: null,
      maiorCustoHistorico: null,
      variacaoTotalPeriodoPercent: null,
      mediaPonderadaCustos: null,
      historicoOrdenado: [],
      possuiAumentoRecenteAlerta: false,
    };
  }

  const produtoCodigo = registros[0].produtoCodigo;

  // Ordenação estritamente cronológica por dataCompra (mais antiga primeiro)
  const ordenados = [...registros].sort((a, b) => {
    const timeA = new Date(a.dataCompra).getTime();
    const timeB = new Date(b.dataCompra).getTime();
    return timeA - timeB;
  });

  let menorCusto = Infinity;
  let maiorCusto = -Infinity;
  let somaCustosPonderados = 0;
  let somaQuantidades = 0;

  const historicoComVariacao: ItemEvolucaoCusto[] = [];
  let ultimoAumentoAlerta = false;

  for (let i = 0; i < ordenados.length; i++) {
    const atual = ordenados[i];
    const custo = atual.custoUnitarioAquisicao;
    const qtd = atual.quantidadeComprada && atual.quantidadeComprada > 0 ? atual.quantidadeComprada : 1;

    if (custo < menorCusto) menorCusto = custo;
    if (custo > maiorCusto) maiorCusto = custo;

    somaCustosPonderados += custo * qtd;
    somaQuantidades += qtd;

    let variacao: number | null = null;
    let alerta = false;

    if (i > 0) {
      const anterior = ordenados[i - 1].custoUnitarioAquisicao;
      if (anterior > 0) {
        variacao = Math.round(((custo - anterior) / anterior) * 1000) / 10;
        if (variacao >= limiarAumentoExpressivoPercent) {
          alerta = true;
        }
      }
    }

    if (i === ordenados.length - 1 && alerta) {
      ultimoAumentoAlerta = true;
    }

    historicoComVariacao.push({
      dataCompra: atual.dataCompra,
      fornecedor: atual.fornecedor,
      numeroNf: atual.numeroNf,
      custoUnitario: Math.round(custo * 10000) / 10000,
      variacaoVsAnteriorPercent: variacao,
      alertaAumentoExpressivo: alerta,
    });
  }

  const primeiroCusto = ordenados[0].custoUnitarioAquisicao;
  const ultimoCusto = ordenados[ordenados.length - 1].custoUnitarioAquisicao;

  let variacaoTotal: number | null = null;
  if (primeiroCusto > 0) {
    variacaoTotal = Math.round(((ultimoCusto - primeiroCusto) / primeiroCusto) * 1000) / 10;
  }

  const mediaPonderada = somaQuantidades > 0 ? somaCustosPonderados / somaQuantidades : null;

  return {
    produtoCodigo,
    totalComprasRegistradas: ordenados.length,
    primeiroCustoHistorico: Math.round(primeiroCusto * 10000) / 10000,
    ultimoCustoHistorico: Math.round(ultimoCusto * 10000) / 10000,
    menorCustoHistorico: menorCusto !== Infinity ? Math.round(menorCusto * 10000) / 10000 : null,
    maiorCustoHistorico: maiorCusto !== -Infinity ? Math.round(maiorCusto * 10000) / 10000 : null,
    variacaoTotalPeriodoPercent: variacaoTotal,
    mediaPonderadaCustos: mediaPonderada !== null ? Math.round(mediaPonderada * 10000) / 10000 : null,
    historicoOrdenado: historicoComVariacao,
    possuiAumentoRecenteAlerta: ultimoAumentoAlerta,
  };
}

// ─── IMPLEMENTAÇÃO 5: SINALIZAÇÃO E AUDITORIA DE CATÁLOGO (GATES 4 & 5) ───

export interface ProdutoCatalogoDiagnosticoInput {
  codigo: string;
  descricao: string;
  precoVenda: number;
  custoAtual: number | null;
  categoria?: string;
  margemAlvoMinima?: number;
}

export interface DiagnosticoCatalogoItem {
  codigo: string;
  descricao: string;
  categoria?: string;
  precoVenda: number;
  custoAtual: number | null;
  lucroBrutoUnitario: number;
  margemBrutaPercent: number;
  markupPercent: number;
  status: ClassificacaoMargemBruta;
  requerAtencao: boolean;
  mensagem: string;
}

export interface RelatorioDiagnosticoCatalogo {
  totalProdutosAnalisados: number;
  totalSemCusto: number;
  totalPrejuizo: number;
  totalMargemCritica: number;
  totalMargemAlerta: number;
  totalSaudavel: number;
  produtosSemCusto: DiagnosticoCatalogoItem[];
  produtosComMargemBaixaOuPrejuizo: DiagnosticoCatalogoItem[];
  produtosSaudaveis: DiagnosticoCatalogoItem[];
}

/**
 * Executa varredura diagnóstica determinística em lote de produtos do catálogo Eyemobile / PDV.
 * Não altera nenhum dado no banco (read-only).
 */
export function diagnosticarMargensCatalogo(
  produtos: ProdutoCatalogoDiagnosticoInput[],
  margemAlvoMinima: number = 30.0
): RelatorioDiagnosticoCatalogo {
  const semCustoList: DiagnosticoCatalogoItem[] = [];
  const alertaOuPrejuizoList: DiagnosticoCatalogoItem[] = [];
  const saudavelList: DiagnosticoCatalogoItem[] = [];

  let countSemCusto = 0;
  let countPrejuizo = 0;
  let countCritica = 0;
  let countAlerta = 0;
  let countSaudavel = 0;

  for (const p of produtos) {
    const custo = p.custoAtual ?? 0;
    const metricas = calcularMetricasLucroBrutoUnitario({
      custoUnitarioConvertido: custo,
      precoVendaAtual: p.precoVenda,
      margemMinimaAlvoPercent: p.margemAlvoMinima ?? margemAlvoMinima,
    });

    const itemDiagnostico: DiagnosticoCatalogoItem = {
      codigo: p.codigo,
      descricao: p.descricao,
      categoria: p.categoria,
      precoVenda: p.precoVenda,
      custoAtual: p.custoAtual,
      lucroBrutoUnitario: metricas.lucroBrutoUnitario,
      margemBrutaPercent: metricas.margemBrutaPercent,
      markupPercent: metricas.markupPercent,
      status: metricas.classificacaoMargem,
      requerAtencao: metricas.classificacaoMargem !== 'saudavel',
      mensagem: metricas.alertaStatus || 'Margem dentro dos parâmetros saudáveis esperados.',
    };

    switch (metricas.classificacaoMargem) {
      case 'sem_custo':
        countSemCusto++;
        semCustoList.push(itemDiagnostico);
        break;
      case 'prejuizo':
        countPrejuizo++;
        alertaOuPrejuizoList.push(itemDiagnostico);
        break;
      case 'margem_critica':
        countCritica++;
        alertaOuPrejuizoList.push(itemDiagnostico);
        break;
      case 'margem_alerta':
        countAlerta++;
        alertaOuPrejuizoList.push(itemDiagnostico);
        break;
      case 'saudavel':
        countSaudavel++;
        saudavelList.push(itemDiagnostico);
        break;
    }
  }

  return {
    totalProdutosAnalisados: produtos.length,
    totalSemCusto: countSemCusto,
    totalPrejuizo: countPrejuizo,
    totalMargemCritica: countCritica,
    totalMargemAlerta: countAlerta,
    totalSaudavel: countSaudavel,
    produtosSemCusto: semCustoList,
    produtosComMargemBaixaOuPrejuizo: alertaOuPrejuizoList,
    produtosSaudaveis: saudavelList,
  };
}
