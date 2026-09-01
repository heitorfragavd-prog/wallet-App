/**
 * Pluggy Open Finance Service (Sandbox / Produção)
 * 
 * Comunica-se exclusivamente com a Supabase Edge Function 'pluggy-api'
 * para autenticação JWT segura, validação de workspace e sincronização de dados bancários.
 * 
 * Suporta rastreamento ponta a ponta com X-Correlation-Id e logs estruturados.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";
import { getCorrelationId } from "@/core/logging/correlationId";

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
  type: "BANK" | "CREDIT" | "SAVINGS";
  balance: number;
  currencyCode?: string;
  number?: string;
}

export interface PluggyTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category?: string;
  type?: "DEBIT" | "CREDIT";
}

export const PLUGGY_ERROR_CODES = {
  TIMEOUT: "PLUGGY_TIMEOUT",
  UPSTREAM_ERROR: "PLUGGY_UPSTREAM_ERROR",
  AUTH_ERROR: "PLUGGY_AUTH_ERROR",
  FORBIDDEN: "PLUGGY_FORBIDDEN",
} as const;

export class PluggyServiceError extends Error {
  code: string;
  correlationId?: string;

  constructor(message: string, code: string = PLUGGY_ERROR_CODES.UPSTREAM_ERROR, correlationId?: string) {
    super(message);
    this.name = "PluggyServiceError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

function formatEdgeFunctionError(
  error: unknown,
  data: unknown,
  defaultMsg: string,
  _correlationId?: string
): { message: string; code: string } {
  let message = defaultMsg;
  let code: string = PLUGGY_ERROR_CODES.UPSTREAM_ERROR;

  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.error === "string") {
      message = d.error;
    } else if (d.error && typeof d.error === "object") {
      const errObj = d.error as Record<string, unknown>;
      if (typeof errObj.message === "string") message = errObj.message;
      if (typeof errObj.code === "string") code = errObj.code;
    }
  }

  const rawErrMsg = error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string"
    ? (error as { message: string }).message
    : "";

  if (
    rawErrMsg.includes("Failed to send a request to the Edge Function") ||
    rawErrMsg.includes("FunctionsFetchError") ||
    rawErrMsg.includes("Failed to fetch")
  ) {
    message = "O serviço Open Finance está em fase de ativação e ainda não foi publicado no servidor. Por favor, tente novamente após a implantação.";
    code = PLUGGY_ERROR_CODES.UPSTREAM_ERROR;
  } else if (rawErrMsg.includes("timeout") || rawErrMsg.includes("abort")) {
    message = "Tempo limite excedido ao comunicar com o serviço Open Finance.";
    code = PLUGGY_ERROR_CODES.TIMEOUT;
  } else if (rawErrMsg.includes("401") || rawErrMsg.includes("não autenticado") || rawErrMsg.includes("Token de autenticação ausente")) {
    message = rawErrMsg || "Usuário não autenticado ou token inválido.";
    code = PLUGGY_ERROR_CODES.AUTH_ERROR;
  } else if (rawErrMsg.includes("403") || rawErrMsg.includes("Acesso negado")) {
    message = rawErrMsg || "Acesso negado ao workspace especificado.";
    code = PLUGGY_ERROR_CODES.FORBIDDEN;
  } else if (rawErrMsg && !data) {
    message = rawErrMsg;
  }

  return { message, code };
}

/**
 * Gera o connectToken de forma segura via Edge Function autenticada
 */
export async function createPluggyConnectToken(
  workspaceId: string,
  options?: { correlationId?: string }
): Promise<{ accessToken: string }> {
  if (!workspaceId) {
    throw new Error("workspace_id é obrigatório para obter o Connect Token.");
  }

  const correlationId = options?.correlationId || getCorrelationId();

  logger.info("pluggyService", "Solicitando Connect Token da Pluggy", {
    operation: "createPluggyConnectToken",
    correlation_id: correlationId,
    workspace_id: workspaceId,
  });

  const { data, error } = await supabase.functions.invoke("pluggy-api", {
    headers: {
      "X-Correlation-Id": correlationId,
    },
    body: {
      action: "getConnectToken",
      workspace_id: workspaceId,
    },
  });

  if (error || !data?.success) {
    const { message, code } = formatEdgeFunctionError(error, data, "Erro ao obter Connect Token da Pluggy.", correlationId);
    logger.error("pluggyService", "Falha ao obter Connect Token da Pluggy", {
      operation: "createPluggyConnectToken",
      correlation_id: correlationId,
      workspace_id: workspaceId,
      error_code: code,
      error: message,
    });
    throw new PluggyServiceError(message, code, correlationId);
  }

  logger.info("pluggyService", "Connect Token obtido com sucesso", {
    operation: "createPluggyConnectToken",
    correlation_id: correlationId,
    workspace_id: workspaceId,
  });

  return data.data;
}

/**
 * Registra o Item conectado no workspace
 */
export async function registerPluggyItem(
  workspaceId: string,
  itemId: string,
  connectorId?: number,
  connectorName?: string,
  options?: { correlationId?: string }
): Promise<{ id?: string; item_id: string; status?: string; connector_name?: string }> {
  if (!workspaceId || !itemId) {
    throw new Error("workspace_id e itemId são obrigatórios.");
  }

  const correlationId = options?.correlationId || getCorrelationId();

  logger.info("pluggyService", "Registrando Item Pluggy no workspace", {
    operation: "registerPluggyItem",
    correlation_id: correlationId,
    workspace_id: workspaceId,
    itemId,
    connectorName,
  });

  const { data, error } = await supabase.functions.invoke("pluggy-api", {
    headers: {
      "X-Correlation-Id": correlationId,
    },
    body: {
      action: "registerItem",
      workspace_id: workspaceId,
      itemId,
      connectorId,
      connectorName,
    },
  });

  if (error || !data?.success) {
    const { message, code } = formatEdgeFunctionError(error, data, "Erro ao registrar Item da Pluggy.", correlationId);
    logger.error("pluggyService", "Falha ao registrar Item Pluggy", {
      operation: "registerPluggyItem",
      correlation_id: correlationId,
      workspace_id: workspaceId,
      error_code: code,
      itemId,
      error: message,
    });
    throw new PluggyServiceError(message, code, correlationId);
  }

  logger.info("pluggyService", "Item Pluggy registrado com sucesso", {
    operation: "registerPluggyItem",
    correlation_id: correlationId,
    workspace_id: workspaceId,
    itemId: data.data?.item_id || itemId,
  });

  return data.data;
}

/**
 * Busca contas associadas ao Item conectado via Edge Function
 */
export async function fetchPluggyItemAccounts(
  workspaceId: string,
  itemId: string,
  options?: { correlationId?: string }
): Promise<PluggyAccount[]> {
  if (!workspaceId || !itemId) return [];

  const correlationId = options?.correlationId || getCorrelationId();

  try {
    const { data, error } = await supabase.functions.invoke("pluggy-api", {
      headers: {
        "X-Correlation-Id": correlationId,
      },
      body: {
        action: "getAccounts",
        workspace_id: workspaceId,
        itemId,
      },
    });

    if (error || !data?.success) {
      const errDetail = data?.error || error?.message;
      logger.warn("pluggyService", "Aviso ao buscar contas do Item Pluggy", {
        operation: "fetchPluggyItemAccounts",
        correlation_id: correlationId,
        workspace_id: workspaceId,
        itemId,
        error: errDetail,
      });
      return [];
    }

    return data.data || [];
  } catch (err) {
    logger.warn("pluggyService", "Erro ao buscar contas do Item Pluggy", {
      operation: "fetchPluggyItemAccounts",
      correlation_id: correlationId,
      workspace_id: workspaceId,
      itemId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Busca transações associadas ao Item conectado via Edge Function
 */
export async function fetchPluggyItemTransactions(
  workspaceId: string,
  itemId: string,
  options?: { correlationId?: string }
): Promise<PluggyTransaction[]> {
  if (!workspaceId || !itemId) return [];

  const correlationId = options?.correlationId || getCorrelationId();

  try {
    const { data, error } = await supabase.functions.invoke("pluggy-api", {
      headers: {
        "X-Correlation-Id": correlationId,
      },
      body: {
        action: "getTransactions",
        workspace_id: workspaceId,
        itemId,
      },
    });

    if (error || !data?.success) {
      const errDetail = data?.error || error?.message;
      logger.warn("pluggyService", "Aviso ao buscar transações do Item Pluggy", {
        operation: "fetchPluggyItemTransactions",
        correlation_id: correlationId,
        workspace_id: workspaceId,
        itemId,
        error: errDetail,
      });
      return [];
    }

    return data.data || [];
  } catch (err) {
    logger.warn("pluggyService", "Erro ao buscar transações do Item Pluggy", {
      operation: "fetchPluggyItemTransactions",
      correlation_id: correlationId,
      workspace_id: workspaceId,
      itemId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Busca investimentos do Item conectado via Edge Function
 */
export async function fetchPluggyItemInvestments(
  workspaceId: string,
  itemId: string,
  options?: { correlationId?: string }
): Promise<Record<string, unknown>[]> {
  if (!workspaceId || !itemId) return [];

  const correlationId = options?.correlationId || getCorrelationId();

  try {
    const { data, error } = await supabase.functions.invoke("pluggy-api", {
      headers: {
        "X-Correlation-Id": correlationId,
      },
      body: {
        action: "getInvestments",
        workspace_id: workspaceId,
        itemId,
      },
    });

    if (error || !data?.success) {
      const errDetail = data?.error || error?.message;
      logger.warn("pluggyService", "Aviso ao buscar investimentos do Item Pluggy", {
        operation: "fetchPluggyItemInvestments",
        correlation_id: correlationId,
        workspace_id: workspaceId,
        itemId,
        error: errDetail,
      });
      return [];
    }

    return data.data || [];
  } catch (err) {
    logger.warn("pluggyService", "Erro ao buscar investimentos do Item Pluggy", {
      operation: "fetchPluggyItemInvestments",
      correlation_id: correlationId,
      workspace_id: workspaceId,
      itemId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Sincroniza contas e transações do Item diretamente no Supabase com isolamento de workspace
 */
export async function syncPluggyItemToSupabase(
  workspaceId: string,
  itemId: string,
  connectorName?: string,
  options?: { correlationId?: string }
): Promise<{ accountsCount: number; transactionsCount: number; investmentsCount: number }> {
  if (!workspaceId || !itemId) {
    throw new Error("workspace_id e itemId são obrigatórios para sincronização.");
  }

  const correlationId = options?.correlationId || getCorrelationId();

  logger.info("pluggyService", "Iniciando sincronização do Item Pluggy no banco", {
    operation: "syncPluggyItemToSupabase",
    correlation_id: correlationId,
    workspace_id: workspaceId,
    itemId,
    connectorName,
  });

  const { data, error } = await supabase.functions.invoke("pluggy-api", {
    headers: {
      "X-Correlation-Id": correlationId,
    },
    body: {
      action: "syncItem",
      workspace_id: workspaceId,
      itemId,
      connectorName,
    },
  });

  if (error || !data?.success) {
    const { message, code } = formatEdgeFunctionError(error, data, "Erro ao sincronizar Item da Pluggy.", correlationId);
    logger.error("pluggyService", "Falha na sincronização do Item Pluggy", {
      operation: "syncPluggyItemToSupabase",
      correlation_id: correlationId,
      workspace_id: workspaceId,
      error_code: code,
      itemId,
      error: message,
    });
    throw new PluggyServiceError(message, code, correlationId);
  }

  logger.info("pluggyService", "Sincronização do Item Pluggy concluída com sucesso", {
    operation: "syncPluggyItemToSupabase",
    correlation_id: correlationId,
    workspace_id: workspaceId,
    accountsCount: data.data?.accountsCount,
    transactionsCount: data.data?.transactionsCount,
  });

  return data.data;
}

/**
 * Lista estática de conectores para exibição no frontend (Sandbox/Produção)
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
 * Busca conectores com filtro
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
