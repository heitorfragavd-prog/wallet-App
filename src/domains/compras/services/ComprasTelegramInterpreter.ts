/**
 * Interpretador de Mensagens de Estoque via Telegram e IA (Etapa 4C - Gates 6, 7, 8, 9, 10)
 * 
 * Capacidades:
 * - Compreende texto formatado, listas e linguagem natural (Gate 7).
 * - Distingue estoque zero confirmado ("acabou", "zerou") de estoque pendente ("não contei") e não numérico ("tem bastante") (Gate 2/7).
 * - Distingue com precisão sabores, variantes e tamanhos (Coca Zero vs Original, 200ml vs 350ml, Monster, Red Bull) (Gate 7).
 * - Detecta correções ("Corrigindo, são 4") e substitui sem somar indevidamente (Gate 10).
 * - Bloqueia tentativas de injeção de prompt ou comandos administrativos disfarçados (Gate 7/14).
 */

export interface ItemEstoqueInterpretado {
  produto_nome: string;
  quantidade_informada: number | null;
  unidade_medida: string;
  tipo_informacao: "confirmado_zero" | "confirmado_positivo" | "pendente" | "inconsistente";
  confianca: number;
  is_correcao: boolean;
  motivo_inconsistencia?: string;
}

export interface ResultadoInterpretacaoEstoque {
  itens: ItemEstoqueInterpretado[];
  is_correcao_geral: boolean;
  texto_sanitizado: string;
  mensagem_resposta_bot: string;
  todos_conferidos: boolean;
  itens_pendentes: string[];
}

export interface ReferenciaProdutoBase {
  produto_nome: string;
  sinonimos?: string[];
  unidade_medida?: string;
  variante?: string;
}

// Catálogo base de produtos Rodo Point com sinônimos e palavras-chave de desambiguação
export const PRODUTOS_RODO_POINT_REFERENCIAS: ReferenciaProdutoBase[] = [
  // Bebidas - Coca-Cola
  { produto_nome: "Coca 350ml zero", sinonimos: ["coca zero", "coca lata zero", "coca-cola zero", "refrigerante coca zero 350ml", "zero lata", "zero"], unidade_medida: "cx" },
  { produto_nome: "Coca 350ml original", sinonimos: ["coca original", "coca normal", "coca lata", "coca-cola original", "coca comum", "original"], unidade_medida: "cx" },
  { produto_nome: "Coca 200ml", sinonimos: ["coca caçulinha", "coca pequena", "coca 200", "coca mini"], unidade_medida: "cx" },
  { produto_nome: "Monster ENERGY", sinonimos: ["monster", "monster verde", "monster tradicional", "monster energy lata", "monster original"], unidade_medida: "cx" },
  { produto_nome: "Monster Zero", sinonimos: ["monster branco", "monster sem acucar", "monster ultra", "monster zero lata"], unidade_medida: "cx" },

  // Bebidas - Ambev
  { produto_nome: "Pepsi lata", sinonimos: ["pepsi", "pepsi 350ml", "pepsi normal", "refrigerante pepsi"], unidade_medida: "cx" },
  { produto_nome: "Pepsi Black", sinonimos: ["pepsi zero", "pepsi black lata"], unidade_medida: "cx" },
  { produto_nome: "Red Bull 250 ml", sinonimos: ["red bull", "red bull tradicional", "redbull 250", "red bull 250", "red bull pequeno", "redbull lata"], unidade_medida: "cx" },
  { produto_nome: "Red Bull 473 ml", sinonimos: ["red bull grande", "redbull 473", "red bull 473", "red bull latao"], unidade_medida: "cx" },
  { produto_nome: "H2Oh comum", sinonimos: ["h2oh", "h2o limao", "h2o", "h2oh normal"], unidade_medida: "cx" },

  // Salgados
  { produto_nome: "Coxinha", sinonimos: ["coxinha de frango", "coxinha tradicional", "coxinha"], unidade_medida: "unidade" },
  { produto_nome: "Coxinha C/ Catupiry", sinonimos: ["coxinha com catupiry", "coxinha catupiry", "catupiry"], unidade_medida: "unidade" },
  { produto_nome: "Kibe", sinonimos: ["quibe", "kibe frito", "kibe tradicional"], unidade_medida: "unidade" },
  { produto_nome: "Enroladinho de Salsicha", sinonimos: ["enroladinho", "salsicha", "enrolado de salsicha"], unidade_medida: "unidade" },
  { produto_nome: "Pão de Queijo", sinonimos: ["pao de queijo", "pão de queijo tradicional"], unidade_medida: "unidade" },

  // Ceasa Balas e Doces
  { produto_nome: "Trident Menta", sinonimos: ["trident verde", "trident menta"], unidade_medida: "display" },
  { produto_nome: "Trident Morango", sinonimos: ["trident rosa", "trident morango"], unidade_medida: "display" },
  { produto_nome: "Halls Preto", sinonimos: ["halls extra forte", "halls preto"], unidade_medida: "display" },
  { produto_nome: "Mentos Fruit", sinonimos: ["mentos frutas", "mentos colorido"], unidade_medida: "display" },
];

/**
 * Sanitiza e remove tentativas de prompt injection ou ordens executivas
 */
export function sanitizarMensagemOperacional(texto: string): string {
  if (!texto) return "";
  let limpo = texto.trim();

  const comandosProibidos = [
    /ignore\s+(previous|all)\s+instructions/gi,
    /aprovar\s+pedido/gi,
    /fazer\s+pagamento/gi,
    /transferir\s+dinheiro/gi,
    /executar\s+comando/gi,
    /sudo\s+/gi,
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  ];

  for (const padrao of comandosProibidos) {
    limpo = limpo.replace(padrao, "[texto desconsiderado]");
  }

  return limpo;
}

/**
 * Normaliza string para comparação fonética/textual tolerante
 */
function normalizar(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Localiza o produto de referência mais aderente, evitando falsos positivos entre variantes
 */
export function identificarProdutoReferencia(
  trecho: string,
  catalogo: ReferenciaProdutoBase[] = PRODUTOS_RODO_POINT_REFERENCIAS
): ReferenciaProdutoBase | null {
  const normTrecho = normalizar(trecho);
  if (!normTrecho) return null;

  const temZero = normTrecho.includes("zero") || normTrecho.includes("black") || normTrecho.includes("sem acucar");
  const temOriginal = normTrecho.includes("original") || normTrecho.includes("comum") || normTrecho.includes("tradicional") || normTrecho.includes("normal");
  const temCatupiry = normTrecho.includes("catupiry");
  const tem200 = normTrecho.includes("200") || normTrecho.includes("caculinha") || normTrecho.includes("mini");
  const _tem350 = normTrecho.includes("350") || normTrecho.includes("lata");
  const tem250 = normTrecho.includes("250");
  const tem473 = normTrecho.includes("473") || normTrecho.includes("latao") || normTrecho.includes("grande");

  let melhorMatch: ReferenciaProdutoBase | null = null;
  let maiorPontuacao = 0;

  for (const prod of catalogo) {
    const nomesParaTestar = [prod.produto_nome, ...(prod.sinonimos || [])];
    for (const nomeTest of nomesParaTestar) {
      const normNome = normalizar(nomeTest);

      const prodEhZero = normNome.includes("zero") || normNome.includes("black");
      const prodEhCatupiry = normNome.includes("catupiry");
      const prodEh200 = normNome.includes("200");
      const prodEh250 = normNome.includes("250");
      const prodEh473 = normNome.includes("473");

      if (temZero && !prodEhZero && (normNome.includes("coca") || normNome === "zero")) continue;
      if (!temZero && temOriginal && prodEhZero && normNome.includes("coca")) continue;
      if (temCatupiry && !prodEhCatupiry && normNome.includes("coxinha")) continue;
      if (!temCatupiry && normTrecho.includes("coxinha") && prodEhCatupiry) continue;
      if (tem200 && !prodEh200 && normNome.includes("coca")) continue;
      if (tem250 && !prodEh250 && normNome.includes("red bull")) continue;
      if (tem473 && !prodEh473 && normNome.includes("red bull")) continue;

      // Verificação de contenção
      const trechoWords = normTrecho.split(" ");
      const nomeWords = normNome.split(" ");
      const matchWords = nomeWords.filter((w) => trechoWords.includes(w));

      if (normTrecho.includes(normNome) || (matchWords.length === nomeWords.length && nomeWords.length > 0)) {
        const pontuacao = normNome.length;
        if (pontuacao > maiorPontuacao) {
          maiorPontuacao = pontuacao;
          melhorMatch = prod;
        }
      }
    }
  }

  return melhorMatch;
}

/**
 * Converte palavras numéricas em números (ex: "duas" -> 2, "quinze" -> 15)
 */
function converterPalavraParaNumero(palavra: string): number | null {
  const mapa: Record<string, number> = {
    zero: 0,
    um: 1, uma: 1,
    dois: 2, duas: 2,
    tres: 3, três: 3,
    quatro: 4,
    cinco: 5,
    seis: 6, meia: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
    treze: 13,
    quatorze: 14, catorze: 14,
    quinze: 15,
    dezesseis: 16,
    dezessete: 17,
    dezoito: 18,
    dezenove: 19,
    vinte: 20,
    trinta: 30,
    quarenta: 40,
    cinquenta: 50,
  };
  const norm = normalizar(palavra);
  if (mapa[norm] !== undefined) return mapa[norm];
  const num = Number(palavra.replace(",", "."));
  return !isNaN(num) ? num : null;
}

/**
 * Interpreta uma mensagem (texto direto, transcrição de áudio ou OCR de foto)
 */
export function interpretarMensagemEstoque(
  textoOriginal: string,
  catalogo: ReferenciaProdutoBase[] = PRODUTOS_RODO_POINT_REFERENCIAS,
  produtosEsperados: string[] = []
): ResultadoInterpretacaoEstoque {
  const textoLimpo = sanitizarMensagemOperacional(textoOriginal);
  const normTexto = normalizar(textoLimpo);

  const isCorrecao = 
    normTexto.includes("corrigindo") || 
    normTexto.includes("na verdade") || 
    normTexto.includes("ops") || 
    normTexto.includes("retificando") ||
    normTexto.includes("errei");

  const textoGlobalTemZero = 
    normTexto.includes("acabou") || 
    normTexto.includes("zerou") || 
    normTexto.includes("nao tem") || 
    normTexto.includes("sem estoque");

  const itensInterpretados: ItemEstoqueInterpretado[] = [];
  const produtosEncontrados = new Set<string>();

  // 1. Dividir texto em linhas ou separadores comuns ("\n", ",", ";", " e ")
  const segmentos = textoLimpo
    .split(/[\n;]|,\s*(?=[a-zA-ZÀ-ÿ])|\be\b(?=\s+(?:o|a|os|as|[a-zA-ZÀ-ÿ0-9]))/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const seg of segmentos) {
    const normSeg = normalizar(seg);
    if (!normSeg) continue;

    // Detecta se é aviso de pendência
    const isPendente = 
      normSeg.includes("nao contei") || 
      normSeg.includes("nao consegui contar") || 
      normSeg.includes("falta contar") || 
      normSeg.includes("nao deu tempo") ||
      normSeg.includes("pendente");

    // Detecta se é aviso de zero estrito (não confunde com "Coca Zero"!)
    const isZero = 
      normSeg.includes("acabou") || 
      normSeg.includes("zerou") || 
      normSeg.includes("nao tem") || 
      normSeg.includes("sem estoque") ||
      normSeg.includes("ta zerado") ||
      normSeg.includes("esta zerado") ||
      textoGlobalTemZero ||
      /[=:]\s*0\b/.test(seg);

    // Detecta se é impreciso ("tem bastante", "tem muito", "pouco")
    const isImpreciso = 
      normSeg.includes("bastante") || 
      normSeg.includes("muito") || 
      normSeg.includes("pouco") || 
      normSeg.includes("cheio");

    // Identifica qual produto o segmento menciona
    const prodRef = identificarProdutoReferencia(seg, catalogo);
    if (!prodRef) continue;

    produtosEncontrados.add(prodRef.produto_nome);

    if (isPendente) {
      itensInterpretados.push({
        produto_nome: prodRef.produto_nome,
        quantidade_informada: null,
        unidade_medida: prodRef.unidade_medida || "unidade",
        tipo_informacao: "pendente",
        confianca: 0.95,
        is_correcao: isCorrecao,
      });
      continue;
    }

    // Extrair quantidade numérica isolando o que não é o nome do produto
    let qtdExtraida: number | null = null;

    if (seg.includes("=") || seg.includes(":")) {
      const partes = seg.split(/[=:]/);
      const parteValor = partes[partes.length - 1].trim();
      const matchNum = parteValor.match(/(\d+(?:[.,]\d+)?|\b(?:zero|um|uma|dois|duas|tres|três|quatro|cinco|seis|meia|sete|oito|nove|dez|quinze|vinte)\b)/i);
      if (matchNum) {
        qtdExtraida = converterPalavraParaNumero(matchNum[1]);
      }
    } else {
      // Remove menções de mililitros e nomes de produtos com 'zero' para não confundir com a quantidade
      let segSemProd = seg
        .replace(/\b\d+\s*ml\b/gi, "")
        .replace(/350|200|473|250/g, "");

      if (normalizar(prodRef.produto_nome).includes("zero")) {
        segSemProd = segSemProd.replace(/coca\s*(?:350ml\s*)?zero/gi, "").replace(/monster\s*zero/gi, "").replace(/pepsi\s*zero/gi, "");
      }

      const matchNum = segSemProd.match(/(\d+(?:[.,]\d+)?|\b(?:zero|um|uma|dois|duas|tres|três|quatro|cinco|seis|meia|sete|oito|nove|dez|quinze|vinte)\b)/i);
      if (matchNum) {
        qtdExtraida = converterPalavraParaNumero(matchNum[1]);
      }
    }

    if (qtdExtraida !== null && !isNaN(qtdExtraida)) {
      itensInterpretados.push({
        produto_nome: prodRef.produto_nome,
        quantidade_informada: qtdExtraida,
        unidade_medida: prodRef.unidade_medida || "unidade",
        tipo_informacao: qtdExtraida === 0 ? "confirmado_zero" : "confirmado_positivo",
        confianca: 0.95,
        is_correcao: isCorrecao,
      });
      continue;
    }

    if (isZero) {
      itensInterpretados.push({
        produto_nome: prodRef.produto_nome,
        quantidade_informada: 0,
        unidade_medida: prodRef.unidade_medida || "unidade",
        tipo_informacao: "confirmado_zero",
        confianca: 0.98,
        is_correcao: isCorrecao,
      });
      continue;
    }

    if (isImpreciso) {
      itensInterpretados.push({
        produto_nome: prodRef.produto_nome,
        quantidade_informada: null,
        unidade_medida: prodRef.unidade_medida || "unidade",
        tipo_informacao: "inconsistente",
        confianca: 0.60,
        is_correcao: isCorrecao,
        motivo_inconsistencia: "Informação qualitativa sem quantidade numérica exata",
      });
      continue;
    }
  }

  // Identificar pendências em relação aos produtos esperados
  const itensPendentes: string[] = [];
  if (produtosEsperados.length > 0) {
    for (const esp of produtosEsperados) {
      if (!produtosEncontrados.has(esp)) {
        itensPendentes.push(esp);
      }
    }
  }

  // Montar resposta do bot para o Telegram
  let mensagemBot = "";
  if (itensInterpretados.length === 0) {
    mensagemBot = "⚠️ Não consegui identificar os produtos ou quantidades nesta mensagem. Por favor, envie no formato: <code>Produto = Quantidade</code> ou fale claramente os itens.";
  } else {
    const linhasConfirmadas = itensInterpretados
      .filter((it) => it.tipo_informacao === "confirmado_positivo" || it.tipo_informacao === "confirmado_zero")
      .map((it) => `• <b>${it.produto_nome}</b>: ${it.quantidade_informada} ${it.unidade_medida}`);

    const linhasInconsistentes = itensInterpretados
      .filter((it) => it.tipo_informacao === "inconsistente")
      .map((it) => `⚠️ <b>${it.produto_nome}</b>: ${it.motivo_inconsistencia} (precisa do número exato)`);

    const linhasPendentes = itensInterpretados
      .filter((it) => it.tipo_informacao === "pendente")
      .map((it) => `⏳ <b>${it.produto_nome}</b>: contagem marcada como pendente`);

    const secoes: string[] = [];
    if (isCorrecao) {
      secoes.push("🔄 <b>Correção registrada com sucesso!</b>");
    } else {
      secoes.push("📝 <b>Estoque recebido:</b>");
    }

    if (linhasConfirmadas.length > 0) {
      secoes.push(linhasConfirmadas.join("\n"));
    }
    if (linhasInconsistentes.length > 0) {
      secoes.push("\n" + linhasInconsistentes.join("\n"));
    }
    if (linhasPendentes.length > 0) {
      secoes.push("\n" + linhasPendentes.join("\n"));
    }

    if (itensPendentes.length > 0) {
      secoes.push(`\n⏳ <b>Ainda falta informar:</b>\n` + itensPendentes.map((p) => `- ${p}`).join("\n"));
    } else if (linhasInconsistentes.length === 0 && linhasPendentes.length === 0) {
      secoes.push("\n🎉 <b>Todos os itens foram conferidos!</b> O pedido foi calculado e está disponível para aprovação administrativa.");
    }

    mensagemBot = secoes.join("\n");
  }

  return {
    itens: itensInterpretados,
    is_correcao_geral: isCorrecao,
    texto_sanitizado: textoLimpo,
    mensagem_resposta_bot: mensagemBot,
    todos_conferidos: itensPendentes.length === 0 && itensInterpretados.every((i) => i.tipo_informacao === "confirmado_zero" || i.tipo_informacao === "confirmado_positivo"),
    itens_pendentes: itensPendentes,
  };
}
