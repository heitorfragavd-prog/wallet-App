import { describe, expect, it } from "vitest";
import {
  avaliarSaque,
  isSaqueConcluido,
  nomesParecidos,
  normalizarDocumento,
  normalizarNome,
  type DividaCandidata,
  type SaqueParaConciliar,
} from "./conciliacaoMatcher";

const saqueBase: SaqueParaConciliar = {
  externalId: "wd-1",
  tipo: "DICT",
  favorecidoNome: "JOAO SILVA MEI",
  favorecidoDocumento: "123.456.789-00",
  valor: 500,
  taxa: 1.99,
  dataPagamento: "2026-07-15T10:00:00Z",
  descricao: null,
};

const dividaBase: DividaCandidata = {
  id: "d1",
  descricao: "Fornecedor João",
  credor: "João da Silva",
  documento_favorecido: null,
  valor_restante: 500,
  data_vencimento: "2026-07-20",
};

describe("normalizarDocumento", () => {
  it("remove pontuação de CPF/CNPJ", () => {
    expect(normalizarDocumento("123.456.789-00")).toBe("12345678900");
    expect(normalizarDocumento("12.345.678/0001-90")).toBe("12345678000190");
  });

  it("mantém chave aleatória com letras em minúsculas", () => {
    expect(normalizarDocumento("ABC123XYZ")).toBe("abc123xyz");
  });

  it("retorna vazio para nulo", () => {
    expect(normalizarDocumento(null)).toBe("");
    expect(normalizarDocumento(undefined)).toBe("");
  });
});

describe("normalizarNome / nomesParecidos", () => {
  it("ignora acentos e caixa", () => {
    expect(normalizarNome("João  da SILVA")).toBe("joao da silva");
  });

  it("um nome contido no outro", () => {
    expect(nomesParecidos("João da Silva", "JOAO SILVA MEI")).toBe(true);
  });

  it("tokens em comum suficientes", () => {
    expect(nomesParecidos("Padaria Pão Quente", "PADARIA PAO QUENTE LTDA")).toBe(true);
  });

  it("nomes distintos não dão match", () => {
    expect(nomesParecidos("João da Silva", "Maria Souza")).toBe(false);
  });
});

describe("isSaqueConcluido", () => {
  it("reconhece status finais", () => {
    expect(isSaqueConcluido("PAID")).toBe(true);
    expect(isSaqueConcluido("completed")).toBe(true);
    expect(isSaqueConcluido("CONCLUIDO")).toBe(true);
  });

  it("rejeita status intermediários", () => {
    expect(isSaqueConcluido("PENDING")).toBe(false);
    expect(isSaqueConcluido(null)).toBe(false);
  });
});

describe("avaliarSaque — camada 1 (auto)", () => {
  it("documento igual + valor igual → baixa automática", () => {
    const divida = { ...dividaBase, documento_favorecido: "12345678900" };
    const r = avaliarSaque(saqueBase, [divida]);
    expect(r).toEqual({ camada: "auto", divida });
  });

  it("documento igual com pontuação diferente também casa", () => {
    const divida = { ...dividaBase, documento_favorecido: "123.456.789-00" };
    const r = avaliarSaque(saqueBase, [divida]);
    expect(r.camada).toBe("auto");
  });

  it("valor dentro da tolerância de R$ 1 ainda é auto", () => {
    const divida = { ...dividaBase, documento_favorecido: "12345678900", valor_restante: 500.5 };
    const r = avaliarSaque(saqueBase, [divida]);
    expect(r.camada).toBe("auto");
  });
});

describe("avaliarSaque — camada 2 (pendente)", () => {
  it("valor bate + nome parecido (sem documento) → sugestão", () => {
    const r = avaliarSaque(saqueBase, [dividaBase]);
    expect(r.camada).toBe("pendente");
    if (r.camada === "pendente") expect(r.dividaSugerida?.id).toBe("d1");
  });

  it("documento divergente elimina a candidata → avulsa", () => {
    const divida = { ...dividaBase, documento_favorecido: "98765432100" };
    const r = avaliarSaque(saqueBase, [divida]);
    expect(r.camada).toBe("avulsa");
  });

  it("fora da janela de 45 dias → avulsa", () => {
    const divida = { ...dividaBase, data_vencimento: "2026-12-31" };
    const r = avaliarSaque(saqueBase, [divida]);
    expect(r.camada).toBe("avulsa");
  });

  it("valor fora da tolerância → avulsa", () => {
    const divida = { ...dividaBase, valor_restante: 600 };
    const r = avaliarSaque(saqueBase, [divida]);
    expect(r.camada).toBe("avulsa");
  });

  it("dívida quitada (valor_restante 0) não é candidata", () => {
    const divida = { ...dividaBase, valor_restante: 0 };
    const r = avaliarSaque(saqueBase, [divida]);
    expect(r.camada).toBe("avulsa");
  });

  it("escolhe a candidata com valor mais próximo", () => {
    const longe = { ...dividaBase, id: "longe", valor_restante: 501 };
    const perto = { ...dividaBase, id: "perto", valor_restante: 500 };
    const r = avaliarSaque(saqueBase, [longe, perto]);
    expect(r.camada).toBe("pendente");
    if (r.camada === "pendente") expect(r.dividaSugerida?.id).toBe("perto");
  });
});

describe("avaliarSaque — camada 3 (avulsa)", () => {
  it("sem dívidas abertas → avulsa", () => {
    expect(avaliarSaque(saqueBase, []).camada).toBe("avulsa");
  });
});
