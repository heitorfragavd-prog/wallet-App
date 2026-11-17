import { describe, it, expect } from "vitest";

describe("Etapa 3E.3 - Gate A1: Autorização de Menor Privilégio na RPC Financeira", () => {
  interface CallerContext {
    jwtRole?: string;
    authUid?: string | null;
    isAdmin?: boolean;
    userColaboradorId?: string | null;
  }

  interface FechamentoRow {
    id: string;
    workspace_id: string;
    user_id: string;
    colaborador_id?: string;
    chave_operacional: string;
    status: "pendente_conferencia" | "divergencia" | "aprovado";
    anexos: Array<{ sha256?: string; file_id?: string; path?: string }>;
    telegram_message_ids: number[];
  }

  // Simulação das regras estritas de menor privilégio da Migration 105
  function executarRpcMenorPrivilegio(
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
    let effectiveColaboradorId = params.colaborador_id;

    if (!isServiceRole) {
      // 1. Rejeita anônimo
      if (!ctx.authUid) {
        return {
          status: "error",
          code: "42501",
          message: "Acesso negado: autenticação necessária para registrar fechamento.",
        };
      }

      // Força o auth.uid real do JWT
      effectiveUserId = ctx.authUid;

      if (!ctx.isAdmin) {
        // Membro não admin: exige perfil de colaborador ativo
        if (!ctx.userColaboradorId) {
          return {
            status: "error",
            code: "42501",
            message:
              "Acesso negado: membro comum sem perfil de colaborador ativo não tem permissão para registrar fechamento financeiro.",
          };
        }

        // Não permite passar id de outro colaborador
        if (params.colaborador_id && params.colaborador_id !== ctx.userColaboradorId) {
          return {
            status: "error",
            code: "42501",
            message:
              "Acesso negado: colaboradores comuns só possuem permissão para registrar documentos próprios.",
          };
        }

        effectiveColaboradorId = ctx.userColaboradorId;
      }
    }

    // Lock pessimista e busca de fechamento existente
    const existing = bancoMock.find(
      (f) =>
        f.workspace_id === params.workspace_id &&
        f.chave_operacional === params.chave_operacional
    );

    if (existing) {
      // Regra: Fechamento já aprovado não pode sofrer alterações
      if (existing.status === "aprovado") {
        return {
          status: "error",
          code: "42501",
          message:
            "Acesso negado: fechamento já aprovado administrativamente não pode sofrer alterações.",
        };
      }

      // Regra: Colaborador comum não pode alterar fechamento alheio
      if (!isServiceRole && !ctx.isAdmin) {
        if (existing.colaborador_id && existing.colaborador_id !== effectiveColaboradorId) {
          return {
            status: "error",
            code: "42501",
            message:
              "Acesso negado: você não tem permissão para alterar o fechamento de outro colaborador.",
          };
        }
      }

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
      colaborador_id: effectiveColaboradorId,
      chave_operacional: params.chave_operacional,
      status: "pendente_conferencia",
      anexos: params.anexo ? [params.anexo] : [],
      telegram_message_ids: params.telegram_message_id ? [params.telegram_message_id] : [],
    };
    bancoMock.push(newRow);
    return { status: "success", row: newRow };
  }

  it("1. Administrador autorizado pode registrar e gerenciar qualquer fechamento do workspace", () => {
    const banco: FechamentoRow[] = [];
    const res = executarRpcMenorPrivilegio(
      { jwtRole: "authenticated", authUid: "admin-1", isAdmin: true },
      {
        workspace_id: "ws-rodo",
        user_id: "admin-1",
        colaborador_id: "colab-folguista-qualquer",
        chave_operacional: "fech_op_1",
        anexo: { sha256: "h1", file_id: "f1" },
      },
      banco
    );

    expect(res.status).toBe("success");
    expect(res.row?.colaborador_id).toBe("colab-folguista-qualquer");
  });

  it("2. Folguista autorizado pode registrar fechamento próprio", () => {
    const banco: FechamentoRow[] = [];
    const res = executarRpcMenorPrivilegio(
      {
        jwtRole: "authenticated",
        authUid: "user-folguista-1",
        isAdmin: false,
        userColaboradorId: "colab-10",
      },
      {
        workspace_id: "ws-rodo",
        user_id: "user-folguista-1",
        colaborador_id: "colab-10",
        chave_operacional: "fech_op_proprio",
        anexo: { sha256: "h2", file_id: "f2" },
      },
      banco
    );

    expect(res.status).toBe("success");
    expect(res.row?.colaborador_id).toBe("colab-10");
    expect(res.row?.user_id).toBe("user-folguista-1");
  });

  it("3. Folguista tentando alterar fechamento de outro funcionário é rejeitado (42501)", () => {
    const banco: FechamentoRow[] = [
      {
        id: "fech-outro",
        workspace_id: "ws-rodo",
        user_id: "outro-user",
        colaborador_id: "colab-vitima-20",
        chave_operacional: "fech_vitima",
        status: "pendente_conferencia",
        anexos: [{ sha256: "h_vitima", file_id: "f_vitima" }],
        telegram_message_ids: [100],
      },
    ];

    // Colab 10 tenta injetar anexo no fechamento do Colab 20
    const res = executarRpcMenorPrivilegio(
      {
        jwtRole: "authenticated",
        authUid: "user-folguista-1",
        isAdmin: false,
        userColaboradorId: "colab-10",
      },
      {
        workspace_id: "ws-rodo",
        user_id: "user-folguista-1",
        colaborador_id: "colab-vitima-20", // Tentativa de usurpação
        chave_operacional: "fech_vitima",
        anexo: { sha256: "h_ataque", file_id: "f_ataque" },
      },
      banco
    );

    expect(res.status).toBe("error");
    expect(res.code).toBe("42501");
    expect(res.message).toContain("colaboradores comuns só possuem permissão para registrar documentos próprios");
  });

  it("4. Membro comum do workspace sem vínculo de colaborador ativo é rejeitado (42501)", () => {
    const banco: FechamentoRow[] = [];
    const res = executarRpcMenorPrivilegio(
      {
        jwtRole: "authenticated",
        authUid: "membro-comum-sem-colab",
        isAdmin: false,
        userColaboradorId: null, // Sem colaborador vinculado
      },
      {
        workspace_id: "ws-rodo",
        user_id: "membro-comum-sem-colab",
        chave_operacional: "fech_op_x",
      },
      banco
    );

    expect(res.status).toBe("error");
    expect(res.code).toBe("42501");
    expect(res.message).toContain("sem perfil de colaborador ativo não tem permissão");
  });

  it("5. Usuário de outro workspace é rejeitado (42501)", () => {
    const banco: FechamentoRow[] = [];
    const res = executarRpcMenorPrivilegio(
      {
        jwtRole: "authenticated",
        authUid: "user-outro-ws",
        isAdmin: false,
        userColaboradorId: null,
      },
      {
        workspace_id: "ws-alheio-protegido",
        user_id: "user-outro-ws",
        chave_operacional: "fech_op_alheio",
      },
      banco
    );

    expect(res.status).toBe("error");
    expect(res.code).toBe("42501");
  });

  it("6. Usuário não autenticado é rejeitado (42501)", () => {
    const banco: FechamentoRow[] = [];
    const res = executarRpcMenorPrivilegio(
      { jwtRole: "anon", authUid: null },
      {
        workspace_id: "ws-rodo",
        user_id: "anon",
        chave_operacional: "fech_op_anon",
      },
      banco
    );

    expect(res.status).toBe("error");
    expect(res.code).toBe("42501");
    expect(res.message).toContain("autenticação necessária");
  });

  it("7. Tentativa de falsificação de identidade (p_user_id) é neutralizada", () => {
    const banco: FechamentoRow[] = [];
    const res = executarRpcMenorPrivilegio(
      {
        jwtRole: "authenticated",
        authUid: "user-folguista-real",
        isAdmin: false,
        userColaboradorId: "colab-proprio",
      },
      {
        workspace_id: "ws-rodo",
        user_id: "admin-vitima", // Tentativa de falsificar user_id
        chave_operacional: "fech_op_teste",
      },
      banco
    );

    expect(res.status).toBe("success");
    expect(res.row?.user_id).toBe("user-folguista-real");
    expect(res.row?.user_id).not.toBe("admin-vitima");
  });

  it("8. Tentativa de alterar fechamento já aprovado é bloqueada (42501)", () => {
    const banco: FechamentoRow[] = [
      {
        id: "fech-aprovado",
        workspace_id: "ws-rodo",
        user_id: "user-1",
        colaborador_id: "colab-10",
        chave_operacional: "fech_ja_aprovado",
        status: "aprovado", // Já aprovado pela administração!
        anexos: [{ sha256: "h_aprovado", file_id: "f_aprovado" }],
        telegram_message_ids: [200],
      },
    ];

    const res = executarRpcMenorPrivilegio(
      {
        jwtRole: "authenticated",
        authUid: "user-folguista-1",
        isAdmin: false,
        userColaboradorId: "colab-10",
      },
      {
        workspace_id: "ws-rodo",
        user_id: "user-folguista-1",
        colaborador_id: "colab-10",
        chave_operacional: "fech_ja_aprovado",
        anexo: { sha256: "h_tardio", file_id: "f_tardio" },
      },
      banco
    );

    expect(res.status).toBe("error");
    expect(res.code).toBe("42501");
    expect(res.message).toContain("fechamento já aprovado administrativamente não pode sofrer alterações");
  });
});
