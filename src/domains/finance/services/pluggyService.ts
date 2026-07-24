/**
 * Pluggy Open Finance Service (Sandbox / Produção)
 * 
 * Gerencia autenticação, tokens de conexão (connectToken) e conectores via API da Pluggy.
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

const PLUGGY_API_URL = "/api/pluggy";

/**
 * Obtém as credenciais do ambiente VITE
 */
export function getPluggyCredentials() {
  const clientId = import.meta.env.VITE_PLUGGY_CLIENT_ID || "";
  const clientSecret = import.meta.env.VITE_PLUGGY_CLIENT_SECRET || "";
  return { clientId, clientSecret };
}

/**
 * Passo 1: Autentica com a API da Pluggy (POST /auth) e gera o apiKey temporário
 */
export async function getPluggyApiKey(): Promise<string> {
  const { clientId, clientSecret } = getPluggyCredentials();

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais VITE_PLUGGY_CLIENT_ID ou VITE_PLUGGY_CLIENT_SECRET não foram configuradas no arquivo .env");
  }

  const response = await fetch(`${PLUGGY_API_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.message || `Falha na autenticação da API Pluggy (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data.apiKey) {
    throw new Error("A API da Pluggy não retornou a chave apiKey.");
  }
  return data.apiKey;
}

/**
 * Passo 2: Gera o connectToken (POST /connect_token) recebendo o accessToken JWT
 */
export async function createPluggyConnectToken(): Promise<string> {
  const apiKey = await getPluggyApiKey();

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
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.message || `Falha ao gerar o Connect Token na API Pluggy (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data.accessToken) {
    throw new Error("A API da Pluggy não retornou o accessToken.");
  }
  return data.accessToken;
}

/**
 * Lista expandida de conectores de instituições financeiras brasileiras (com Sicoob, Nubank, Itaú, Bradesco, etc.)
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
 * Busca conectores com filtro dinâmico
 */
export async function fetchPluggyConnectors(searchQuery: string = ""): Promise<PluggyConnector[]> {
  if (!searchQuery.trim()) {
    return PLUGGY_SANDBOX_CONNECTORS;
  }
  const query = searchQuery.toLowerCase().trim();
  return PLUGGY_SANDBOX_CONNECTORS.filter((c) =>
    c.name.toLowerCase().includes(query)
  );
}
