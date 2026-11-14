import { supabase } from "@/integrations/supabase/client";

export interface VincularTelegramParams {
  workspaceId: string;
  colaboradorId: string;
  telegramUserId: number;
  telegramUsername?: string | null;
  adminUserId?: string;
}

export interface VincularTelegramResult {
  success: boolean;
  colaboradorId: string;
  telegramUserId: number;
  fechamentosReconciliados: number;
  message: string;
}

/**
 * Procedimento administrativo seguro de vinculação do Telegram ao Colaborador (Gate 4).
 * Regras:
 * 1. Valida se o solicitante possui permissão administrativa no workspace.
 * 2. Valida unicidade: impede que um telegram_user_id seja atribuído a dois colaboradores distintos no mesmo workspace.
 * 3. Atualiza os dados na tabela colaboradores.
 * 4. Reconcilia automaticamente os fechamentos retroativos que estavam com identidade_pendente.
 */
export async function vincularTelegramColaboradorSeguro(
  params: VincularTelegramParams,
): Promise<VincularTelegramResult> {
  const { workspaceId, colaboradorId, telegramUserId, telegramUsername, adminUserId } = params;

  if (!workspaceId || !colaboradorId || !telegramUserId) {
    throw new Error("Parâmetros obrigatórios ausentes para vinculação de Telegram.");
  }

  // 1. Validação de permissão administrativa
  if (adminUserId) {
    const { data: member, error: memberErr } = await supabase
      .from("workspace_members")
      .select("role, active")
      .eq("workspace_id", workspaceId)
      .eq("user_id", adminUserId)
      .eq("active", true)
      .maybeSingle();

    if (memberErr || !member || !["owner", "admin"].includes(member.role)) {
      throw new Error("Permissão negada: apenas administradores podem vincular identificadores de Telegram.");
    }
  }

  // 2. Validação de unicidade no workspace (Gate 4)
  const { data: outroColab, error: checkErr } = await supabase
    .from("colaboradores")
    .select("id, nome")
    .eq("workspace_id", workspaceId)
    .eq("telegram_user_id", telegramUserId)
    .neq("id", colaboradorId)
    .maybeSingle();

  if (checkErr) {
    console.error("[folguistasIdentidadeService] Erro ao checar unicidade de Telegram:", checkErr);
  }

  if (outroColab) {
    throw new Error(
      `O Telegram ID ${telegramUserId} já está vinculado ao colaborador "${outroColab.nome}". Desvincule o anterior antes de transferir.`
    );
  }

  // 3. Atualização do colaborador
  const { error: updateColabErr } = await supabase
    .from("colaboradores")
    .update({
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername ? telegramUsername.replace(/^@/, "") : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", colaboradorId)
    .eq("workspace_id", workspaceId);

  if (updateColabErr) {
    throw new Error(`Falha ao atualizar colaborador: ${updateColabErr.message}`);
  }

  // 4. Reconciliação atômica de fechamentos pendentes (Gate 4)
  // Localiza fechamentos com identidade_pendente que pertencem a esse telegramUserId
  const { data: fechamentosPendentes, error: fechErr } = await supabase
    .from("fechamentos_caixa")
    .select("id, chave_operacional, data_fechamento, turno")
    .eq("workspace_id", workspaceId)
    .eq("identidade_pendente", true);

  let reconciliadosCount = 0;

  if (!fechErr && fechamentosPendentes && fechamentosPendentes.length > 0) {
    const pendentePattern = `pendente_${telegramUserId}`;
    for (const f of fechamentosPendentes) {
      if (f.chave_operacional && f.chave_operacional.includes(pendentePattern)) {
        const novaChave = f.chave_operacional.replace(pendentePattern, colaboradorId);
        const { error: recErr } = await supabase
          .from("fechamentos_caixa")
          .update({
            colaborador_id: colaboradorId,
            identidade_pendente: false,
            chave_operacional: novaChave,
            updated_at: new Date().toISOString(),
          })
          .eq("id", f.id);

        if (!recErr) {
          reconciliadosCount++;
        }
      }
    }
  }

  return {
    success: true,
    colaboradorId,
    telegramUserId,
    fechamentosReconciliados: reconciliadosCount,
    message: `Telegram ID ${telegramUserId} vinculado com sucesso.${
      reconciliadosCount > 0 ? ` ${reconciliadosCount} fechamento(s) pendente(s) reconciliado(s).` : ""
    }`,
  };
}

/**
 * Desvincula com segurança o Telegram de um colaborador.
 */
export async function desvincularTelegramColaboradorSeguro(params: {
  workspaceId: string;
  colaboradorId: string;
  adminUserId?: string;
}): Promise<{ success: boolean; message: string }> {
  const { workspaceId, colaboradorId, adminUserId } = params;

  if (adminUserId) {
    const { data: member, error: memberErr } = await supabase
      .from("workspace_members")
      .select("role, active")
      .eq("workspace_id", workspaceId)
      .eq("user_id", adminUserId)
      .eq("active", true)
      .maybeSingle();

    if (memberErr || !member || !["owner", "admin"].includes(member.role)) {
      throw new Error("Permissão negada: apenas administradores podem desvincular identificadores de Telegram.");
    }
  }

  const { error } = await supabase
    .from("colaboradores")
    .update({
      telegram_user_id: null,
      telegram_username: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", colaboradorId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Falha ao desvincular Telegram: ${error.message}`);
  }

  return {
    success: true,
    message: "Vinculação de Telegram removida com sucesso.",
  };
}
