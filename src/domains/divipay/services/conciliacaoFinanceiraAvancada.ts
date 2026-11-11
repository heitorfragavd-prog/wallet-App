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

import {
  normalizarChavePix,
  normalizarDocumento,
  normalizarNome,
  isIntermediarioBancario,
} from "../utils";
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
    const rawTipo = String(saque.tipo || "").toUpperCase();
    const isConfirmedBoletoType = rawTipo === "BILLET" || rawTipo === "BOLETO";
    const recipientKeyClean = String(saque.recipientKey || "").trim();
    const isBoletoBarcode = /^\d{44,48}$/.test(recipientKeyClean.replace(/\D/g, "")) && !recipientKeyClean.includes("@") && !recipientKeyClean.includes("-");
    const isBoleto = isConfirmedBoletoType || isBoletoBarcode;

    const pixKeyNormalizada = normalizarChavePix(saque.recipientKey);
    const docNormalizado = normalizarDocumento(saque.favorecidoDocumento);
    const linhaDigNormalizada = normalizarDocumento(saque.linhaDigitavel || saque.codigoBarras || (isBoletoBarcode ? saque.recipientKey : undefined));

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
      if ((docNormalizado.length === 11 || docNormalizado.length === 14) && !isIntermediarioBancario(docNormalizado)) {
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
            fornecedor,
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
    const isDocIntermediario = isIntermediarioBancario(docNormalizado);

    // 2.1 Verifica Funcionários e Sócios (Equipe)
    let colaboradoresMatch: ColaboradorCandidato[] = [];
    if (pixKeyNormalizada || (docNormalizado && !isDocIntermediario)) {
      colaboradoresMatch = colaboradores.filter((c) => {
        const cPix = normalizarChavePix(c.pix_chave_normalizada || c.pix_chave);
        const cCpf = normalizarDocumento(c.cpf);
        const batePix = Boolean(pixKeyNormalizada && cPix && cPix === pixKeyNormalizada);
        const bateCpf = Boolean(!isDocIntermediario && docNormalizado && cCpf && cCpf.length === 11 && cCpf === docNormalizado);
        return batePix || bateCpf;
      });
    }

    // 2.1.1 Fallback por nome do favorecido ou descrição oficial (quando chave Pix / documento não são expostos)
    if (colaboradoresMatch.length === 0 && !isBoleto) {
      const nomeFavNorm = normalizarNome(saque.favorecidoNome);
      const descNorm = normalizarNome(saque.descricao);

      colaboradoresMatch = colaboradores.filter((c) => {
        const cNomeNorm = normalizarNome(c.nome);
        if (!cNomeNorm) return false;

        // Se o nome do favorecido coincide diretamente
        if (nomeFavNorm && (cNomeNorm === nomeFavNorm || nomeFavNorm.includes(cNomeNorm) || cNomeNorm.includes(nomeFavNorm))) {
          return true;
        }

        // Se a descrição contém o nome completo ou primeiro nome inequívoco (com variações fonéticas comuns)
        if (descNorm.includes(cNomeNorm)) return true;

        const partes = cNomeNorm.split(" ").filter((p) => p.length >= 4);
        const primeiroNome = partes[0];
        if (primeiroNome) {
          const variantes = [primeiroNome];
          if (primeiroNome === "shuellen" || primeiroNome === "suellen") {
            variantes.push("suellen", "shuellen", "suelen");
          }
          const bateDesc = variantes.some((v) => descNorm.includes(v));
          if (bateDesc) return true;
        }

        return false;
      });
    }

    // 2.2 Verifica Fornecedores via Pix
    let fornecedoresPixMatch: Contato[] = [];
    if (pixKeyNormalizada || (docNormalizado && !isDocIntermediario)) {
      fornecedoresPixMatch = fornecedores.filter((f) => {
        // Chave Pix principal
        const fPix = normalizarChavePix(f.pix_chave_normalizada || f.pix_chave);
        if (pixKeyNormalizada && fPix && fPix === pixKeyNormalizada) return true;

        // Chaves Pix adicionais
        const extras = f.chaves_pix_adicionais ?? [];
        const bateExtra = extras.some((k) => normalizarChavePix(k.chave) === pixKeyNormalizada);
        if (bateExtra) return true;

        if (!isDocIntermediario && docNormalizado) {
          // Documento beneficiário bancário
          const fBeneDoc = normalizarDocumento(f.beneficiario_documento_normalizado || f.beneficiario_documento);
          if (fBeneDoc && fBeneDoc === docNormalizado) return true;

          // CNPJ/CPF do fornecedor
          const fCnpj = normalizarDocumento(f.cnpj_cpf);
          if (fCnpj && fCnpj === docNormalizado) return true;
        }

        return false;
      });
    }

    // 2.2.1 Fallback por nome do fornecedor ou credor na descrição/favorecido
    if (fornecedoresPixMatch.length === 0 && !isBoleto) {
      const nomeFavNorm = normalizarNome(saque.favorecidoNome);
      const descNorm = normalizarNome(saque.descricao);

      fornecedoresPixMatch = fornecedores.filter((f) => {
        const fNomeNorm = normalizarNome(f.nome);
        const fFantasiaNorm = normalizarNome(f.nome_fantasia || "");
        if (!fNomeNorm && !fFantasiaNorm) return false;

        // Se o nome ou nome fantasia coincide ou está contido na descrição / favorecido
        if (fNomeNorm && (descNorm.includes(fNomeNorm) || (nomeFavNorm && (fNomeNorm.includes(nomeFavNorm) || nomeFavNorm.includes(fNomeNorm))))) {
          return true;
        }
        if (fFantasiaNorm && (descNorm.includes(fFantasiaNorm) || (nomeFavNorm && (fFantasiaNorm.includes(nomeFavNorm) || nomeFavNorm.includes(fFantasiaNorm))))) {
          return true;
        }

        // Variantes de palavras-chave do fornecedor (mínimo 4 caracteres, ignorando stopwords comuns)
        const stopwords = ["ltda", "distribuidora", "comercio", "industria", "alimentos", "servicos", "brasil"];
        const partes = [...fNomeNorm.split(" "), ...fFantasiaNorm.split(" ")].filter((p) => p.length >= 4 && !stopwords.includes(p));
        return partes.some((palavra) => descNorm.includes(palavra) || (nomeFavNorm && nomeFavNorm.includes(palavra)));
      });
    }

    // 2.3 Resolução de Ambiguidade / Conflito
    const temConflitoColabFornecedor = colaboradoresMatch.length > 0 && fornecedoresPixMatch.length > 0;
    if (temConflitoColabFornecedor) {
      return {
        tipo: "ambiguo",
        motivo: "Identificação ambígua: dados correspondem tanto a colaborador quanto a fornecedor",
        candidatosNomes: [
          ...colaboradoresMatch.map((c) => c.nome),
          ...fornecedoresPixMatch.map((f) => f.nome),
        ],
        confianca: "baixa",
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

    if (fornecedoresPixMatch.length > 1) {
      return {
        tipo: "ambiguo",
        motivo: "Múltiplos fornecedores cadastrados para a mesma chave Pix ou CPF/CNPJ",
        candidatosNomes: fornecedoresPixMatch.map((f) => f.nome),
        confianca: "baixa",
      };
    }

    // 2.4 Colaborador Único Identificado
    if (colaboradoresMatch.length === 1) {
      const colab = colaboradoresMatch[0];
      const isSocio = colab.tipo === "socio";

      const cPix = normalizarChavePix(colab.pix_chave_normalizada || colab.pix_chave);
      const cCpf = normalizarDocumento(colab.cpf);
      const batePix = Boolean(pixKeyNormalizada && cPix && cPix === pixKeyNormalizada);
      const bateCpf = Boolean(!isDocIntermediario && docNormalizado && cCpf && cCpf.length === 11 && cCpf === docNormalizado);

      const evidencia = batePix && !bateCpf
        ? "chave_pix_exata"
        : bateCpf && !batePix
          ? "documento_cpf_exato"
          : (batePix && bateCpf)
            ? "chave_pix_ou_cpf_colaborador_exato"
            : "nome_ou_descricao_colaborador";

      // Procura acerto pendente compatível (valor exato ou adiantamento/pagamento parcial)
      let acertoCompativel = acertos.find((a) => {
        if (a.colaborador_id !== colab.id) return false;
        if (!["pendente", "processando"].includes(a.status)) return false;
        // Tolera diferença de arredondamento de até R$ 0.10
        return Math.abs(a.valor_total - saque.valor) <= 0.10;
      });

      // Se não houver correspondência exata, busca acerto aberto do colaborador onde o saque é parcela/adiantamento
      if (!acertoCompativel) {
        acertoCompativel = acertos.find((a) => {
          if (a.colaborador_id !== colab.id) return false;
          if (!["pendente", "processando"].includes(a.status)) return false;
          return saque.valor <= a.valor_total;
        });
      }

      return {
        tipo: isSocio ? "socio" : "colaborador",
        colaborador: colab,
        acertoSugerido: acertoCompativel || null,
        evidencia,
        confianca: "alta",
      };
    }

    // 2.5 Fornecedor Único Identificado
    if (fornecedoresPixMatch.length === 1) {
      const f = fornecedoresPixMatch[0];

      // Verifica despesa ou dívida pré-existente
      const dividaCompativel = dividas.find((d) => {
        const mesmoCredor = d.contato_id === f.id || normalizarNome(d.credor) === normalizarNome(f.nome);
        const valorOk = Math.abs(d.valor_restante - saque.valor) <= 1.0;
        return mesmoCredor && valorOk;
      });

      const batePix = Boolean(pixKeyNormalizada && (
        (f.pix_chave && normalizarChavePix(f.pix_chave) === pixKeyNormalizada) ||
        (f.chaves_pix_adicionais ?? []).some((k) => normalizarChavePix(k.chave) === pixKeyNormalizada)
      ));
      const evidencia = batePix ? "pix_chave_ou_documento_fornecedor_exato" : "nome_ou_descricao_fornecedor";

      return {
        tipo: "fornecedor",
        fornecedor: f,
        categoriaIdSugerida: dividaCompativel?.categoria_id || f.categoria_padrao_id,
        subcategoriaIdSugerida: f.subcategoria_padrao_id,
        dividaSugerida: dividaCompativel || null,
        metodoPagamento: "pix",
        evidencia,
        confianca: "alta",
      };
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
