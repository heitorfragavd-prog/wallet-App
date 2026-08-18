import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { PrivacyProvider, usePrivacy } from "./PrivacyContext";

describe("PrivacyContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PrivacyProvider>{children}</PrivacyProvider>
  );

  it("inicia com modo privacidade desativado por padrão", () => {
    const { result } = renderHook(() => usePrivacy(), { wrapper });
    expect(result.current.isPrivate).toBe(false);
  });

  it("alterna modo privacidade ao chamar togglePrivacy e salva no localStorage", () => {
    const { result } = renderHook(() => usePrivacy(), { wrapper });

    act(() => {
      result.current.togglePrivacy();
    });

    expect(result.current.isPrivate).toBe(true);
    expect(localStorage.getItem("wallet_privacy_mode")).toBe("true");

    act(() => {
      result.current.togglePrivacy();
    });

    expect(result.current.isPrivate).toBe(false);
    expect(localStorage.getItem("wallet_privacy_mode")).toBe("false");
  });

  it("formata moeda visível quando isPrivate é false", () => {
    const { result } = renderHook(() => usePrivacy(), { wrapper });
    expect(result.current.formatCurrency(1234.56)).toBe("R$ 1.234,56");
    expect(result.current.formatCurrency(0)).toBe("R$ 0,00");
    expect(result.current.formatCurrency(50, { showSign: true })).toBe("+R$ 50,00");
  });

  it("oculta valores com máscara quando isPrivate é true", () => {
    const { result } = renderHook(() => usePrivacy(), { wrapper });

    act(() => {
      result.current.setPrivacy(true);
    });

    expect(result.current.formatCurrency(1234.56)).toBe("R$ ••••••");
    expect(result.current.formatCurrency(0)).toBe("R$ ••••••");
    expect(result.current.maskText("Valor Secreto")).toBe("••••••");
  });
});
