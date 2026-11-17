/**
 * Motor de Compras Automáticas da Rodo Point (Etapa 4 - Gates B1 a B10)
 * 
 * Regras Operacionais:
 * - Fórmula base: MAX(0, REF - Estoque Atual)
 * - Aumento temporário: 0%, 25%, 50%
 * - Teto de segurança: Limite de 50 unidades (produtos online)
 * - Formatação personalizada por tipo de fornecedor (Salgados, Bebidas, Ceasa, Padrão)
 * - Modo Simulação ativo por padrão
 */

export interface ItemCalculoCompra {
  produto_nome: string;
  categoria?: string;
  unidade_medida?: string;
  quantidade_referencia: number;
  estoque_atual: number;
  limite_max_sugerido?: number;
}

export interface ItemPedidoSugerido {
  produto_nome: string;
  categoria: string;
  unidade_medida: string;
  quantidade_referencia: number;
  estoque_atual: number;
  quantidade_sugerida: number;
  quantidade_ajustada: number;
  limite_aplicado: boolean;
}

export interface OpcoesCalculoCompra {
  aumentoTemporarioPct?: number; // 0, 25, 50, etc.
  fornecedorNome?: string;
  formatoLista?: "padrao" | "salgados_soma" | "bebidas_sem_ref" | "ceasa_categorias";
  modoSimulacao?: boolean;
}

export interface ResultadoPedidoFornecedor {
  fornecedorNome: string;
  formatoLista: "padrao" | "salgados_soma" | "bebidas_sem_ref" | "ceasa_categorias";
  totalItensSugeridos: number;
  totalUnidadesSugeridas: number;
  itens: ItemPedidoSugerido[];
  textoFormatado: string;
  textoMensagemConversasLoja: string;
  modoSimulacao: boolean;
  aumentoTemporarioPct: number;
}

/**
 * Calcula a sugestão de compra para uma lista de produtos de um fornecedor
 */
export function calcularSugestaoCompra(
  itens: ItemCalculoCompra[],
  opcoes: OpcoesCalculoCompra = {}
): ResultadoPedidoFornecedor {
  const aumentoPct = Number(opcoes.aumentoTemporarioPct || 0);
  const fornecedorNome = opcoes.fornecedorNome || "Fornecedor";
  const formatoLista = opcoes.formatoLista || "padrao";
  const modoSimulacao = opcoes.modoSimulacao !== false; // Default true

  const itensSugeridos: ItemPedidoSugerido[] = [];
  let totalUnidadesSugeridas = 0;

  for (const item of itens) {
    const ref = Number(item.quantidade_referencia || 0);
    const estoque = Number(item.estoque_atual || 0);
    const limite = typeof item.limite_max_sugerido === "number" ? item.limite_max_sugerido : 50;

    // Aplicação do aumento temporário sobre a quantidade de referência
    const refAjustada = ref > 0 ? ref * (1 + aumentoPct / 100) : 0;

    // Fórmula base: MAX(0, ceil(REF_AJUSTADA - ESTOQUE))
    let sugerida = Math.max(0, Math.ceil(refAjustada - estoque));
    let limiteAplicado = false;

    // Teto de segurança (ex: 50 unidades para produtos online)
    if (limite > 0 && sugerida > limite) {
      sugerida = limite;
      limiteAplicado = true;
    }

    if (sugerida > 0) {
      totalUnidadesSugeridas += sugerida;
      itensSugeridos.push({
        produto_nome: item.produto_nome,
        categoria: item.categoria || "Geral",
        unidade_medida: item.unidade_medida || "unidade",
        quantidade_referencia: ref,
        estoque_atual: estoque,
        quantidade_sugerida: sugerida,
        quantidade_ajustada: sugerida,
        limite_aplicado: limiteAplicado,
      });
    }
  }

  // Geração do texto formatado conforme o padrão do fornecedor
  const textoFormatado = formatarPedidoPorFornecedor(itensSugeridos, fornecedorNome, formatoLista);
  const textoMensagemConversasLoja = gerarMensagemConversasLoja(
    textoFormatado,
    fornecedorNome,
    modoSimulacao,
    aumentoPct
  );

  return {
    fornecedorNome,
    formatoLista,
    totalItensSugeridos: itensSugeridos.length,
    totalUnidadesSugeridas,
    itens: itensSugeridos,
    textoFormatado,
    textoMensagemConversasLoja,
    modoSimulacao,
    aumentoTemporarioPct: aumentoPct,
  };
}

/**
 * Formata o pedido de acordo com o padrão operacional do fornecedor (Gate B4)
 */
export function formatarPedidoPorFornecedor(
  itens: ItemPedidoSugerido[],
  fornecedorNome: string,
  formato: "padrao" | "salgados_soma" | "bebidas_sem_ref" | "ceasa_categorias"
): string {
  if (itens.length === 0) {
    return `Estoque suficiente. Nenhum item a pedir para ${fornecedorNome}.`;
  }

  switch (formato) {
    case "salgados_soma": {
      // Salgados: soma total de caixas no início: "Total | Produto = qtd, ..."
      const totalCaixas = itens.reduce((sum, it) => sum + it.quantidade_sugerida, 0);
      const detalhes = itens
        .map((it) => `${it.produto_nome} = ${it.quantidade_sugerida}`)
        .join(", ");
      return `📦 PEDIDO — ${fornecedorNome.toUpperCase()}\n${totalCaixas} | ${detalhes}`;
    }

    case "bebidas_sem_ref": {
      // Coca-Cola / Ambev: apenas produto e quantidade em caixas/unidades (sem exibir referência)
      const linhas = itens.map((it) => {
        const unid = it.unidade_medida.toLowerCase().includes("cx") || it.unidade_medida.toLowerCase().includes("caixa")
          ? "cx"
          : it.unidade_medida;
        return `${it.produto_nome} = ${it.quantidade_sugerida} ${unid}`;
      });
      return `📦 PEDIDO — ${fornecedorNome.toUpperCase()}\n${linhas.join("\n")}`;
    }

    case "ceasa_categorias": {
      // Ceasa: organizado por categorias (Frutas, Legumes, Folhas, etc.)
      const categoriasMap = new Map<string, ItemPedidoSugerido[]>();
      for (const it of itens) {
        const cat = it.categoria || "Hortifruti";
        if (!categoriasMap.has(cat)) categoriasMap.set(cat, []);
        categoriasMap.get(cat)!.push(it);
      }

      const blocos: string[] = [`📦 PEDIDO — ${fornecedorNome.toUpperCase()}`];
      for (const [cat, catItens] of categoriasMap.entries()) {
        blocos.push(`\n[${cat}]`);
        for (const it of catItens) {
          blocos.push(`- ${it.produto_nome}: ${it.quantidade_sugerida} ${it.unidade_medida}`);
        }
      }
      return blocos.join("\n");
    }

    case "padrao":
    default: {
      // Padrão limpo: Sellpack, 3 Corações, Cigarros, Elma Chips, etc.
      const linhas = itens.map((it) => `- ${it.produto_nome}: ${it.quantidade_sugerida} ${it.unidade_medida}`);
      return `📦 PEDIDO — ${fornecedorNome.toUpperCase()}\n${linhas.join("\n")}`;
    }
  }
}

/**
 * Prepara a mensagem final para envio ao grupo 'Conversas da Loja' (Gate B8)
 */
export function gerarMensagemConversasLoja(
  textoPedido: string,
  fornecedorNome: string,
  modoSimulacao: boolean,
  aumentoPct: number
): string {
  const dataHoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const cabecalhoSimulacao = modoSimulacao
    ? `🧪 <b>[MODO SIMULAÇÃO — ETAPA 4]</b>\n<i>Nenhum pedido real foi transmitido ao fornecedor externo.</i>\n`
    : `🚀 <b>[PEDIDO OFICIAL DE COMPRAS]</b>\n`;

  const infoAumento = aumentoPct > 0 ? `\n📈 <i>Aumento temporário aplicado: +${aumentoPct}%</i>` : "";

  return `${cabecalhoSimulacao}
🏪 <b>RODO POINT — SUGESTÃO DIÁRIA DE COMPRAS (09h00)</b>
📅 Data: ${dataHoje} | Fornecedor: <b>${fornecedorNome}</b>${infoAumento}

<pre>${textoPedido}</pre>

⚠️ <i>Gerente: revise as quantidades antes de confirmar o pedido.</i>`;
}
