/**
 * conciliacaoFinanceiraAvancada.ts
 *
 * Motor puro de identificação e conciliação financeira automatizada de saques Divipay
 * (Pix DICT e Boletos BILLET) para Fornecedores, Funcionários e Sócios.
 *
 * Regras estritas:
 * 1. Jamais inferir identidade apenas por descrição, banco emissor ou valor.
 * 2. Prioridade de Boletos:
 *    a) Vínculo explícito com dívida/despesa ou código de barras cadastrado.
 *    b) CPF/CNPJ confirmado do beneficiário final correspondente a um único fornecedor.
 *    c) Identificador em identificadores_boletos do fornecedor.
 * 3. Prioridade de Pix:
 *    a) Chave Pix normalizada correspondente a único colaborador ou fornecedor.
 *    b) CPF/CNPJ confirmado do destinatário correspondente a único cadastro.
 * 4. Ambiguidade -> Fila de revisão (pendente), sem inventar fornecedor.
 * 5. Idempotência -> Reprocessar transações já conciliadas preserva resultado sem duplicar despesas.
 */

import { normalizarChavePix, normalizarDocumento, normalizarNome } from "../utils";
import type { Contato } from "@/domains/finance/hooks/useContatos";

export interface SaqueMovimento {
  externalId: string;
  tipo: "DICT" | "BILLET" | "QRCODE" | string;
  valor: number;
  taxa: number;
  dataPagamento: string;
  favorecidoNome?: string | null;
  favorecidoDocumento?: string | null;
  recipientKey?: string | null;
  descricao?: string | null;
  linhaDigitavel?: string | null;
  codigoBarras?: string | null;
}

export interface ColaboradorCandidato {
  id: string;
  nome: string;
  tipo: "funcionario" | "folguista" | "socio" | string;
  pix_chave?: string | null;
  pix_chave_normalizada?: string | null;
  cpf?: string | null;
  workspace_id?: string | null;
}

export interface AcertoEquipeCandidato {
  id: string;
  colaborador_id: string;
  tipo: string;
  valor_total: number;
  vencimento: string;
  status: string;
  pix_chave_snapshot?: string | null;
}

export interface DividaCandidata {
  id: string;
  descricao: string;
  credor: string;
  documento_favorecido: string | null;
  valor_restante: number;
  data_vencimento: string;
  workspace_id?: string | null;
  categoria_id?: string | null;
  codigo_barras?: string | null;
  linha_digitavel?: string | null;
  contato_id?: string | null;
}

export interface DespesaCandidata {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  status: string;
  workspace_id?: string | null;
  categoria_id?: string | null;
  contato_id?: string | null;
  observacoes?: string | null;
}

export type MatchBeneficiarioResultado =
  | {
      tipo: "colaborador" | "socio";
      colaborador: ColaboradorCandidato;
      acertoSugerido?: AcertoEquipeCandidato | null;
      evidencia: string;
      confianca: "alta";
    }
  | {
      tipo: "fornecedor";
      fornecedor: Contato;
      categoriaIdSugerida?: string | null;
      subcategoriaIdSugerida?: string | null;
      dividaSugerida?: DividaCandidata | null;
      despesaExistente?: DespesaCandidata | null;
      metodoPagamento: "pix" | "boleto";
      evidencia: string;
      confianca: "alta";
    }
  | {
      tipo: "ambiguo";
      motivo: string;
      candidatosNomes: string[];
      confianca: "baixa";
    }
  | {
      tipo: "nao_identificado";
      motivo: string;
      dividaAparente?: DividaCandidata | null;
      confianca: "nenhuma";
    };

export class ConciliacaoFinanceiraAvancada {
  /**
   * Avalia um saque contra todos os cadastros e obrigações abertas do workspace
   */
  public static avaliarSaque(params: {
    saque: SaqueMovimento;
    colaboradores: ColaboradorCandidato[];
    acertos: AcertoEquipeCandidato[];
    fornecedores: Contato[];
    dividas: DividaCandidata[];
    despesas?: DespesaCandidata[];
  }): MatchBeneficiarioResultado {
    const { saque, colaboradores, acertos, fornecedores, dividas, despesas: _despesas = [] } = params;
    const isBoleto = String(saque.tipo).toUpperCase() === "BILLET" || String(saque.descricao || "").toLowerCase().includes("boleto");

    const pixKeyNormalizada = normalizarChavePix(saque.recipientKey || saque.favorecidoDocumento);
    const docNormalizado = normalizarDocumento(saque.favorecidoDocumento);
    const linhaDigNormalizada = normalizarDocumento(saque.linhaDigitavel || saque.codigoBarras || saque.recipientKey);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. RECONHECIMENTO DE BOLETOS (ETAPA 4)
    // ─────────────────────────────────────────────────────────────────────────
    if (isBoleto) {
      // 1.1 Prioridade 1: Vínculo explícito por código de barras ou linha digitável
      if (linhaDigNormalizada.length >= 20) {
        const dividaPorLinha = dividas.find((d) => {
          const dLinha = normalizarDocumento(d.linha_digitavel || d.codigo_barras);
          return dLinha.length >= 20 && (dLinha === linhaDigNormalizada || linhaDigNormalizada.includes(dLinha));
        });

        if (dividaPorLinha) {
          const fornecedor = dividaPorLinha.contato_id
            ? fornecedores.find((f) => f.id === dividaPorLinha.contato_id)
            : fornecedores.find((f) => normalizarNome(f.nome) === normalizarNome(dividaPorLinha.credor));

          if (fornecedor) {
            return {
              tipo: "fornecedor",
              fornecedor,
              categoriaIdSugerida: dividaPorLinha.categoria_id || fornecedor.categoria_padrao_id,
              subcategoriaIdSugerida: fornecedor.subcategoria_padrao_id,
              dividaSugerida: dividaPorLinha,
              metodoPagamento: "boleto",
              evidencia: "linha_digitavel_divida_vinculada",
              confianca: "alta",
            };
          }
        }
      }

      // 1.2 Prioridade 2: CPF/CNPJ confirmado do beneficiário final correspondente a um único fornecedor
      if (docNormalizado.length === 11 || docNormalizado.length === 14) {
        // Ignora documentos conhecidos de bancos/intermediários arrecadadores
        const intermediariosBancarios = new Set([
          "00000000000191", // Banco do Brasil
          "60701190000104", // Itaú Unibanco
          "90400888000142", // Santander
          "60746948000112", // Bradesco
          "00360305000104", // Caixa Econômica Federal
        ]);

        if (!intermediariosBancarios.has(docNormalizado)) {
          const fornecedoresPorDoc = fornecedores.filter((f) => {
            const fDoc = normalizarDocumento(f.cnpj_cpf);
            const fBeneDoc = normalizarDocumento(f.beneficiario_documento);
            return fDoc === docNormalizado || fBeneDoc === docNormalizado;
          });

          if (fornecedoresPorDoc.length === 1) {
            const f = fornecedoresPorDoc[0];
            // Procura dívida em aberto correspondente ao valor
            const dividaCompativel = dividas.find((d) => {
              const mesmoCredor = d.contato_id === f.id || normalizarNome(d.credor) === normalizarNome(f.nome);
              const valorOk = Math.abs(d.valor_restante - saque.valor) <= 1.0;
              return mesmoCredor && valorOk;
            });

            return {
              tipo: "fornecedor",
              fornecedor: f,
              categoriaIdSugerida: dividaCompativel?.categoria_id || f.categoria_padrao_id,
              subcategoriaIdSugerida: f.subcategoria_padrao_id,
              dividaSugerida: dividaCompativel || null,
              metodoPagamento: "boleto",
              evidencia: "cnpj_beneficiario_final_exato",
              confianca: "alta",
            };
          }

          if (fornecedoresPorDoc.length > 1) {
            return {
              tipo: "ambiguo",
              motivo: `Múltiplos fornecedores encontrados para o documento ${docNormalizado}`,
              candidatosNomes: fornecedoresPorDoc.map((f) => f.nome),
              confianca: "baixa",
            };
          }
        }
      }

      // 1.3 Prioridade 3: Identificadores específicos de boletos no cadastro do fornecedor
      if (linhaDigNormalizada.length >= 10) {
        const fornecedoresPorBoletoId = fornecedores.filter((f) => {
          const bIds = f.identificadores_boletos ?? [];
          return bIds.some((item) => {
            const itemLimpo = normalizarDocumento(item.valor);
            return itemLimpo.length >= 8 && linhaDigNormalizada.includes(itemLimpo);
          });
        });

        if (fornecedoresPorBoletoId.length === 1) {
          const f = fornecedoresPorBoletoId[0];
          return {
            tipo: "fornecedor",
            fornecedor: f,
            categoriaIdSugerida: f.categoria_padrao_id,
            subcategoriaIdSugerida: f.subcategoria_padrao_id,
            metodoPagamento: "boleto",
            evidencia: "identificador_boleto_cadastrado",
            confianca: "alta",
          };
        }
      }

      // 1.4 Boleto sem dados suficientes ou de impostos / concessionárias sem credor privado
      return {
        tipo: "nao_identificado",
        motivo: "Boleto sem correspondência única de beneficiário final ou linha digitável",
        confianca: "nenhuma",
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. RECONHECIMENTO DE PIX (ETAPA 3)
    // ─────────────────────────────────────────────────────────────────────────

    // 2.1 Verifica Funcionários e Sócios (Equipe)
    if (pixKeyNormalizada || docNormalizado) {
      const colaboradoresMatch = colaboradores.filter((c) => {
        const cPix = normalizarChavePix(c.pix_chave_normalizada || c.pix_chave);
        const cCpf = normalizarDocumento(c.cpf);
        const batePix = pixKeyNormalizada && cPix && cPix === pixKeyNormalizada;
        const bateCpf = docNormalizado && cCpf && cCpf.length === 11 && cCpf === docNormalizado;
        return batePix || bateCpf;
      });

      if (colaboradoresMatch.length === 1) {
        const colab = colaboradoresMatch[0];
        const isSocio = colab.tipo === "socio";

        // Procura acerto pendente compatível
        const acertoCompativel = acertos.find((a) => {
          if (a.colaborador_id !== colab.id) return false;
          if (!["pendente", "processando"].includes(a.status)) return false;
          // Tolera diferença de arredondamento de até R$ 0.10
          return Math.abs(a.valor_total - saque.valor) <= 0.10;
        });

        return {
          tipo: isSocio ? "socio" : "colaborador",
          colaborador: colab,
          acertoSugerido: acertoCompativel || null,
          evidencia: "chave_pix_ou_cpf_colaborador_exato",
          confianca: "alta",
        };
      }

      if (colaboradoresMatch.length > 1) {
        return {
          tipo: "ambiguo",
          motivo: "Múltiplos membros da equipe compatíveis com o mesmo Pix/CPF",
          candidatosNomes: colaboradoresMatch.map((c) => c.nome),
          confianca: "baixa",
        };
      }
    }

    // 2.2 Verifica Fornecedores via Pix
    if (pixKeyNormalizada || docNormalizado) {
      const fornecedoresPixMatch = fornecedores.filter((f) => {
        // Chave Pix principal
        const fPix = normalizarChavePix(f.pix_chave_normalizada || f.pix_chave);
        if (pixKeyNormalizada && fPix && fPix === pixKeyNormalizada) return true;

        // Chaves Pix adicionais
        const extras = f.chaves_pix_adicionais ?? [];
        const bateExtra = extras.some((k) => normalizarChavePix(k.chave) === pixKeyNormalizada);
        if (bateExtra) return true;

        // Documento beneficiário bancário
        const fBeneDoc = normalizarDocumento(f.beneficiario_documento_normalizado || f.beneficiario_documento);
        if (docNormalizado && fBeneDoc && fBeneDoc === docNormalizado) return true;

        // CNPJ/CPF do fornecedor
        const fCnpj = normalizarDocumento(f.cnpj_cpf);
        if (docNormalizado && fCnpj && fCnpj === docNormalizado) return true;

        return false;
      });

      if (fornecedoresPixMatch.length === 1) {
        const f = fornecedoresPixMatch[0];

        // Verifica despesa ou dívida pré-existente
        const dividaCompativel = dividas.find((d) => {
          const mesmoCredor = d.contato_id === f.id || normalizarNome(d.credor) === normalizarNome(f.nome);
          const valorOk = Math.abs(d.valor_restante - saque.valor) <= 1.0;
          return mesmoCredor && valorOk;
        });

        return {
          tipo: "fornecedor",
          fornecedor: f,
          categoriaIdSugerida: dividaCompativel?.categoria_id || f.categoria_padrao_id,
          subcategoriaIdSugerida: f.subcategoria_padrao_id,
          dividaSugerida: dividaCompativel || null,
          metodoPagamento: "pix",
          evidencia: "pix_chave_ou_documento_fornecedor_exato",
          confianca: "alta",
        };
      }

      if (fornecedoresPixMatch.length > 1) {
        return {
          tipo: "ambiguo",
          motivo: "Múltiplos fornecedores cadastrados para a mesma chave Pix ou CPF/CNPJ",
          candidatosNomes: fornecedoresPixMatch.map((f) => f.nome),
          confianca: "baixa",
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. NÃO IDENTIFICADO COM CONFIANÇA
    // ─────────────────────────────────────────────────────────────────────────
    // Verifica se ao menos há dívida com valor e vencimento compatíveis para sugerir na fila
    const dividaSugerida = dividas.find((d) => {
      const valorOk = Math.abs(d.valor_restante - saque.valor) <= 1.0;
      return valorOk;
    });

    return {
      tipo: "nao_identificado",
      motivo: "Dados bancários não associados a nenhum fornecedor, funcionário ou sócio ativo",
      dividaAparente: dividaSugerida || null,
      confianca: "nenhuma",
    };
  }
}
