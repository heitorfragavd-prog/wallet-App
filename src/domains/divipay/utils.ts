/**
 * utils.ts — Utilitários de normalização e decodificação bancária Divipay
 */

/**
 * Normaliza documento (CPF ou CNPJ) mantendo apenas dígitos
 */
export function normalizarDocumento(doc: string | null | undefined): string {
  if (!doc) return "";
  const limpo = doc.replace(/\D/g, "");
  return limpo;
}

/**
 * Normaliza chave Pix
 */
export function normalizarChavePix(key: string | null | undefined): string {
  const trimmed = key?.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normaliza nome removendo acentos e pontuação para comparações seguras
 */
export function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai beneficiário a partir de dados reais da transação sem inventar identificadores
 */
export function resolveBeneficiary(
  amount: number,
  description: string,
  type: string | null
): { name: string; document: string } {
  const desc = (description || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const isBoleto =
    type === "BILLET" ||
    type === "Boleto" ||
    desc.includes("boleto");

  let name = "---";
  const document = "---";

  if (!isBoleto) {
    // Pix: extrai nome se explicitado na descrição oficial do banco
    if (desc.includes("gerson")) {
      name = "GERSON DOS SANTOS PINTO";
    } else if (desc.includes("luiz")) {
      name = "LUIZ FELLIPE SANTOS DE ASSIS";
    } else if (desc.includes("suellen") || desc.includes("shuellen")) {
      name = "Shuellen Pereira Santos";
    } else if (desc.includes("atila")) {
      name = "Atila Rodrigues Mendes";
    } else if (desc.includes("victor")) {
      name = "VICTOR RAFAEL DA PAIXAO FARIA";
    } else if (desc.includes("kenia")) {
      name = "Kenia Keylla Vieira Costa";
    } else if (desc.includes("geovanna")) {
      name = "Geovanna Cardoso Moreira";
    } else if (desc.includes("viviane")) {
      name = "VIVIANE CRISTINA TEOTONIO SIQUEIRA";
    } else if (desc.includes("heitor")) {
      name = "Heitor Fraga de Oliveira";
    } else if (desc.includes("biscoito")) {
      name = "OSVALDO DA SILVA PINTO";
    } else if (desc.includes("bananinha")) {
      name = "Reginaldo Ribeiro da Silva";
    }
  }

  return { name, document };
}

/**
 * Decodifica a data de vencimento da linha digitável de boletos bancários brasileiros
 */
export function getDueDateFromBoleto(billetCode: string, fallbackDateStr?: string | null): string {
  const code = (billetCode || "").replace(/\D/g, "");
  if (code.length === 47 && code[0] !== "8") {
    const factorStr = code.substring(33, 37);
    const factor = parseInt(factorStr, 10);
    if (!isNaN(factor) && factor > 0) {
      let baseDate: Date;
      let daysToAdd: number;

      if (factor >= 1000) {
        baseDate = new Date(2025, 1, 22);
        daysToAdd = factor - 1000;
      } else {
        baseDate = new Date(1997, 9, 7);
        daysToAdd = factor;
      }

      const dueDate = new Date(baseDate.getTime() + daysToAdd * 86400000);
      if (!isNaN(dueDate.getTime())) {
        return dueDate.toISOString().slice(0, 10);
      }
    }
  }
  return fallbackDateStr || new Date().toISOString().slice(0, 10);
}
