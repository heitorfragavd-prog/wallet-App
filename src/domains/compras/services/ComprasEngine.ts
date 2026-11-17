/**
 * Motor Operacional de Compras da Rodo Point (Etapa 4C - Gates 5, 11 e 12)
 * 
 * Regras Operacionais:
 * - Fórmula base: MAX(0, REF - Estoque Confirmado) (Gate 2/11).
 * - Sem Estoque Zero Falso: Não calcula quantidade sugerida se o estoque estiver pendente de conferência (Gate 2).
 * - Aumento temporário com período de validade: retorna à referência base após expirar (Gate 11).
 * - Limite de segurança: aplicado apenas a canais online ou itens com limite configurado (Gate 4).
 * - Formatações exatas por fornecedor (Gate 5):
 *   - Salgados: "🔸 SALGADOS – QUANTIDADE PARA COMPRAR\n190 | Coxinha = 90" (REF à esquerda, QTD à direita)
 *   - Coca-Cola / Ambev: "Coca 350ml zero = 2" (apenas produto e quantidade, sem ref nem estoque)
 *   - Ceasa Balas e Doces: Categorias (Trident, Halls, Mentos, Balas, Doces/Chocolates, Salgadinhos/Pipocas) com "Produto = qtd"
 *   - Padrão: "- Produto: qtd unidade"
 * - Modo Simulação preservado por padrão.
 */

export interface ItemCalculoCompra {
  produto_nome: string;
  categoria?: string;
  unidade_medida?: string;
  quantidade_referencia: number;
  estoque_atual?: number | null;
  status_estoque?: "pendente_contagem" | "confirmado_zero" | "confirmado_positivo" | "inconsistente";
  limite_max_sugerido?: number | null;
  canal_compra?: "direto" | "online" | "distribuidor" | "representante";
}

export interface ItemPedidoSugerido {
  produto_nome: string;
  categoria: string;
  unidade_medida: string;
  quantidade_referencia: number;
  estoque_atual: number | null;
  quantidade_sugerida: number | null;
  quantidade_ajustada: number | null;
  limite_aplicado: boolean;
  status_estoque: "pendente_contagem" | "confirmado_zero" | "confirmado_positivo" | "inconsistente";
}

export interface OpcoesCalculoCompra {
  aumentoTemporarioPct?: number;
  aumentoValidadeInicio?: string; // YYYY-MM-DD
  aumentoValidadeFim?: string;    // YYYY-MM-DD
  dataOperacional?: string;       // YYYY-MM-DD
  fornecedorNome?: string;
  canalCompra?: "direto" | "online" | "distribuidor" | "representante";
  formatoLista?: "padrao" | "salgados_soma" | "bebidas_sem_ref" | "ceasa_categorias";
  modoSimulacao?: boolean;
}

export interface ResultadoPedidoFornecedor {
  fornecedorNome: string;
  formatoLista: "padrao" | "salgados_soma" | "bebidas_sem_ref" | "ceasa_categorias";
  statusPedido: "aguardando_estoque" | "estoque_incompleto" | "pedido_calculado" | "aguardando_aprovacao";
  totalItensSugeridos: number;
  totalItensPendentes: number;
  totalUnidadesSugeridas: number;
  itens: ItemPedidoSugerido[];
  todosItens?: ItemPedidoSugerido[];
  textoFormatado: string;
  textoMensagemConversasLoja: string;
  modoSimulacao: boolean;
  aumentoTemporarioPct: number;
  aumentoAtivo: boolean;
}

/**
 * Valida se um aumento temporário está vigente na data operacional (Gate 11)
 */
export function isAumentoTemporarioAtivo(
  dataOperacionalStr: string,
  inicioStr?: string,
  fimStr?: string
): boolean {
  if (!inicioStr && !fimStr) return true; // Sem restrição de validade explícita

  const dataOp = new Date(dataOperacionalStr + "T12:00:00Z").getTime();
  if (inicioStr) {
    const dataIni = new Date(inicioStr + "T00:00:00Z").getTime();
    if (dataOp < dataIni) return false;
  }
  if (fimStr) {
    const dataFim = new Date(fimStr + "T23:59:59Z").getTime();
    if (dataOp > dataFim) return false;
  }
  return true;
}

/**
 * Categorias canônicas para Ceasa Balas e Doces (Gate 5.4)
 */
export const CATEGORIAS_CEASA_BALAS = [
  "Trident",
  "Halls",
  "Mentos",
  "Balas",
  "Doces e Chocolates",
  "Salgadinhos e Pipocas",
];

/**
 * Determina a categoria canônica de um item da Ceasa Balas e Doces
 */
export function classificarCategoriaCeasaBalas(produtoNome: string, categoriaOriginal?: string): string {
  const norm = produtoNome.toLowerCase();
  if (norm.includes("trident")) return "Trident";
  if (norm.includes("halls")) return "Halls";
  if (norm.includes("mentos")) return "Mentos";
  if (norm.includes("salgadinho") || norm.includes("pipoca") || norm.includes("torcida") || norm.includes("amendoim")) return "Salgadinhos e Pipocas";
  if (norm.includes("bala") || norm.includes("drops") || norm.includes("pirulito") || norm.includes("chiclete")) return "Balas";
  if (norm.includes("chocolate") || norm.includes("doce") || norm.includes("bombom") || norm.includes("barra") || norm.includes("wafer")) return "Doces e Chocolates";
  return categoriaOriginal || "Balas e Doces";
}

/**
 * Calcula a sugestão de compra para uma lista de produtos de um fornecedor (Gate 5, 11 e 12)
 */
export function calcularSugestaoCompra(
  itens: ItemCalculoCompra[],
  opcoes: OpcoesCalculoCompra = {}
): ResultadoPedidoFornecedor {
  const fornecedorNome = opcoes.fornecedorNome || "Fornecedor";
  const formatoLista = opcoes.formatoLista || (fornecedorNome.toLowerCase().includes("salgado") ? "salgados_soma" : "padrao");
  const canalCompra = opcoes.canalCompra || "direto";
  const modoSimulacao = opcoes.modoSimulacao !== false;
  const dataHoje = opcoes.dataOperacional || new Date().toISOString().split("T")[0];

  // Gate 11: Verifica validade do aumento temporário
  let aumentoPct = Number(opcoes.aumentoTemporarioPct || 0);
  let aumentoAtivo = false;
  if (aumentoPct > 0) {
    aumentoAtivo = isAumentoTemporarioAtivo(dataHoje, opcoes.aumentoValidadeInicio, opcoes.aumentoValidadeFim);
    if (!aumentoAtivo) {
      aumentoPct = 0; // Expirou validade, retorna à referência normal
    }
  }

  const itensSugeridos: ItemPedidoSugerido[] = [];
  const todosItensAvaliados: ItemPedidoSugerido[] = [];
  let totalUnidadesSugeridas = 0;
  let totalItensPendentes = 0;
  let totalItensCalculados = 0;

  for (const item of itens) {
    const ref = Number(item.quantidade_referencia || 0);
    const refAjustada = ref > 0 ? ref * (1 + aumentoPct / 100) : 0;

    let sugerida: number | null = null;
    let estoqueInformado: number | null = null;
    let limiteAplicado = false;
    let statusItem: "pendente_contagem" | "confirmado_zero" | "confirmado_positivo" | "inconsistente" = "pendente_contagem";

    // Determina status de estoque a partir dos dados do item
    if (item.status_estoque) {
      statusItem = item.status_estoque;
      if (item.status_estoque === "confirmado_zero") {
        estoqueInformado = 0;
      } else if (item.status_estoque === "confirmado_positivo") {
        estoqueInformado = Number(item.estoque_atual || 0);
      } else {
        estoqueInformado = null;
      }
    } else if (item.estoque_atual !== undefined && item.estoque_atual !== null) {
      estoqueInformado = Number(item.estoque_atual);
      statusItem = estoqueInformado === 0 ? "confirmado_zero" : "confirmado_positivo";
    }

    // Gate 2: Nunca calcula com estoque zero falso se estiver pendente
    if (statusItem === "confirmado_zero" || statusItem === "confirmado_positivo") {
      sugerida = Math.max(0, Math.ceil(refAjustada - (estoqueInformado || 0)));

      // Gate 4: Limite aplicado estritamente a canal online ou quando limite_max_sugerido é configurado
      const limite = item.limite_max_sugerido;
      if (canalCompra === "online" || (limite !== null && limite !== undefined && limite > 0)) {
        const teto = limite && limite > 0 ? limite : 50;
        if (sugerida > teto) {
          sugerida = teto;
          limiteAplicado = true;
        }
      }

      if (sugerida > 0) {
        totalUnidadesSugeridas += sugerida;
        totalItensCalculados++;
      }
    } else {
      sugerida = null;
      totalItensPendentes++;
    }

    const itemObj: ItemPedidoSugerido = {
      produto_nome: item.produto_nome,
      categoria: item.categoria || "Geral",
      unidade_medida: item.unidade_medida || "unidade",
      quantidade_referencia: ref,
      estoque_atual: estoqueInformado,
      quantidade_sugerida: sugerida,
      quantidade_ajustada: sugerida,
      limite_aplicado: limiteAplicado,
      status_estoque: statusItem,
    };

    todosItensAvaliados.push(itemObj);
    if (sugerida !== null && sugerida > 0) {
      itensSugeridos.push(itemObj);
    }
  }

  // Gate 12: Ciclo de vida do status do pedido
  let statusPedido: "aguardando_estoque" | "estoque_incompleto" | "pedido_calculado" | "aguardando_aprovacao";
  if (totalItensPendentes === 0 && (totalItensCalculados > 0 || todosItensAvaliados.length > 0)) {
    statusPedido = "pedido_calculado";
  } else if (totalItensCalculados > 0 && totalItensPendentes > 0) {
    statusPedido = "estoque_incompleto";
  } else {
    statusPedido = "aguardando_estoque";
  }

  // Geração do texto formatado conforme o padrão do fornecedor (Gate 5)
  const textoFormatado = formatarPedidoPorFornecedor(todosItensAvaliados, fornecedorNome, formatoLista);
  const textoMensagemConversasLoja = gerarMensagemConversasLoja(
    textoFormatado,
    fornecedorNome,
    modoSimulacao,
    aumentoPct,
    statusPedido
  );

  return {
    fornecedorNome,
    formatoLista,
    statusPedido,
    totalItensSugeridos: totalItensCalculados,
    totalItensPendentes,
    totalUnidadesSugeridas,
    itens: itensSugeridos,
    todosItens: todosItensAvaliados,
    textoFormatado,
    textoMensagemConversasLoja,
    modoSimulacao,
    aumentoTemporarioPct: aumentoPct,
    aumentoAtivo,
  };
}

/**
 * Formata o pedido de acordo com o padrão operacional exigido para cada fornecedor (Gate 5)
 */
export function formatarPedidoPorFornecedor(
  itens: ItemPedidoSugerido[],
  fornecedorNome: string,
  formato: "padrao" | "salgados_soma" | "bebidas_sem_ref" | "ceasa_categorias"
): string {
  if (itens.length === 0) {
    return `Nenhum item cadastrado para ${fornecedorNome}.`;
  }

  const itensCalculados = itens.filter((it) => it.quantidade_sugerida !== null);
  const itensPendentes = itens.filter((it) => it.status_estoque === "pendente_contagem" || it.status_estoque === "inconsistente");

  switch (formato) {
    case "salgados_soma": {
      // Gate 5.1: Título exato: "🔸 SALGADOS – QUANTIDADE PARA COMPRAR"
      // Formato: "190 | Coxinha = 90" (REF à esquerda, QTD à direita)
      // Não coloca soma total no início nem comentários operacionais
      const linhas: string[] = ["🔸 SALGADOS – QUANTIDADE PARA COMPRAR"];
      for (const it of itens) {
        if (it.quantidade_sugerida !== null) {
          linhas.push(`${it.quantidade_referencia} | ${it.produto_nome} = ${it.quantidade_sugerida}`);
        } else {
          linhas.push(`${it.quantidade_referencia} | ${it.produto_nome} = [aguardando contagem]`);
        }
      }
      return linhas.join("\n");
    }

    case "bebidas_sem_ref": {
      // Gate 5.2 e 5.3: Coca-Cola e Ambev
      // Formato para vendedor: "Coca 350ml zero = 2"
      // Não exibe referência nem estoque informado
      const linhas: string[] = [];
      for (const it of itensCalculados) {
        if (it.quantidade_sugerida !== null && it.quantidade_sugerida > 0) {
          linhas.push(`${it.produto_nome} = ${it.quantidade_sugerida}`);
        }
      }
      if (itensPendentes.length > 0) {
        linhas.push(`\n[Itens Pendentes de Conferência: ${itensPendentes.map((p) => p.produto_nome).join(", ")}]`);
      }
      return linhas.length > 0 ? linhas.join("\n") : `Estoque suficiente para ${fornecedorNome}.`;
    }

    case "ceasa_categorias": {
      // Gate 5.4: Ceasa Balas e Doces organizado pelas categorias oficiais:
      // Trident, Halls, Mentos, Balas, Doces e Chocolates, Salgadinhos e Pipocas
      // Formato: "Produto = quantidade a comprar" (sem referência)
      const categoriasMap = new Map<string, ItemPedidoSugerido[]>();

      for (const it of itensCalculados) {
        if (it.quantidade_sugerida !== null && it.quantidade_sugerida > 0) {
          const cat = classificarCategoriaCeasaBalas(it.produto_nome, it.categoria);
          if (!categoriasMap.has(cat)) categoriasMap.set(cat, []);
          categoriasMap.get(cat)!.push(it);
        }
      }

      const blocos: string[] = [`📦 PEDIDO — ${fornecedorNome.toUpperCase()}`];
      for (const [cat, catItens] of categoriasMap.entries()) {
        if (catItens.length > 0) {
          blocos.push(`\n[${cat}]`);
          for (const it of catItens) {
            // Se tiver unidade de caixa/kg/maço e não for Ceasa Balas puro, formata com prefixo hífen (compatibilidade hortifruti)
            if (it.unidade_medida && it.unidade_medida !== "unidade" && it.unidade_medida !== "display") {
              blocos.push(`- ${it.produto_nome}: ${it.quantidade_sugerida} ${it.unidade_medida}`);
            } else {
              blocos.push(`${it.produto_nome} = ${it.quantidade_sugerida}`);
            }
          }
        }
      }
      return blocos.join("\n");
    }

    case "padrao":
    default: {
      // Padrão limpo: Sellpack, 3 Corações, Cigarros, Elma Chips, etc.
      const linhas: string[] = [`📦 PEDIDO — ${fornecedorNome.toUpperCase()}`];
      for (const it of itensCalculados) {
        if (it.quantidade_sugerida !== null && it.quantidade_sugerida > 0) {
          linhas.push(`- ${it.produto_nome}: ${it.quantidade_sugerida} ${it.unidade_medida}`);
        }
      }
      return linhas.join("\n");
    }
  }
}

/**
 * Prepara a mensagem para envio ao grupo 'Conversas da Loja'
 */
export function gerarMensagemConversasLoja(
  textoPedido: string,
  fornecedorNome: string,
  modoSimulacao: boolean,
  aumentoPct: number,
  statusPedido: string = "pedido_calculado"
): string {
  const dataHoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const cabecalhoSimulacao = modoSimulacao
    ? `🧪 <b>[MODO SIMULAÇÃO — ETAPA 4C]</b>\n<i>Nenhum pedido real foi transmitido ao fornecedor externo.</i>\n`
    : `🚀 <b>[PEDIDO OFICIAL DE COMPRAS]</b>\n`;

  const infoAumento = aumentoPct > 0 ? `\n📈 <i>Aumento temporário aplicado: +${aumentoPct}%</i>` : "";
  const infoStatus = statusPedido === "pedido_calculado" 
    ? `✅ <b>Estoque 100% conferido</b>` 
    : `⏳ <b>Aguardando contagem física de itens</b>`;

  return `${cabecalhoSimulacao}
🏪 <b>RODO POINT — SUGESTÃO DIÁRIA DE COMPRAS (09h00)</b>
📅 Data: ${dataHoje} | Fornecedor: <b>${fornecedorNome}</b> | ${infoStatus}${infoAumento}

<pre>${textoPedido}</pre>

⚠️ <i>Gerente: revise as quantidades antes de aprovar o pedido no Wallet CEO.</i>`;
}
