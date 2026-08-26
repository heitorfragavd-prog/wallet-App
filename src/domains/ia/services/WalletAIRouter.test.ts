import { describe, it, expect } from "vitest";
import { routeMessage } from "./WalletAIRouter";

describe("WalletAIRouter", () => {
  it("DOCUMENT: rota DOCUMENT quando ha anexo", () => {
    expect(routeMessage({ message: "nota", attachments: [{ type: "image", mimeType: "image/jpeg" }] }).route).toBe("DOCUMENT");
  });
  it("ACTION: Cadastre despesa -> AGENT_V2", () => { expect(routeMessage({ message: "Cadastre uma despesa de R$ 500" }).route).toBe("AGENT_V2"); });
  it("ACTION: Registrar receita -> AGENT_V2", () => { expect(routeMessage({ message: "Registrar receita de aluguel" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Quanto vendi hoje e por que caiu -> AGENT_V2 nao FAST_QUERY", () => { expect(routeMessage({ message: "Quanto vendi hoje e por que caiu?" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Quanto vendi por categoria -> AGENT_V2", () => { expect(routeMessage({ message: "Quanto vendi por categoria?" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Compare agosto com julho -> AGENT_V2", () => { expect(routeMessage({ message: "Compare agosto com julho" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Analise minhas despesas -> AGENT_V2", () => { expect(routeMessage({ message: "Analise minhas despesas" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Explique fluxo de caixa -> AGENT_V2", () => { expect(routeMessage({ message: "Explique meu fluxo de caixa" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Detalhe receitas -> AGENT_V2", () => { expect(routeMessage({ message: "Detalhe minhas receitas do mes" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Mostre em grafico -> AGENT_V2", () => { expect(routeMessage({ message: "Mostre em grafico as despesas" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Maiores despesas -> AGENT_V2", () => { expect(routeMessage({ message: "Quais sao as maiores despesas?" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Tendencia -> AGENT_V2", () => { expect(routeMessage({ message: "Qual a tendencia do faturamento?" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Compare meses -> AGENT_V2", () => { expect(routeMessage({ message: "Compare este mes com o anterior" }).route).toBe("AGENT_V2"); });
  it("COMPLEX: Me explique -> AGENT_V2", () => { expect(routeMessage({ message: "Me explique o que e fluxo de caixa" }).route).toBe("AGENT_V2"); });
  it("FAST: Quanto vendi hoje -> FAST_QUERY", () => { expect(routeMessage({ message: "Quanto vendi hoje?" }).route).toBe("FAST_QUERY"); });
  it("FAST: Qual meu saldo agora -> FAST_QUERY", () => { expect(routeMessage({ message: "Qual meu saldo agora?" }).route).toBe("FAST_QUERY"); });
  it("FAST: Saldo atual -> FAST_QUERY", () => { expect(routeMessage({ message: "Saldo atual" }).route).toBe("FAST_QUERY"); });
  it("FAST: Quanto tenho disponivel -> FAST_QUERY", () => { expect(routeMessage({ message: "Quanto tenho em conta disponivel?" }).route).toBe("FAST_QUERY"); });
  it("FAST: Posso comprar -> FAST_QUERY", () => { expect(routeMessage({ message: "Posso comprar R$ 2000?" }).route).toBe("FAST_QUERY"); });
  it("DEFAULT: Oi tudo bem -> AGENT_V2", () => { expect(routeMessage({ message: "Oi, tudo bem?" }).route).toBe("AGENT_V2"); });
  it("DEFAULT: vazio -> AGENT_V2", () => { expect(routeMessage({ message: "" }).route).toBe("AGENT_V2"); });
  it("MULTI-TURN: Compare com historico -> AGENT_V2", () => {
    expect(routeMessage({ message: "Compare os dois.", conversationHistory: [
      { role: "user", content: "Quanto vendi este mes?" },
      { role: "assistant", content: "R$ 15.000" },
    ]}).route).toBe("AGENT_V2");
  });
  it("ACENTUACAO: Analise acentuado -> AGENT_V2", () => { expect(routeMessage({ message: "Analise detalhada das receitas" }).route).toBe("AGENT_V2"); });
  it("ACENTUACAO: Tendencia acentuada -> AGENT_V2", () => { expect(routeMessage({ message: "Qual a tendencia?" }).route).toBe("AGENT_V2"); });
});