// Lógica PURA de match da conciliação Divipay (sem acesso a banco).
// Separada do service para ser testável de forma isolada.
//
// Motor de 3 camadas:
//  1. auto     → documento do favorecido (CPF/CNPJ) bate + valor dentro da tolerância
//  2. pendente → valor bate (±tolerância, janela de data) mas falta confirmação humana
//  3. avulsa   → sem candidato plausível: vira despesa avulsa

export interface SaqueParaConciliar {
  externalId: string;
  tipo: string | null; // 'DICT' (Pix) | 'BILLET' (boleto)
  favorecidoNome: string | null;
  favorecidoDocumento: string | null;
  valor: number;
  taxa: number;
  dataPagamento: string; // ISO
  descricao: string | null;
}

export interface DividaCandidata {
  id: string;
  descricao: string;
  credor: string;
  documento_favorecido: string | null;
  valor_restante: number;
  data_vencimento: string; // yyyy-mm-dd
}

export type ResultadoMatch =
  | { camada: "auto"; divida: DividaCandidata }
  | { camada: "pendente"; dividaSugerida: DividaCandidata | null }
  | { camada: "avulsa" };

export const TOLERANCIA_VALOR = 1.0; // R$ 1,00
export const JANELA_DIAS = 45; // pagamento pode ser antes/depois do vencimento

const STATUS_CONCLUIDOS = new Set([
  "PAID",
  "APPROVED",
  "FINISHED",
  "CONFIRMED",
  "COMPLETED",
  "CONCLUIDO",
  "SUCCESS",
  "SUCCEEDED",
]);

export function isSaqueConcluido(status: string | null | undefined): boolean {
  return STATUS_CONCLUIDOS.has(String(status ?? "").toUpperCase());
}

/** CPF/CNPJ: só dígitos. Chave Pix aleatória/telefone: normaliza mínimo. */
export function normalizarDocumento(doc: string | null | undefined): string {
  if (!doc) return "";
  const digits = doc.replace(/\D/g, "");
  // Se tinha letras (chave aleatória tipo UUID), mantém original em minúsculas
  if (/[a-zA-Z]/.test(doc)) return doc.trim().toLowerCase();
  return digits;
}

export function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nomes "parecidos": um contém o outro (trecho ≥ 4 chars) ou ≥60% dos tokens em comum. */
export function nomesParecidos(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return false;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;

  const tokensA = new Set(na.split(" ").filter((t) => t.length >= 3));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length >= 3));
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  let comuns = 0;
  for (const t of tokensA) if (tokensB.has(t)) comuns++;
  const menor = Math.min(tokensA.size, tokensB.size);
  return comuns / menor >= 0.6;
}

function diasEntre(a: string, b: string): number {
  const da = new Date(a.length === 10 ? `${a}T12:00:00` : a);
  const db = new Date(b.length === 10 ? `${b}T12:00:00` : b);
  return Math.abs(da.getTime() - db.getTime()) / 86_400_000;
}

function valorBate(valorDivida: number, valorSaque: number): boolean {
  return Math.abs(valorDivida - valorSaque) <= TOLERANCIA_VALOR;
}

/**
 * Avalia um saque concluído contra as dívidas abertas e decide a camada.
 * Regra de ouro: documento divergente (quando a dívida TEM documento) elimina a candidata.
 */
export function avaliarSaque(saque: SaqueParaConciliar, dividasAbertas: DividaCandidata[]): ResultadoMatch {
  const docSaque = normalizarDocumento(saque.favorecidoDocumento);

  const candidatas = dividasAbertas
    .filter((d) => d.valor_restante > 0)
    .filter((d) => valorBate(d.valor_restante, saque.valor))
    .filter((d) => diasEntre(d.data_vencimento, saque.dataPagamento) <= JANELA_DIAS);

  if (candidatas.length === 0) return { camada: "avulsa" };

  // ── Camada 1: match exato por documento ─────────────────────────────
  if (docSaque.length >= 6) {
    const porDocumento = candidatas.filter((d) => {
      const docDivida = normalizarDocumento(d.documento_favorecido);
      return docDivida.length >= 6 && docDivida === docSaque;
    });
    if (porDocumento.length > 0) {
      // desempate: valor mais próximo
      porDocumento.sort(
        (a, b) => Math.abs(a.valor_restante - saque.valor) - Math.abs(b.valor_restante - saque.valor),
      );
      return { camada: "auto", divida: porDocumento[0] };
    }
  }

  // Dívida com documento DIVERGENTE do saque não pode ser candidata (sinal negativo forte)
  const semConflitoDoc = candidatas.filter((d) => {
    const docDivida = normalizarDocumento(d.documento_favorecido);
    if (docDivida.length >= 6 && docSaque.length >= 6) return docDivida === docSaque;
    return true; // dívida sem documento: segue para análise de nome
  });

  if (semConflitoDoc.length === 0) return { camada: "avulsa" };

  // ── Camada 2: valor bate; sugere a mais provável para confirmação ────
  const porNome = semConflitoDoc.filter((d) => nomesParecidos(d.credor, saque.favorecidoNome));
  const pool = porNome.length > 0 ? porNome : semConflitoDoc;
  pool.sort(
    (a, b) => Math.abs(a.valor_restante - saque.valor) - Math.abs(b.valor_restante - saque.valor),
  );
  return { camada: "pendente", dividaSugerida: pool[0] ?? null };
}
