import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { BankLogoBadge, mapearNomeParaSlug } from "../BankLogoBadge";

describe("BankLogoBadge", () => {
  describe("mapearNomeParaSlug", () => {
    it("mapeia variações do Banco do Brasil corretamente", () => {
      expect(mapearNomeParaSlug("Banco do Brasil")).toBe("bancodobrasil");
      expect(mapearNomeParaSlug("Banco do Brasil VIVIANE")).toBe("bancodobrasil");
      expect(mapearNomeParaSlug("BB")).toBe("bancodobrasil");
      expect(mapearNomeParaSlug("Cartão BB")).toBe("bancodobrasil");
      expect(mapearNomeParaSlug("BB Estilo")).toBe("bancodobrasil");
      expect(mapearNomeParaSlug("Banco Brasil")).toBe("bancodobrasil");
      expect(mapearNomeParaSlug("banco do brasil viviane")).toBe("bancodobrasil");
    });

    it("mapeia outros bancos populares", () => {
      expect(mapearNomeParaSlug("Nubank")).toBe("nubank");
      expect(mapearNomeParaSlug("Itaú")).toBe("itau");
      expect(mapearNomeParaSlug("Bradesco")).toBe("bradesco");
      expect(mapearNomeParaSlug("Caixa Econômica")).toBe("caixa");
      expect(mapearNomeParaSlug("Sicoob")).toBe("sicoob");
      expect(mapearNomeParaSlug("DiviPay")).toBe("divipay");
    });

    it("retorna null para bancos desconhecidos", () => {
      expect(mapearNomeParaSlug("Conta Secreta XYZ")).toBeNull();
    });
  });

  describe("Renderização do Componente", () => {
    it("renderiza o badge do Banco do Brasil com a cor amarela oficial e o emblema azul", () => {
      const { container } = render(
        <BankLogoBadge bankName="Banco do Brasil VIVIANE" />
      );

      const badge = container.firstChild as HTMLElement;
      expect(badge).toBeDefined();
      expect(badge.getAttribute("title")).toBe("Banco do Brasil");
      expect(badge.getAttribute("style")).toContain("background-color: rgb(252, 222, 0)");

      // Verifica se o SVG do BB está presente e não foi substituído pelas iniciais BA
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(badge.textContent).not.toContain("BA");

      // Verifica se o caminho vetorial com a cor azul oficial (#0038A8) está presente
      const path = container.querySelector("path");
      expect(path).not.toBeNull();
      expect(path?.getAttribute("fill")).toBe("#0038A8");
    });

    it("renderiza DiviPay como imagem", () => {
      render(<BankLogoBadge bankName="DiviPay" />);
      const img = screen.getByRole("img", { name: "DiviPay" });
      expect(img).toBeDefined();
      expect(img.getAttribute("src")).toBe("/logos/divipay.png");
    });

    it("renderiza fallback de iniciais para banco não identificado", () => {
      const { container } = render(<BankLogoBadge bankName="XYZ Especial" />);
      expect(container.textContent).toContain("XY");
    });
  });
});
