/**
 * Pluggy Open Finance Service (Sandbox / Produção)
 * 
 * Comunica-se com o servidor backend Node /api/pluggy para autenticação e sincronização de contas/transações.
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

/**
 * Gera o connectToken via servidor backend
 */
export async function createPluggyConnectToken(): Promise<any> {
  const response = await fetch("/api/pluggy/connect-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || `Erro HTTP ${response.status} ao obter Connect Token da Pluggy.`);
  }

  const data = await response.json();
  console.log("Resposta bruta da API de Token:", data);
  return data;
}

/**
 * Busca contas associadas ao Item conectado via Pluggy (GET /api/pluggy/accounts?itemId=...)
 */
export async function fetchPluggyItemAccounts(itemId: string): Promise<PluggyAccount[]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(`/api/pluggy/accounts?itemId=${encodeURIComponent(itemId)}`);
      if (response.ok) {
        const data = await response.json();
        const accs = data.results || data.accounts || [];
        if (accs.length > 0) return accs;
      }
    } catch (err) {
      console.warn("Erro ao buscar contas do Item Pluggy:", err);
    }
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return [];
}

/**
 * Busca transações associadas ao Item conectado via Pluggy (GET /api/pluggy/transactions?itemId=...)
 */
export async function fetchPluggyItemTransactions(itemId: string): Promise<PluggyTransaction[]> {
  try {
    const response = await fetch(`/api/pluggy/transactions?itemId=${encodeURIComponent(itemId)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.results || data.transactions || [];
  } catch (err) {
    console.warn("Erro ao buscar transações do Item Pluggy:", err);
    return [];
  }
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

/**
 * Busca e sincroniza investimentos do Item Pluggy
 */
export async function fetchPluggyItemInvestments(itemId: string): Promise<any[]> {
  try {
    const response = await fetch(`/api/pluggy/investments?itemId=${encodeURIComponent(itemId)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.results || data.investments || [];
  } catch (err) {
    console.warn("Erro ao buscar investimentos do Item Pluggy:", err);
    return [];
  }
}

/**
 * Sincroniza contas, faturas, categorias e transações de um Item conectado na Pluggy com o banco Supabase
 */
import { supabase } from "@/integrations/supabase/client";

export async function syncPluggyItemToSupabase(
  itemId: string,
  connectorName?: string
): Promise<{ accountsCount: number; transactionsCount: number; investmentsCount: number }> {
  try {
    const userRes = await supabase.auth.getUser();
    const userId = userRes.data.user?.id;
    if (!userId) throw new Error("Usuário não autenticado.");

    // 0. Busca categorias existentes do usuário para fazer match
    const { data: categoriasExistentes } = await supabase
      .from("categorias")
      .select("*")
      .eq("user_id", userId);

    const categoriasMap = new Map<string, string>();
    (categoriasExistentes || []).forEach((c: any) => {
      if (c.nome) {
        categoriasMap.set(c.nome.toLowerCase().trim(), c.id);
      }
    });

    // Função auxiliar para encontrar ou criar categoria dinamicamente
    const getOrCreateCategoriaId = async (nomeCategoria: string, tipo: "receita" | "despesa"): Promise<string | undefined> => {
      const key = nomeCategoria.toLowerCase().trim();
      if (categoriasMap.has(key)) {
        return categoriasMap.get(key);
      }

      // Se não existir, criar a categoria no Supabase
      const { data: novaCat, error: catErr } = await supabase
        .from("categorias")
        .insert([{
          user_id: userId,
          nome: nomeCategoria,
          tipo: tipo,
          cor: tipo === "receita" ? "#10B981" : "#F43F5E",
          icone: "Tag"
        }])
        .select()
        .single();

      if (!catErr && novaCat) {
        categoriasMap.set(key, novaCat.id);
        return novaCat.id;
      }
      return undefined;
    };

    // 1. Busca contas do Item Pluggy
    const pluggyAccounts = await fetchPluggyItemAccounts(itemId);
    if (!pluggyAccounts || pluggyAccounts.length === 0) {
      return { accountsCount: 0, transactionsCount: 0, investmentsCount: 0 };
    }

    let insertedAccountsCount = 0;
    let insertedTxCount = 0;

    for (const acc of pluggyAccounts as any[]) {
      // Definir tipo de conta
      let tipoConta: "conta_corrente" | "poupanca" | "cartao_credito" | "outro" = "conta_corrente";
      if (acc.type === "CREDIT") tipoConta = "cartao_credito";
      else if (acc.type === "SAVINGS") tipoConta = "poupanca";

      const nomeConta = connectorName ? `${connectorName} (${acc.name})` : acc.name;

      // Extrair dados de cartão de crédito (Fatura / creditData)
      let diaFechamento: number | undefined = undefined;
      let diaVencimento: number | undefined = undefined;
      let limiteCredito: number | undefined = undefined;

      if (acc.creditData) {
        limiteCredito = acc.creditData.creditLimit ? Number(acc.creditData.creditLimit) : undefined;
        if (acc.creditData.balanceCloseDate) {
          const closeDay = parseInt(acc.creditData.balanceCloseDate.substring(8, 10));
          if (!isNaN(closeDay)) diaFechamento = closeDay;
        }
        if (acc.creditData.balanceDueDate) {
          const dueDay = parseInt(acc.creditData.balanceDueDate.substring(8, 10));
          if (!isNaN(dueDay)) diaVencimento = dueDay;
        }
      } else if (tipoConta === "cartao_credito") {
        limiteCredito = 5000;
        diaFechamento = 1;
        diaVencimento = 10;
      }

      // Inserir a conta no Supabase
      const { data: novaConta, error: accErr } = await supabase
        .from("contas_usuario")
        .insert([{
          user_id: userId,
          nome: nomeConta,
          tipo: tipoConta,
          saldo_inicial: Math.abs(acc.balance || 0),
          saldo_atual: Math.abs(acc.balance || 0),
          limite_credito: limiteCredito,
          dia_fechamento: diaFechamento,
          dia_vencimento: diaVencimento,
          cor: tipoConta === "cartao_credito" ? "#820AD1" : "#10B981"
        }])
        .select()
        .single();

      if (accErr) {
        console.error("Erro ao salvar conta do Pluggy:", accErr);
        continue;
      }

      insertedAccountsCount++;

      // 2. Busca transações do Item Pluggy para associar à conta recém-criada
      const pluggyTxs = await fetchPluggyItemTransactions(itemId);
      if (pluggyTxs && pluggyTxs.length > 0) {
        const txRows = [];
        for (const tx of pluggyTxs) {
          const isDespesa = tx.amount < 0 || tx.type === "DEBIT";
          const valorAbs = Math.abs(tx.amount);
          const tipo = isDespesa ? "despesa" : "receita";
          const nomeCategoria = tx.category || (isDespesa ? "Despesas Diversas" : "Rendas Diversas");

          const categoriaId = await getOrCreateCategoriaId(nomeCategoria, tipo);

          txRows.push({
            user_id: userId,
            conta_id: novaConta.id,
            categoria_id: categoriaId,
            tipo,
            descricao: tx.description || "Transação Open Finance",
            valor: valorAbs,
            data: tx.date ? tx.date.substring(0, 10) : new Date().toISOString().substring(0, 10),
            metodo_pagamento: tipoConta === "cartao_credito" ? "cartao_credito" : "pix",
            observacoes: `Importado via Pluggy Open Finance (${nomeCategoria})`
          });
        }

        const { error: txErr } = await supabase.from("transacoes").insert(txRows);
        if (!txErr) {
          insertedTxCount += txRows.length;
        } else {
          console.error("Erro ao salvar transações do Pluggy:", txErr);
        }
      }
    }

    // 3. Busca investimentos do Item Pluggy
    const investments = await fetchPluggyItemInvestments(itemId);

    return {
      accountsCount: insertedAccountsCount,
      transactionsCount: insertedTxCount,
      investmentsCount: investments.length
    };
  } catch (err) {
    console.error("Erro ao sincronizar Item Pluggy no Supabase:", err);
    throw err;
  }
}
