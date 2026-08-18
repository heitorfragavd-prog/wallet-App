import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const PRIVACY_STORAGE_KEY = "wallet_privacy_mode";

interface PrivacyContextType {
  isPrivate: boolean;
  togglePrivacy: () => void;
  setPrivacy: (value: boolean) => void;
  formatCurrency: (value: number | null | undefined, options?: { showSign?: boolean; customMask?: string }) => string;
  maskText: (text: string | number | null | undefined, mask?: string) => string;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPrivate, setIsPrivate] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PRIVACY_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PRIVACY_STORAGE_KEY, String(isPrivate));
    } catch (e) {
      console.warn("Não foi possível salvar a preferência de privacidade", e);
    }
  }, [isPrivate]);

  const togglePrivacy = useCallback(() => {
    setIsPrivate((prev) => !prev);
  }, []);

  const setPrivacy = useCallback((value: boolean) => {
    setIsPrivate(value);
  }, []);

  const formatCurrency = useCallback(
    (value: number | null | undefined, options?: { showSign?: boolean; customMask?: string }) => {
      if (value === null || value === undefined || isNaN(value)) {
        return isPrivate ? "R$ ••••••" : "R$ 0,00";
      }

      if (isPrivate) {
        return options?.customMask || "R$ ••••••";
      }

      const sign = options?.showSign && value > 0 ? "+" : "";
      const formatted = Number(value).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      return `${sign}R$ ${formatted}`;
    },
    [isPrivate]
  );

  const maskText = useCallback(
    (text: string | number | null | undefined, mask: string = "••••••") => {
      if (text === null || text === undefined) return "";
      if (!isPrivate) return String(text);
      return mask;
    },
    [isPrivate]
  );

  return (
    <PrivacyContext.Provider
      value={{
        isPrivate,
        togglePrivacy,
        setPrivacy,
        formatCurrency,
        maskText,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = (): PrivacyContextType => {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error("usePrivacy deve ser usado dentro de um PrivacyProvider");
  }
  return context;
};
