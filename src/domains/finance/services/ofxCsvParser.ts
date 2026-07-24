/**
 * Service: OFX & CSV Parser para Extratos Bancários Brasileiros
 *
 * Suporta arquivos .ofx, .qfx (SGML / FEBRABAN) e .csv (Nubank, Itaú, Bradesco, BB, Inter, Santander, C6, etc.)
 */

export interface ParsedTransaction {
  fitid?: string;
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number; // Positivo para receitas, negativo para despesas
  tipo: "receita" | "despesa";
  categoriaSugerida: string;
  jaExiste?: boolean;
}

/**
 * Mapeia palavras-chave da descrição para sugerir categorias automaticamente
 */
export function sugerirCategoriaPorDescricao(descricao: string): string {
  const d = (descricao || "").toLowerCase();

  if (d.includes("uber") || d.includes("99") || d.includes("posto") || d.includes("combust") || d.includes("estacionamento") || d.includes("pedagio")) {
    return "Transporte";
  }
  if (d.includes("ifood") || d.includes("restaurante") || d.includes("padaria") || d.includes("lanche") || d.includes("burger") || d.includes("pizza") || d.includes("comida")) {
    return "Alimentação";
  }
  if (d.includes("mercado") || d.includes("carrefour") || d.includes("extra") || d.includes("pao de acucar") || d.includes("assai") || d.includes("atacadao")) {
    return "Mercado";
  }
  if (d.includes("netflix") || d.includes("spotify") || d.includes("prime") || d.includes("hbo") || d.includes("disney") || d.includes("cinema") || d.includes("ingress")) {
    return "Lazer";
  }
  if (d.includes("farmacia") || d.includes("drogaria") || d.includes("droga") || d.includes("raia") || d.includes("pague menos") || d.includes("hospital") || d.includes("lab")) {
    return "Saúde";
  }
  if (d.includes("enel") || d.includes("cemig") || d.includes("copel") || d.includes("sabesp") || d.includes("luz") || d.includes("agua") || d.includes("aluguel")) {
    return "Moradia";
  }
  if (d.includes("salario") || d.includes("provendo") || d.includes("pagamento de salario") || d.includes("pix recebido") || d.includes("transferencia recebida")) {
    return "Salário";
  }

  return "Outros";
}

/**
 * Parseia a data do formato OFX (ex: 20260722120000[-3:BRT] -> 2026-07-22)
 */
function parseOfxDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const clean = dateStr.trim().replace(/[^0-9]/g, "");
  if (clean.length >= 8) {
    const ano = clean.substring(0, 4);
    const mes = clean.substring(4, 6);
    const dia = clean.substring(6, 8);
    return `${ano}-${mes}-${dia}`;
  }
  return new Date().toISOString().split("T")[0];
}

/**
 * Converte data de string brasileira (DD/MM/YYYY) para ISO (YYYY-MM-DD)
 */
function parseBrDateToIso(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  const parts = dateStr.trim().split(/[\/\-\.]/);
  if (parts.length === 3) {
    let dia = parts[0].padStart(2, "0");
    let mes = parts[1].padStart(2, "0");
    let ano = parts[2];
    if (ano.length === 2) ano = `20${ano}`;
    
    // Se a data já veio YYYY-MM-DD
    if (parts[0].length === 4) {
      return dateStr.trim();
    }
    return `${ano}-${mes}-${dia}`;
  }
  return new Date().toISOString().split("T")[0];
}

/**
 * Parseia extrato bancário formato OFX / QFX
 */
export function parseOfx(ofxContent: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];

  // Encontra todos os blocos <STMTTRN>...</STMTTRN>
  const stmttrnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|<STMTTRN>|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = stmttrnRegex.exec(ofxContent)) !== null) {
    const block = match[1];

    const fitidMatch = block.match(/<FITID>(.*?)(?:\r?\n|<)/i);
    const dateMatch = block.match(/<DTPOSTED>(.*?)(?:\r?\n|<)/i);
    const amountMatch = block.match(/<TRNAMT>(.*?)(?:\r?\n|<)/i);
    const memoMatch = block.match(/<MEMO>(.*?)(?:\r?\n|<)/i);
    const nameMatch = block.match(/<NAME>(.*?)(?:\r?\n|<)/i);

    const rawAmount = amountMatch ? parseFloat(amountMatch[1].trim().replace(",", ".")) : 0;
    const descricao = (nameMatch ? nameMatch[1] : memoMatch ? memoMatch[1] : "Transação Importada").trim();
    const dataIso = dateMatch ? parseOfxDate(dateMatch[1]) : new Date().toISOString().split("T")[0];
    const fitid = fitidMatch ? fitidMatch[1].trim() : undefined;

    if (!isNaN(rawAmount) && rawAmount !== 0) {
      const isReceita = rawAmount > 0;
      transactions.push({
        fitid,
        data: dataIso,
        descricao,
        valor: Math.abs(rawAmount),
        tipo: isReceita ? "receita" : "despesa",
        categoriaSugerida: sugerirCategoriaPorDescricao(descricao),
      });
    }
  }

  return transactions;
}

/**
 * Parseia extrato bancário formato CSV
 */
export function parseCsv(csvContent: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  // Detecta separador (vírgula ou ponto e vírgula)
  const firstLine = lines[0];
  const separator = firstLine.includes(";") ? ";" : ",";

  // Tenta encontrar índices dos cabeçalhos
  const headers = firstLine.toLowerCase().split(separator).map((h) => h.trim().replace(/"/g, ""));
  let dateIdx = headers.findIndex((h) => h.includes("data") || h.includes("date"));
  let descIdx = headers.findIndex((h) => h.includes("desc") || h.includes("historico") || h.includes("memo") || h.includes("title"));
  let valIdx = headers.findIndex((h) => h.includes("valor") || h.includes("amount") || h.includes("vlr"));

  // Fallback se não houver cabeçalhos explícitos
  if (dateIdx === -1) dateIdx = 0;
  if (descIdx === -1) descIdx = 1;
  if (valIdx === -1) valIdx = 2;

  const startRow = (headers.includes("data") || headers.includes("date") || headers.includes("valor")) ? 1 : 0;

  for (let i = startRow; i < lines.length; i++) {
    const cols = lines[i].split(separator).map((c) => c.trim().replace(/"/g, ""));
    if (cols.length <= Math.max(dateIdx, descIdx, valIdx)) continue;

    const rawDate = cols[dateIdx];
    const descricao = cols[descIdx] || "Transação CSV";
    const rawValStr = cols[valIdx]?.replace("R$", "")?.replace(/\s/g, "")?.replace(".", "")?.replace(",", ".") || "0";
    const rawAmount = parseFloat(rawValStr);

    if (!isNaN(rawAmount) && rawAmount !== 0) {
      transactions.push({
        data: parseBrDateToIso(rawDate),
        descricao,
        valor: Math.abs(rawAmount),
        tipo: rawAmount > 0 ? "receita" : "despesa",
        categoriaSugerida: sugerirCategoriaPorDescricao(descricao),
      });
    }
  }

  return transactions;
}

/**
 * Função principal que escolhe o parser apropriado com base no nome/conteúdo do arquivo
 */
export function parseExtratoBancario(fileContent: string, fileName: string): ParsedTransaction[] {
  const nameLower = (fileName || "").toLowerCase();
  if (nameLower.endsWith(".ofx") || nameLower.endsWith(".qfx") || fileContent.includes("<OFX>") || fileContent.includes("<STMTTRN>")) {
    return parseOfx(fileContent);
  }
  return parseCsv(fileContent);
}
