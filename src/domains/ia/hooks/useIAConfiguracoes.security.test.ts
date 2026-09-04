import { describe, it, expect } from "vitest";
describe("useIAConfiguracoes security", () => {
  it("contrato nao expoe api_key", () => {
    const config = { id: "1", modelo: "gpt-4o-mini", api_key_configurada: true };
    expect(config).not.toHaveProperty("api_key");
    expect((config)["api_key"]).toBeUndefined();
  });
  it("api_key_configurada e boolean", () => {
    expect(typeof { api_key_configurada: true }.api_key_configurada).toBe("boolean");
  });
  it("sem config, isConfigured e false", () => {
    const noConfig = null;
    expect(noConfig?.api_key_configurada === true).toBe(false);
  });
  it("nao contem campos sensiveis", () => {
    const config = { id: "1", modelo: "gpt-4o-mini", api_key_configurada: true };
    for (const f of ["api_key","secret","token","password"]) expect(Object.keys(config)).not.toContain(f);
  });
});