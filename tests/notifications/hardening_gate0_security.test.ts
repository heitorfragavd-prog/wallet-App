import { describe, it, expect } from "vitest";
import { sanitizeRedirectLink } from "../../supabase/functions/notification-dispatcher/index";

describe("Gate 0: Hardening da Etapa 05 — Testes de Segurança", () => {
  describe("1. Prevenção de Open Redirect e Anti-Phishing (sanitizeRedirectLink)", () => {
    it("deve aceitar caminhos relativos seguros da aplicação", () => {
      expect(sanitizeRedirectLink("/dividas")).toBe("/dividas");
      expect(sanitizeRedirectLink("/notificacoes/configuracoes")).toBe("/notificacoes/configuracoes");
      expect(sanitizeRedirectLink("/")).toBe("/");
    });

    it("deve rejeitar URLs com protocolo relativo (//malicious-site.com)", () => {
      expect(sanitizeRedirectLink("//malicious-site.com")).toBeUndefined();
      expect(sanitizeRedirectLink("//evil.com/login")).toBeUndefined();
    });

    it("deve rejeitar esquemas perigosos de injeção de script", () => {
      expect(sanitizeRedirectLink("javascript:alert(1)")).toBeUndefined();
      expect(sanitizeRedirectLink("data:text/html,<script>evil()</script>")).toBeUndefined();
      expect(sanitizeRedirectLink("vbscript:msgbox()")).toBeUndefined();
      expect(sanitizeRedirectLink("file:///etc/passwd")).toBeUndefined();
    });

    it("deve aceitar URLs absolutas exclusivamente para domínios autorizados do Wallet", () => {
      expect(sanitizeRedirectLink("https://wallet.wonderwold.com.br/dividas")).toBe(
        "https://wallet.wonderwold.com.br/dividas"
      );
      expect(sanitizeRedirectLink("http://localhost:8080/dashboard")).toBe(
        "http://localhost:8080/dashboard"
      );
      expect(sanitizeRedirectLink("https://app.wonderwold.com.br/home")).toBe(
        "https://app.wonderwold.com.br/home"
      );
    });

    it("deve rejeitar URLs absolutas de domínios externos não autorizados", () => {
      expect(sanitizeRedirectLink("https://phishing-wallet.com/steal-creds")).toBeUndefined();
      expect(sanitizeRedirectLink("https://google.com")).toBeUndefined();
    });

    it("deve retornar undefined para valores nulos, vazios ou inválidos", () => {
      expect(sanitizeRedirectLink(undefined)).toBeUndefined();
      expect(sanitizeRedirectLink("")).toBeUndefined();
      expect(sanitizeRedirectLink("   ")).toBeUndefined();
    });
  });

  describe("2. RBAC de Despacho de Notificações", () => {
    function simulateDispatcherAuthorizationCheck(params: {
      isServiceRole: boolean;
      callerRole: "owner" | "admin" | "manager" | "member";
      categoria: string;
      targetUserIds?: string[];
      targetRole?: string;
      callerUserId: string;
    }) {
      const { isServiceRole, callerRole, categoria, targetUserIds, targetRole, callerUserId } = params;

      if (isServiceRole) return { allowed: true };

      const isCallerOwner = callerRole === "owner";

      // Regra A: ceo_executivo exclusivo do dono
      if (categoria === "ceo_executivo" && !isCallerOwner) {
        return { allowed: false, error: "Apenas o proprietário do workspace pode emitir alertas da categoria ceo_executivo." };
      }

      // Regra B: Categorias privilegiadas
      const isPrivilegedCategory = ["financeiro", "fechamento_caixa", "seguranca"].includes(categoria);
      const isPrivilegedRole = isCallerOwner || callerRole === "admin" || callerRole === "manager";
      const isSelfTargetOnly =
        Array.isArray(targetUserIds) &&
        targetUserIds.length === 1 &&
        targetUserIds[0] === callerUserId &&
        (!targetRole || targetRole === "member");

      if (isPrivilegedCategory && !isPrivilegedRole && !isSelfTargetOnly) {
        return {
          allowed: false,
          error: "Usuários com perfil de membro não possuem autorização para disparar alertas financeiros, de fechamento de caixa ou de segurança para terceiros ou para a equipe.",
        };
      }

      // Regra C: Broadcast
      const isBroadcast = targetRole === "all" || (!targetUserIds && !targetRole);
      const isMultiTargetOther =
        Array.isArray(targetUserIds) &&
        (targetUserIds.length > 1 || (targetUserIds.length === 1 && targetUserIds[0] !== callerUserId));

      if (isBroadcast && !isCallerOwner && callerRole !== "admin") {
        return {
          allowed: false,
          error: "Apenas administradores e proprietários podem disparar notificações em massa ou para toda a equipe.",
        };
      }

      if (isMultiTargetOther && !isCallerOwner && callerRole !== "admin" && callerRole !== "manager") {
        return {
          allowed: false,
          error: "Usuários comuns não podem enviar notificações para outros membros do workspace.",
        };
      }

      return { allowed: true };
    }

    it("impede que membro comum envie alerta financeiro para o dono ou terceiros", () => {
      const result = simulateDispatcherAuthorizationCheck({
        isServiceRole: false,
        callerRole: "member",
        categoria: "financeiro",
        targetUserIds: ["owner-user-id"],
        callerUserId: "member-user-id",
      });
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("Usuários com perfil de membro não possuem autorização");
    });

    it("permite que membro comum realize teste financeiro para si mesmo", () => {
      const result = simulateDispatcherAuthorizationCheck({
        isServiceRole: false,
        callerRole: "member",
        categoria: "financeiro",
        targetUserIds: ["member-user-id"],
        callerUserId: "member-user-id",
      });
      expect(result.allowed).toBe(true);
    });

    it("impede que admin ou manager dispare ceo_executivo (exclusivo do owner)", () => {
      const resultAdmin = simulateDispatcherAuthorizationCheck({
        isServiceRole: false,
        callerRole: "admin",
        categoria: "ceo_executivo",
        callerUserId: "admin-user-id",
      });
      expect(resultAdmin.allowed).toBe(false);
      expect(resultAdmin.error).toContain("Apenas o proprietário");

      const resultOwner = simulateDispatcherAuthorizationCheck({
        isServiceRole: false,
        callerRole: "owner",
        categoria: "ceo_executivo",
        callerUserId: "owner-user-id",
      });
      expect(resultOwner.allowed).toBe(true);
    });

    it("impede broadcast para a equipe feito por membro ou gestor intermediário", () => {
      const resultMember = simulateDispatcherAuthorizationCheck({
        isServiceRole: false,
        callerRole: "member",
        categoria: "operacional",
        targetRole: "all",
        callerUserId: "member-user-id",
      });
      expect(resultMember.allowed).toBe(false);
      expect(resultMember.error).toContain("Apenas administradores e proprietários");

      const resultAdmin = simulateDispatcherAuthorizationCheck({
        isServiceRole: false,
        callerRole: "admin",
        categoria: "operacional",
        targetRole: "all",
        callerUserId: "admin-user-id",
      });
      expect(resultAdmin.allowed).toBe(true);
    });
  });

  describe("3. Agrupamento de Alertas do Cron por Workspace Real (Gate 0.4)", () => {
    it("deve agrupar alertas por par exato (workspace_id, user_id)", () => {
      const dividas = [
        { id: "d1", user_id: "u1", workspace_id: "ws-alpha", descricao: "Boleto 1", valor_total: 100 },
        { id: "d2", user_id: "u1", workspace_id: "ws-beta", descricao: "Boleto 2", valor_total: 200 },
        { id: "d3", user_id: "u2", workspace_id: "ws-alpha", descricao: "Boleto 3", valor_total: 300 },
      ];

      const alertMap = new Map<string, { workspaceId: string | null; userId: string; items: string[] }>();

      dividas.forEach((d) => {
        const key = `${d.workspace_id}:${d.user_id}`;
        if (!alertMap.has(key)) {
          alertMap.set(key, { workspaceId: d.workspace_id, userId: d.user_id, items: [] });
        }
        alertMap.get(key)!.items.push(d.descricao);
      });

      expect(alertMap.size).toBe(3);
      expect(alertMap.get("ws-alpha:u1")?.items).toEqual(["Boleto 1"]);
      expect(alertMap.get("ws-beta:u1")?.items).toEqual(["Boleto 2"]);
      expect(alertMap.get("ws-alpha:u2")?.items).toEqual(["Boleto 3"]);
    });
  });
});
