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
 * Lista expandida de conectores de instituições financeiras (com Sicoob, Nubank, Itaú, Bradesco, etc.)
 */
export const PLUGGY_SANDBOX_CONNECTORS: PluggyConnector[] = [
  {
    id: 201,
    name: "Sicoob (Sandbox)",
    institutionUrl: "https://sicoob.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/201.png",
    primaryColor: "003641",
    type: "PERSONAL_BANK",
    country: "BR",
  },
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
  {
    id: 7,
    name: "Santander (Sandbox)",
    institutionUrl: "https://santander.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/7.png",
    primaryColor: "EC0000",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 8,
    name: "Caixa Econômica Federal (Sandbox)",
    institutionUrl: "https://caixa.gov.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/8.png",
    primaryColor: "0066B3",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 202,
    name: "Sicredi (Sandbox)",
    institutionUrl: "https://sicredi.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/202.png",
    primaryColor: "3FAF47",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 9,
    name: "C6 Bank (Sandbox)",
    institutionUrl: "https://c6bank.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/9.png",
    primaryColor: "242424",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 10,
    name: "XP Investimentos (Sandbox)",
    institutionUrl: "https://xpi.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/10.png",
    primaryColor: "000000",
    type: "INVESTMENT",
    country: "BR",
  },
  {
    id: 11,
    name: "BTG Pactual (Sandbox)",
    institutionUrl: "https://btgpactual.com",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/11.png",
    primaryColor: "001E62",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 12,
    name: "Mercado Pago (Sandbox)",
    institutionUrl: "https://mercadopago.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/12.png",
    primaryColor: "009EE3",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 13,
    name: "PagBank (Sandbox)",
    institutionUrl: "https://pagbank.com.br",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/13.png",
    primaryColor: "00A05B",
    type: "PERSONAL_BANK",
    country: "BR",
  },
  {
    id: 14,
    name: "PicPay (Sandbox)",
    institutionUrl: "https://picpay.com",
    imageUrl: "https://cdn.pluggy.ai/assets/connectors/14.png",
    primaryColor: "21C25E",
    type: "PERSONAL_BANK",
    country: "BR",
  },
];

/**
 * Busca conectores via API da Pluggy com filtro dinâmico
 */
export async function fetchPluggyConnectors(searchQuery: string = ""): Promise<PluggyConnector[]> {
  try {
    const apiKey = await getPluggyApiKey();
    if (apiKey && apiKey !== "sandbox-pluggy-token-demo") {
      const response = await fetch(`${PLUGGY_API_URL}/connectors?name=${encodeURIComponent(searchQuery)}`, {
        headers: { "X-API-KEY": apiKey },
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          return data.results;
        }
      }
    }
  } catch (err) {
    console.warn("Fallback para lista de conectores Sandbox estática:", err);
  }

  // Fallback para filtro local na lista rica de conectores
  if (!searchQuery.trim()) {
    return PLUGGY_SANDBOX_CONNECTORS;
  }

  const query = searchQuery.toLowerCase().trim();
  return PLUGGY_SANDBOX_CONNECTORS.filter((c) =>
    c.name.toLowerCase().includes(query)
  );
}
