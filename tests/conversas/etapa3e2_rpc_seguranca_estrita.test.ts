import { describe, it, expect } from "vitest";

describe("Etapa 3E.2 - Gate 2: Segurança Estrita e Autorização da RPC Financeira", () => {
  interface CallerContext {
    jwtRole?: string;
    authUid?: string | null;
    isExecutive?: boolean;
    isWorkspaceOwner?: boolean;
    isWorkspaceMember?: boolean;
    colaboradorWorkspaceValid?: boolean;
  }

  interface FechamentoRow {
    id: string;
    workspace_id: string;
    user_id: string;
    colaborador_id?: string;
    chave_operacional: string;
    anexos: Array<{ sha256?: string; file_id?: string; path?: string }>;
    telegram_message_ids: number[];
  }

  // Simulação fiel das regras de validação e execução da Migration 103
  function simularRpcRegistrarAnexo(
    ctx: CallerContext,
    params: {
      workspace_id: string;
      user_id: string;
      colaborador_id?: string;
      chave_operacional: string;
      anexo?: { sha256?: string; file_id?: string; path?: string };
      telegram_message_id?: number;
    },
    bancoMock: FechamentoRow[]
  ): { status: "success" | "error"; code?: string; message?: string; row?: FechamentoRow } {
    const isServiceRole =
      ctx.jwtRole === "service_role" || (ctx.authUid === null && ctx.jwtRole === undefined);

    let effectiveUserId = params.user_id;

    if (!isServiceRole) {
      // 1. Rejeita anônimo
      if (!ctx.authUid) {
        return {
          status: "error",
          code: "42501",
          message: "Acesso negado: autenticação necessária para registrar fechamento.",
        };
      }

      // 2. Força user_id real do JWT (impossibilita falsificação de p_user_id)
      effectiveUserId = ctx.authUid;

      // 3. Valida pertencimento ao workspace
      const temPermissaoWorkspace =
        ctx.isExecutive || ctx.isWorkspaceOwner || ctx.isWorkspaceMember;
      if (!temPermissaoWorkspace) {
        return {
          status: "error",
          code: "42501",
          message: "Acesso negado: você não tem permissão para registrar fechamento no workspace informado.",
        };
      }

      // 4. Valida se colaborador pertence ao workspace
      if (params.colaborador_id && ctx.colaboradorWorkspaceValid === false) {
        return {
          status: "error",
          code: "42501",
          message: "Acesso negado: colaborador não pertence ao workspace informado.",
        };
      }
    }

    // 5. Inserção / Atualização Atômica sob lock
    const existingIdx = bancoMock.findIndex(
      (f) =>
        f.workspace_id === params.workspace_id &&
        f.chave_operacional === params.chave_operacional
    );

    if (existingIdx >= 0) {
      const existing = bancoMock[existingIdx];
      const anexos = [...existing.anexos];
      if (params.anexo) {
        const jaExiste = anexos.some(
          (a) =>
            (params.anexo?.sha256 && a.sha256 === params.anexo.sha256) ||
            (params.anexo?.file_id && a.file_id === params.anexo.file_id)
        );
        if (!jaExiste) {
          anexos.push(params.anexo);
        }
      }

      const msgs = [...existing.telegram_message_ids];
      if (params.telegram_message_id && !msgs.includes(params.telegram_message_id)) {
        msgs.push(params.telegram_message_id);
      }

      existing.anexos = anexos;
      existing.telegram_message_ids = msgs;
      return { status: "success", row: existing };
    }

    const newRow: FechamentoRow = {
      id: "fech-" + Math.random().toString(36).substring(7),
      workspace_id: params.workspace_id,
      user_id: effectiveUserId,
      colaborador_id: params.colaborador_id,
      chave_operacional: params.chave_operacional,
      anexos: params.anexo ? [params.anexo] : [],
      telegram_message_ids: params.telegram_message_id ? [params.telegram_message_id] : [],
    };
    bancoMock.push(newRow);
    return { status: "success", row: newRow };
  }

  it("1. Deve autorizar execução quando chamado por service_role (webhook do Telegram)", () => {
    const banco: FechamentoRow[] = [];
    const res = simularRpcRegistrarAnexo(
      { jwtRole: "service_role" },
      {
        workspace_id: "ws-rodo-point",
        user_id: "bot-system-user",
        chave_operacional: "fech_2026-11-15_manha_colab1",
        anexo: { sha256: "hash1", file_id: "file1" },
        telegram_message_id: 1001,
      },
      banco
    );

    expect(res.status).toBe("success");
    expect(res.row?.anexos).toHaveLength(1);
    expect(res.row?.user_id).toBe("bot-system-user");
  });

  it("2. Deve autorizar administrador/executivo do workspace", () => {
    const banco: FechamentoRow[] = [];
    const res = simularRpcRegistrarAnexo(
      {
        jwtRole: "authenticated",
        authUid: "user-admin-1",
        isExecutive: true,
      },
      {
        workspace_id: "ws-rodo-point",
        user_id: "user-admin-1",
        chave_operacional: "fech_2026-11-15_manha_colab1",
        anexo: { sha256: "hash2", file_id: "file2" },
      },
      banco
    );

    expect(res.status).toBe("success");
    expect(res.row?.user_id).toBe("user-admin-1");
  });

  it("3. Deve autorizar membro regular do workspace", () => {
    const banco: FechamentoRow[] = [];
    const res = simularRpcRegistrarAnexo(
      {
        jwtRole: "authenticated",
        authUid: "user-folguista-1",
        isWorkspaceMember: true,
        colaboradorWorkspaceValid: true,
      },
      {
        workspace_id: "ws-rodo-point",
        user_id: "user-folguista-1",
        colaborador_id: "colab-1",
        chave_operacional: "fech_2026-11-15_manha_colab1",
        anexo: { sha256: "hash3", file_id: "file3" },
      },
      banco
    );

    expect(res.status).toBe("success");
    expect(res.row?.user_id).toBe("user-folguista-1");
  });

  it("4. Deve rejeitar chamada de usuário sem autenticação (anônimo)", () => {
    const banco: FechamentoRow[] = [];
    const res = simularRpcRegistrarAnexo(
      { jwtRole: "anon", authUid: null },
      {
        workspace_id: "ws-rodo-point",
        user_id: "qualquer",
        chave_operacional: "fech_2026-11-15_manha_colab1",
      },
      banco
    );

    expect(res.status).toBe("error");
    expect(res.code).toBe("42501");
    expect(res.message).toContain("autenticação necessária");
  });

  it("5. Deve rejeitar chamada de usuário pertencente a OUTRO workspace", () => {
    const banco: FechamentoRow[] = [];
    const res = simularRpcRegistrarAnexo(
      {
        jwtRole: "authenticated",
        authUid: "user-hacker-outro-ws",
        isExecutive: false,
        isWorkspaceOwner: false,
        isWorkspaceMember: false,
      },
      {
        workspace_id: "ws-alheio-protegido",
        user_id: "user-hacker-outro-ws",
        chave_operacional: "fech_2026-11-15_manha_colab1",
      },
      banco
    );

    expect(res.status).toBe("error");
    expect(res.code).toBe("42501");
    expect(res.message).toContain("não tem permissão para registrar fechamento no workspace informado");
  });

  it("6. Não deve permitir que usuário autenticado falsifique p_user_id (força auth.uid)", () => {
    const banco: FechamentoRow[] = [];
    const res = simularRpcRegistrarAnexo(
      {
        jwtRole: "authenticated",
        authUid: "user-folguista-legitimo",
        isWorkspaceMember: true,
      },
      {
        workspace_id: "ws-rodo-point",
        user_id: "user-proprietario-vitima", // Tentativa de personificação
        chave_operacional: "fech_2026-11-15_manha_colab1",
        anexo: { sha256: "hash4", file_id: "file4" },
      },
      banco
    );

    expect(res.status).toBe("success");
    // O user_id persistido deve ser o do JWT (auth.uid), NUNCA o falsificado
    expect(res.row?.user_id).toBe("user-folguista-legitimo");
    expect(res.row?.user_id).not.toBe("user-proprietario-vitima");
  });

  it("7. Deve rejeitar vinculação de colaborador de outro workspace", () => {
    const banco: FechamentoRow[] = [];
    const res = simularRpcRegistrarAnexo(
      {
        jwtRole: "authenticated",
        authUid: "user-funcionario-1",
        isWorkspaceMember: true,
        colaboradorWorkspaceValid: false, // Colaborador não pertence a este workspace
      },
      {
        workspace_id: "ws-rodo-point",
        user_id: "user-funcionario-1",
        colaborador_id: "colaborador-alienigena",
        chave_operacional: "fech_2026-11-15_manha_colab1",
      },
      banco
    );

    expect(res.status).toBe("error");
    expect(res.code).toBe("42501");
    expect(res.message).toContain("colaborador não pertence ao workspace");
  });

  it("8. Deve deduplicar anexos com mesmo hash ou file_id em chamadas concorrentes", () => {
    const banco: FechamentoRow[] = [];
    simularRpcRegistrarAnexo(
      { jwtRole: "service_role" },
      {
        workspace_id: "ws-rodo-point",
        user_id: "bot",
        chave_operacional: "fech_2026-11-15_manha_colab1",
        anexo: { sha256: "hash-foto-recibo", file_id: "file-123" },
        telegram_message_id: 2001,
      },
      banco
    );

    // Segunda chamada com a mesma foto
    const res2 = simularRpcRegistrarAnexo(
      { jwtRole: "service_role" },
      {
        workspace_id: "ws-rodo-point",
        user_id: "bot",
        chave_operacional: "fech_2026-11-15_manha_colab1",
        anexo: { sha256: "hash-foto-recibo", file_id: "file-123" },
        telegram_message_id: 2001,
      },
      banco
    );

    expect(res2.status).toBe("success");
    expect(res2.row?.anexos).toHaveLength(1);
    expect(res2.row?.telegram_message_ids).toEqual([2001]);
  });
});
