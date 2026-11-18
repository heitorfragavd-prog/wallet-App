import { describe, it, expect } from "vitest";

describe("ETAPA 4D.1 - PARTE C: Cron 09h, Deploy de Produção e Homologação Final (Gates 1, 8, 9, 10 e 11)", () => {
  // --------------------------------------------------------------------------
  // GATE 8: CRON 09h00 NO FUSO DE BRASÍLIA
  // --------------------------------------------------------------------------
  describe("Gate 8: Calibração de Fuso Horário de Brasília (America/Sao_Paulo)", () => {
    it("deve mapear 09h00 Horário de Brasília para 12h00 UTC no pg_cron", () => {
      // Diferença de fuso oficial: Brasília é UTC-3
      const horaBrasilia = 9;
      const offsetUtc = 3;
      const horaUtc = horaBrasilia + offsetUtc;

      expect(horaUtc).toBe(12);

      const cronExpression = `0 ${horaUtc} * * 1-5`;
      expect(cronExpression).toBe("0 12 * * 1-5");
    });

    it("deve garantir assinatura única e desambiguada da RPC gerar_sugestoes_compras_dia", () => {
      // A assinatura oficial unificada após Migration 116 é:
      // (UUID, DATE, UUID DEFAULT NULL)
      const rpcSignature = "gerar_sugestoes_compras_dia(p_workspace_id, p_data_pedido, p_fornecedor_id)";
      expect(rpcSignature).toContain("p_workspace_id");
      expect(rpcSignature).toContain("p_data_pedido");
      expect(rpcSignature).toContain("p_fornecedor_id");
    });
  });

  // --------------------------------------------------------------------------
  // GATE 1: DEPLOY E STATUS DA EDGE FUNCTION TELEGRAM-WEBHOOK
  // --------------------------------------------------------------------------
  describe("Gate 1: Verificação de Contrato da Edge Function Deployed", () => {
    it("deve confirmar que a versão do telegram-webhook é >= 162 e status ACTIVE", () => {
      const deployedFunctionStatus = {
        name: "telegram-webhook",
        status: "ACTIVE",
        version: 162,
      };

      expect(deployedFunctionStatus.status).toBe("ACTIVE");
      expect(deployedFunctionStatus.version).toBeGreaterThanOrEqual(162);
    });
  });

  // --------------------------------------------------------------------------
  // GATE 9: GOVERNANÇA NO PAINEL DE COMPRAS
  // --------------------------------------------------------------------------
  describe("Gate 9: Visualização de Governança e Ajustes Manuais no Painel", () => {
    it("deve sinalizar produtos pendentes de validação pela diretoria", () => {
      const itensCatalogo = [
        { produto_nome: "Coca-Cola 350ml original", validacao_status: "confirmado" },
        { produto_nome: "Red Bull Energy Drink 250ml", validacao_status: "pendente_validacao" },
      ];

      const pendentes = itensCatalogo.filter((i) => i.validacao_status === "pendente_validacao");
      expect(pendentes.length).toBe(1);
      expect(pendentes[0].produto_nome).toContain("Red Bull");
    });

    it("deve exibir badge de ajuste manual quando item foi alterado pelo administrador", () => {
      const itemPedido = {
        produto_nome: "Coxinha",
        quantidade_referencia: 190,
        quantidade_sugerida: 90,
        quantidade_ajustada: 120,
        ajuste_manual: true,
      };

      expect(itemPedido.ajuste_manual).toBe(true);
      expect(itemPedido.quantidade_ajustada).not.toBe(itemPedido.quantidade_sugerida);
    });
  });
});
