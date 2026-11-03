import { describe, it, expect } from "vitest";
import {
  ConciliacaoFinanceiraAvancada,
  type SaqueMovimento,
  type ColaboradorCandidato,
  type AcertoEquipeCandidato,
  type DividaCandidata,
} from "./conciliacaoFinanceiraAvancada";
import type { Contato } from "@/domains/finance/hooks/useContatos";

describe("ConciliacaoFinanceiraAvancada — Testes Rigorosos (ETAPA 11)", () => {
  const mockFornecedor: Contato = {
    id: "forn-001",
    user_id: "user-1",
    workspace_id: "ws-1",
    tipo: "fornecedor",
    nome: "Distribuidora ABC Ltda",
    nome_fantasia: "Distribuidora ABC",
    cnpj_cpf: "12345678000199",
    pix_chave: "financeiro@distribuidoraabc.com.br",
    pix_chave_normalizada: "financeiro@distribuidoraabc.com.br",
    beneficiario_documento: "12345678000199",
    beneficiario_documento_normalizado: "12345678000199",
    categoria_padrao_id: "cat-mercadorias",
    subcategoria_padrao_id: "sub-bebidas",
    ativo: true,
    chaves_pix_adicionais: [
      { chave: "12345678000199", tipo: "cnpj", descricao: "Chave CNPJ" },
      { chave: "31999998888", tipo: "telefone", descricao: "Celular Financeiro" },
    ],
    identificadores_boletos: [
      { tipo: "codigo_beneficiario", valor: "987654321", descricao: "Código do cedente" },
    ],
  };

  const mockFuncionario: ColaboradorCandidato = {
    id: "colab-func-1",
    nome: "Shuellen Pereira Santos",
    tipo: "funcionario",
    pix_chave: "31991423782",
    pix_chave_normalizada: "31991423782",
    cpf: "12312312388",
    workspace_id: "ws-1",
  };

  const mockSocio: ColaboradorCandidato = {
    id: "colab-socio-1",
    nome: "Heitor Fraga de Oliveira",
    tipo: "socio",
    pix_chave: "11408578603",
    pix_chave_normalizada: "11408578603",
    cpf: "11408578603",
    workspace_id: "ws-1",
  };

  it("1. Pix confirmado para fornecedor cadastrado (Chave principal)", () => {
    const saque: SaqueMovimento = {
      externalId: "tx-pix-1",
      tipo: "DICT",
      valor: 450.0,
      taxa: 3.5,
      dataPagamento: "2026-11-03T10:00:00Z",
      recipientKey: "financeiro@distribuidoraabc.com.br",
      favorecidoNome: "Distribuidora ABC Ltda",
    };

    const res = ConciliacaoFinanceiraAvancada.avaliarSaque({
      saque,
      colaboradores: [mockFuncionario, mockSocio],
      acertos: [],
      fornecedores: [mockFornecedor],
      dividas: [],
    });

    expect(res.tipo).toBe("fornecedor");
    if (res.tipo === "fornecedor") {
      expect(res.fornecedor.id).toBe("forn-001");
      expect(res.categoriaIdSugerida).toBe("cat-mercadorias");
      expect(res.subcategoriaIdSugerida).toBe("sub-bebidas");
      expect(res.metodoPagamento).toBe("pix");
      expect(res.confianca).toBe("alta");
    }
  });

  it("2. Boleto confirmado para fornecedor cadastrado via CNPJ do beneficiário final", () => {
    const saque: SaqueMovimento = {
      externalId: "tx-bol-1",
      tipo: "BILLET",
      valor: 1500.0,
      taxa: 3.5,
      dataPagamento: "2026-11-10T12:00:00Z",
      favorecidoDocumento: "12.345.678/0001-99",
      favorecidoNome: "Distribuidora ABC Ltda",
      linhaDigitavel: "341917900101043510047910201500088910000150000",
    };

    const res = ConciliacaoFinanceiraAvancada.avaliarSaque({
      saque,
      colaboradores: [mockFuncionario],
      acertos: [],
      fornecedores: [mockFornecedor],
      dividas: [],
    });

    expect(res.tipo).toBe("fornecedor");
    if (res.tipo === "fornecedor") {
      expect(res.fornecedor.id).toBe("forn-001");
      expect(res.metodoPagamento).toBe("boleto");
      expect(res.categoriaIdSugerida).toBe("cat-mercadorias");
      expect(res.evidencia).toBe("cnpj_beneficiario_final_exato");
    }
  });

  it("3. Pix para funcionário com acerto pendente", () => {
    const acertoPendente: AcertoEquipeCandidato = {
      id: "acerto-123",
      colaborador_id: "colab-func-1",
      tipo: "semanal_funcionario",
      valor_total: 317.49,
      vencimento: "2026-11-02",
      status: "pendente",
    };

    const saque: SaqueMovimento = {
      externalId: "tx-colab-1",
      tipo: "DICT",
      valor: 317.49,
      taxa: 3.5,
      dataPagamento: "2026-11-02T14:12:00Z",
      recipientKey: "31991423782",
      favorecidoNome: "Shuellen Pereira Santos",
    };

    const res = ConciliacaoFinanceiraAvancada.avaliarSaque({
      saque,
      colaboradores: [mockFuncionario],
      acertos: [acertoPendente],
      fornecedores: [mockFornecedor],
      dividas: [],
    });

    expect(res.tipo).toBe("colaborador");
    if (res.tipo === "colaborador") {
      expect(res.colaborador.id).toBe("colab-func-1");
      expect(res.acertoSugerido?.id).toBe("acerto-123");
      expect(res.confianca).toBe("alta");
    }
  });

  it("4. Pix para funcionário sem acerto pendente (deve identificar com sucesso para criar histórico)", () => {
    const saque: SaqueMovimento = {
      externalId: "tx-colab-avulso",
      tipo: "DICT",
      valor: 150.0,
      taxa: 3.5,
      dataPagamento: "2026-11-03T09:00:00Z",
      recipientKey: "31991423782",
    };

    const res = ConciliacaoFinanceiraAvancada.avaliarSaque({
      saque,
      colaboradores: [mockFuncionario],
      acertos: [], // nenhum acerto
      fornecedores: [mockFornecedor],
      dividas: [],
    });

    expect(res.tipo).toBe("colaborador");
    if (res.tipo === "colaborador") {
      expect(res.colaborador.id).toBe("colab-func-1");
      expect(res.acertoSugerido).toBeNull();
    }
  });

  it("5. Pix para sócio (identifica natureza sócio)", () => {
    const saque: SaqueMovimento = {
      externalId: "tx-socio-1",
      tipo: "DICT",
      valor: 5000.0,
      taxa: 3.5,
      dataPagamento: "2026-10-30T14:23:00Z",
      favorecidoDocumento: "11408578603",
    };

    const res = ConciliacaoFinanceiraAvancada.avaliarSaque({
      saque,
      colaboradores: [mockFuncionario, mockSocio],
      acertos: [],
      fornecedores: [mockFornecedor],
      dividas: [],
    });

    expect(res.tipo).toBe("socio");
    if (res.tipo === "socio") {
      expect(res.colaborador.id).toBe("colab-socio-1");
    }
  });

  it("6. Boleto sem identificação de beneficiário final (vai para fila de não identificado)", () => {
    const saque: SaqueMovimento = {
      externalId: "tx-bol-desconhecido",
      tipo: "BILLET",
      valor: 380.0,
      taxa: 3.5,
      dataPagamento: "2026-11-03T11:00:00Z",
      favorecidoDocumento: "---",
      linhaDigitavel: "2379338128600830135285600006330779890000038000",
    };

    const res = ConciliacaoFinanceiraAvancada.avaliarSaque({
      saque,
      colaboradores: [mockFuncionario],
      acertos: [],
      fornecedores: [mockFornecedor],
      dividas: [],
    });

    expect(res.tipo).toBe("nao_identificado");
    expect(res.confianca).toBe("nenhuma");
  });

  it("7. Boleto com CNPJ de intermediário bancário (ex: Itaú / Bradesco) não é atribuído ao banco", () => {
    const saque: SaqueMovimento = {
      externalId: "tx-bol-itau",
      tipo: "BILLET",
      valor: 920.0,
      taxa: 3.5,
      dataPagamento: "2026-11-03T11:00:00Z",
      favorecidoDocumento: "60.701.190/0001-04", // Itaú Unibanco
    };

    const res = ConciliacaoFinanceiraAvancada.avaliarSaque({
      saque,
      colaboradores: [],
      acertos: [],
      fornecedores: [mockFornecedor],
      dividas: [],
    });

    expect(res.tipo).toBe("nao_identificado");
  });

  it("8. Chave Pix ambígua vinculada a dois fornecedores distintos", () => {
    const fornecedorDuplicado: Contato = {
      ...mockFornecedor,
      id: "forn-002",
      nome: "Outra Empresa Ltda",
      pix_chave: "financeiro@distribuidoraabc.com.br",
      pix_chave_normalizada: "financeiro@distribuidoraabc.com.br",
    };

    const saque: SaqueMovimento = {
      externalId: "tx-pix-ambiguo",
      tipo: "DICT",
      valor: 100.0,
      taxa: 3.5,
      dataPagamento: "2026-11-03T12:00:00Z",
      recipientKey: "financeiro@distribuidoraabc.com.br",
    };

    const res = ConciliacaoFinanceiraAvancada.avaliarSaque({
      saque,
      colaboradores: [],
      acertos: [],
      fornecedores: [mockFornecedor, fornecedorDuplicado],
      dividas: [],
    });

    expect(res.tipo).toBe("ambiguo");
    if (res.tipo === "ambiguo") {
      expect(res.confianca).toBe("baixa");
      expect(res.candidatosNomes.length).toBe(2);
    }
  });

  it("9. Prioridade de vínculo explícito de boleto em dívida existente", () => {
    const dividaVinculada: DividaCandidata = {
      id: "div-1",
      descricao: "Boleto Mercadorias #441",
      credor: "Distribuidora ABC Ltda",
      documento_favorecido: "12345678000199",
      valor_restante: 890.0,
      data_vencimento: "2026-11-15",
      linha_digitavel: "341917900101043510047910201500088910000089000",
      contato_id: "forn-001",
      categoria_id: "cat-especifica",
    };

    const saque: SaqueMovimento = {
      externalId: "tx-bol-com-divida",
      tipo: "BILLET",
      valor: 890.0,
      taxa: 3.5,
      dataPagamento: "2026-11-10T12:00:00Z",
      linhaDigitavel: "341917900101043510047910201500088910000089000",
    };

    const res = ConciliacaoFinanceiraAvancada.avaliarSaque({
      saque,
      colaboradores: [],
      acertos: [],
      fornecedores: [mockFornecedor],
      dividas: [dividaVinculada],
    });

    expect(res.tipo).toBe("fornecedor");
    if (res.tipo === "fornecedor") {
      expect(res.fornecedor.id).toBe("forn-001");
      expect(res.dividaSugerida?.id).toBe("div-1");
      expect(res.categoriaIdSugerida).toBe("cat-especifica");
      expect(res.evidencia).toBe("linha_digitavel_divida_vinculada");
    }
  });
});
