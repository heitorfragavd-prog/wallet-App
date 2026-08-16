import { describe, expect, it } from "vitest";
import { getComparativosLocation, parseComparativosView } from "./comparativosNavigation";

describe("comparativosNavigation", () => {
  it("usa a visão completa quando visao está ausente ou inválida", () => {
    expect(parseComparativosView(new URLSearchParams("aba=comparativos"))).toBe("completa");
    expect(parseComparativosView(new URLSearchParams("aba=comparativos&visao=x"))).toBe("completa");
  });

  it.each(["completa", "diaria", "mensal"] as const)("preserva a visão %s", (visao) => {
    expect(parseComparativosView(new URLSearchParams(`aba=comparativos&visao=${visao}`))).toBe(visao);
  });

  it("preserva parâmetros alheios ao atualizar aba e visão", () => {
    const next = getComparativosLocation(new URLSearchParams("foo=bar&aba=overview"), "mensal");
    expect(next.toString()).toBe("foo=bar&aba=comparativos&visao=mensal");
  });
});
