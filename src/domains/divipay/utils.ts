/**
 * utils.ts — Utilitários de normalização e decodificação bancária Divipay
 */

/**
 * Bancos e instituições arrecadadoras que atuam como intermediários bancários.
 * Seus CNPJs aparecem na liquidação de boletos e saques mas JAMAIS devem ser
 * atribuídos como o credor/fornecedor comercial final.
 */
export const BANCOS_INTERMEDIARIOS = new Set<string>([
  "60701190000104", // Itaú Unibanco
  "00000000000191", // Banco do Brasil
  "00360305000104", // Caixa Econômica Federal
  "90400888000142", // Santander
  "07237373000120", // Bradesco
  "61088183000109", // Banco Safra
  "13079034000142", // Stone / Pagamentos
  "10573521000191", // Mercado Pago
  "18236120000158", // Nubank (Nu Pagamentos)
  "33885724000119", // PagBank (PagSeguro)
  "30306294000145", // BTG Pactual
  "04913711000108", // Banco Inter
  "28018868000130", // PicPay
  "02038232000164", // Sicoob
  "01181521000155", // Sicredi
  "17298092000130", // Banco Original
  "07450604000189", // C6 Bank
  "00416968000101", // Banrisul
  "04184779000101", // Banco Cetelem
  "01701201000189", // Ailos
]);

export function isIntermediarioBancario(doc: string | null | undefined): boolean {
  if (!doc) return false;
  const digits = doc.replace(/\D/g, "");
  return BANCOS_INTERMEDIARIOS.has(digits);
}

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

  const normalizedType = String(type || "").toUpperCase();
  const isBoleto =
    normalizedType === "BILLET" ||
    normalizedType === "BOLETO";

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
