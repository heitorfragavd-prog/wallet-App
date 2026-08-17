import { describe, expect, it } from "vitest";
import {
  matchEquipePayment,
  type EquipePaymentCandidate,
} from "../../../../supabase/functions/_shared/equipe-conciliacao";

const movimento = {
  pix: "123.456.789-00",
  valorCentavos: 10_950,
  data: "2026-08-24",
};

const candidato: EquipePaymentCandidate = {
  id: "acerto-a",
  pix: "12345678900",
  valorCentavos: 10_950,
  vencimento: "2026-08-24",
  status: "pendente",
};

describe("matchEquipePayment", () => {
  it("faz match automático somente quando existe um candidato exato", () => {
    expect(matchEquipePayment(movimento, [candidato])).toEqual({
      kind: "matched",
      acertoId: "acerto-a",
    });
  });

  it("aceita acerto processando dentro da janela de sete dias", () => {
    expect(
      matchEquipePayment(
        { ...movimento, data: "2026-08-31" },
        [{ ...candidato, status: "processando" }],
      ),
    ).toEqual({ kind: "matched", acertoId: "acerto-a" });
  });

  it.each([
    ["status finalizado", { ...candidato, status: "pago" }],
    ["Pix diferente", { ...candidato, pix: "98765432100" }],
    ["valor diferente por um centavo", { ...candidato, valorCentavos: 10_951 }],
    ["data fora da janela", { ...candidato, vencimento: "2026-08-16" }],
  ])("não associa quando %s", (_caso, candidatoInvalido) => {
    expect(matchEquipePayment(movimento, [candidatoInvalido])).toEqual({ kind: "none" });
  });

  it("não escolhe silenciosamente entre dois candidatos exatos", () => {
    expect(
      matchEquipePayment(movimento, [
        candidato,
        { ...candidato, id: "acerto-b" },
      ]),
    ).toEqual({
      kind: "ambiguous",
      acertoIds: ["acerto-a", "acerto-b"],
    });
  });

  it("não usa nome do favorecido como heurística", () => {
    expect(
      matchEquipePayment(
        { ...movimento, pix: "outra-chave", favorecidoNome: "Luiz Fellipe" },
        [{ ...candidato, favorecidoNome: "Luiz Fellipe" }],
      ),
    ).toEqual({ kind: "none" });
  });
});
