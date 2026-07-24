/**
 * Pluggy Open Finance Service (Sandbox / Produção)
 * 
 * Gerencia tokens de conexão, SDK Pluggy e busca de contas/transações bancárias via Open Finance.
 */

export interface PluggyConnector {
  id: number;
  name: string;
  institutionUrl: string;
  imageUrl: string;
  primaryColor: string;
  type: string;
  country: string;
}

export interface PluggyAccount {
  id: string;
  name: string;
  type: "BANK" | "CREDIT";
  balance: number;
  currencyCode: string;
  number: string;
}

export interface PluggyTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  type: "DEBIT" | "CREDIT";
}

const PLUGGY_API_URL = "https://api.pluggy.ai";

/**
 * Obtém as chaves do ambiente VITE ou fallback para testes no Sandbox
 */
export function getPluggyCredentials() {
  const clientId = import.meta.env.VITE_PLUGGY_CLIENT_ID || "d3753232-a521-4f81-9b48-111111111111";
  const clientSecret = import.meta.env.VITE_PLUGGY_CLIENT_SECRET || "11111111-2222-3333-4444-555555555555";
  return { clientId, clientSecret };
}

/**
 * Autentica com a API da Pluggy e gera o apiKey temporário
 */
export async function getPluggyApiKey(): Promise<string> {
  const { clientId, clientSecret } = getPluggyCredentials();

  try {
    const response = await fetch(`${PLUGGY_API_URL}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API Pluggy Auth: ${response.statusText}`);
    }

    const data = await response.json();
    return data.apiKey;
  } catch (error) {
    console.warn("Pluggy API Auth fallback (Sandbox Test Mode):", error);
    // Token sintético para modo de teste local sem bloquear a interface
    return "sandbox-pluggy-token-demo";
  }
}

/**
 * Gera um connectToken para inicializar o Widget Pluggy Connect no frontend
 */
export async function createPluggyConnectToken(): Promise<string> {
  const apiKey = await getPluggyApiKey();

  try {
    const response = await fetch(`${PLUGGY_API_URL}/connect_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        options: {
          sandbox: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro ao gerar Connect Token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.accessToken;
  } catch (error) {
    console.warn("Retornando connectToken Sandbox de desenvolvimento:", error);
    return "sandbox-connect-token-demo";
  }
}

/**
 * Lista de conectores populares no ambiente Sandbox para simulação rápida
 */
export const PLUGGY_SANDBOX_CONNECTORS: PluggyConnector[] = [
  {
    id: 2,
    name: "Nubank (Sandbox)",
    institutionUrl: "https://nubank.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/2.png",
    primaryColor: "820AD1",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 3,
    name: "Itaú (Sandbox)",
    institutionUrl: "https://itau.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/3.png",
    primaryColor: "EC7000",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 4,
    name: "Bradesco (Sandbox)",
    institutionUrl: "https://bradesco.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/4.png",
    primaryColor: "CC092F",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 5,
    name: "Banco do Brasil (Sandbox)",
    institutionUrl: "https://bb.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/5.png",
    primaryColor: "F8D117",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 6,
    name: "Banco Inter (Sandbox)",
    institutionUrl: "https://bancointer.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/6.png",
    primaryColor: "FF7A00",
    type: "PERSONAL_BANK",
    country: "BR",
  },
];
