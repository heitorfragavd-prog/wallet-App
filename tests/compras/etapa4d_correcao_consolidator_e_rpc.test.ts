import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import {
  consolidarItensEmSessao,
} from "../../src/domains/compras/services/ComprasConsolidator";

const migration111Path = "supabase/migrations/111_compras_correcao_rpc_e_schema.sql";
const migration111Sql = existsSync(migration111Path)
  ? readFileSync(migration111Path, "utf-8")
  : "";

describe("Etapa 4D - Gate 1 e Gate 2: Correção de Schema, Compatibilidade RPC e Consolidador", () => {
  describe("Gate 2: Consolidador de Estoque - Correção de pendentesCount e consistência", () => {
    it("não deve lançar ReferenceError com itens inconsistentes ou pendentes (pendentesCount declarado)", () => {
      const itensExistentes = new Map<string, { estoque_atual: number | null; status_estoque: string }>();
      itensExistentes.set("Coca 350ml zero", { estoque_atual: null, status_estoque: "pendente_contagem" });
      itensExistentes.set("Monster ENERGY", { estoque_atual: null, status_estoque: "pendente_contagem" });

      const itensInterpretados = [
        {
          produto_nome: "Coca 350ml zero",
          quantidade_informada: null,
          tipo_informacao: "inconsistente" as const,
          confianca: 0.5,
          is_correcao: false,
        },
        {
          produto_nome: "Monster ENERGY",
          quantidade_informada: null,
          tipo_informacao: "pendente_contagem" as const,
          confianca: 0.0,
          is_correcao: false,
        },
      ];

      expect(() => {
        const resultado = consolidarItensEmSessao(
          itensInterpretados,
          {
            pedidoId: "ped-test-111",
            pedidoStatus: "aguardando_estoque",
            itensExistentes,
            fornecedorNome: "Coca-Cola",
            dataOperacional: "2026-11-17",
          },
          {
            chatId: "-1001",
            nomeUsuario: "Colaborador",
            origemTipo: "telegram_texto",
          }
        );

        expect(resultado.total_itens_confirmados).toBe(0);
        expect(resultado.total_itens_pendentes).toBe(2);
        expect(resultado.status_pedido_novo).toBe("aguardando_estoque");
      }).not.toThrow();
    });

    it("deve refletir status 'estoque_incompleto' quando apenas parte dos itens foi confirmada", () => {
      const itensExistentes = new Map<string, { estoque_atual: number | null; status_estoque: string }>();
      itensExistentes.set("Coca 350ml zero", { estoque_atual: null, status_estoque: "pendente_contagem" });
      itensExistentes.set("Monster ENERGY", { estoque_atual: null, status_estoque: "pendente_contagem" });

      const itensInterpretados = [
        {
          produto_nome: "Coca 350ml zero",
          quantidade_informada: 4,
          tipo_informacao: "confirmado_positivo" as const,
          confianca: 1.0,
          is_correcao: false,
        },
      ];

      const resultado = consolidarItensEmSessao(
        itensInterpretados,
        {
          pedidoId: "ped-test-111",
          pedidoStatus: "aguardando_estoque",
          itensExistentes,
          fornecedorNome: "Coca-Cola",
          dataOperacional: "2026-11-17",
        },
        {
          chatId: "-1001",
          nomeUsuario: "Colaborador",
          origemTipo: "telegram_texto",
        }
      );

      expect(resultado.total_itens_confirmados).toBe(1);
      expect(resultado.total_itens_pendentes).toBe(1);
      expect(resultado.status_pedido_novo).toBe("estoque_incompleto");
    });
  });

  describe("Gate 1: Migration 111 - Compatibilidade de Schema e Hardening de Segurança", () => {
    it("deve adicionar as colunas compatíveis em compras_pedidos sem quebrar dados existentes", () => {
      expect(migration111Sql).toContain("ALTER TABLE public.compras_pedidos ADD COLUMN IF NOT EXISTS data_sugerida_entrega DATE;");
      expect(migration111Sql).toContain("ALTER TABLE public.compras_pedidos ADD COLUMN IF NOT EXISTS canal_envio TEXT;");
      expect(migration111Sql).toContain("ALTER TABLE public.compras_pedidos ADD COLUMN IF NOT EXISTS horario_envio_limite TIME;");
      expect(migration111Sql).toContain("ALTER TABLE public.compras_pedidos ADD COLUMN IF NOT EXISTS observacoes TEXT;");
    });

    it("deve expandir as constraints de compras_estoque_conferencias para status e origem", () => {
      expect(migration111Sql).toContain("compras_estoque_conferencias_status_check");
      expect(migration111Sql).toContain("'aguardando'::text");
      expect(migration111Sql).toContain("compras_estoque_conferencias_origem_check");
      expect(migration111Sql).toContain("'cron_09h'::text");
    });

    it("não deve usar 'current_user = postgres' como bypass em SECURITY DEFINER", () => {
      // Em SECURITY DEFINER, current_user é sempre o dono (postgres), permitindo bypass indevido.
      // A migration 111 valida estritamente session_user = 'postgres' ou auth.role() = 'service_role'.
      expect(migration111Sql).not.toContain("current_user = 'postgres'");
      expect(migration111Sql).toContain("session_user = 'postgres'");
    });

    it("deve inserir dia_semana e simulacao (e não simulacao_modo) no INSERT de compras_pedidos", () => {
      expect(migration111Sql).toContain("dia_semana,");
      expect(migration111Sql).toContain("simulacao,\n        metadata");
      expect(migration111Sql).not.toContain("simulacao_modo,\n        metadata");
    });
  });
});
