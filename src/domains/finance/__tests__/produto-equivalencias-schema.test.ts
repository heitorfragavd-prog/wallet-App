import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Subetapa 9.1 — Fundação de Identidade Canônica e Produto Equivalencias (Hardened)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../../../supabase/migrations/20260909110000_produto_equivalencias_foundation.sql"
  );
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. VALIDAÇÃO ESTÁTICA DO DDL DA MIGRATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe("DDL & Schema Migration Integrity", () => {
    it("arquivo de migration existe com timestamp posterior a 20260908122000", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const filename = path.basename(migrationPath);
      expect(filename).toMatch(/^20260909110000_produto_equivalencias_foundation\.sql$/);
    });

    it("cria tabela public.produto_equivalencias com PK UUID", () => {
      expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.produto_equivalencias\s*\(/i);
      expect(migrationSql).toMatch(/id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
    });

    it("possui foreign keys obrigatórias para user_id e workspace_id com ON DELETE CASCADE", () => {
      expect(migrationSql).toMatch(/user_id UUID NOT NULL\s+REFERENCES auth\.users\(id\)\s+ON DELETE CASCADE/i);
      expect(migrationSql).toMatch(/workspace_id UUID NOT NULL\s+REFERENCES public\.workspaces\(id\)\s+ON DELETE CASCADE/i);
    });

    it("define produto_eyemobile_uuid como CHAVE CANÔNICA apontando para produtos_eyemobile(id) ON DELETE RESTRICT", () => {
      expect(migrationSql).toMatch(
        /produto_eyemobile_uuid UUID NOT NULL\s+REFERENCES public\.produtos_eyemobile\(id\)\s+ON DELETE RESTRICT/i
      );
      // Garante que NÃO existe uma segunda fonte de verdade em texto (ex: produto_eyemobile_id TEXT)
      expect(migrationSql).not.toMatch(/produto_eyemobile_id TEXT/i);
    });

    it("exige fator_conversao NUMERIC(12,6) NOT NULL SEM DEFAULT 1 e com CHECK positivo", () => {
      expect(migrationSql).toMatch(/fator_conversao NUMERIC\(12,\s*6\)\s+NOT NULL/i);
      expect(migrationSql).not.toMatch(/fator_conversao\s+NUMERIC[^\n,;]*DEFAULT/i);
      expect(migrationSql).toMatch(/CONSTRAINT chk_produto_equivalencias_fator_positivo\s+CHECK\s*\(\s*fator_conversao\s*>\s*0\s*\)/i);
    });

    it("define confirmado_por_usuario com DEFAULT false (Fail-Safe)", () => {
      expect(migrationSql).toMatch(/confirmado_por_usuario BOOLEAN NOT NULL DEFAULT false/i);
      expect(migrationSql).not.toMatch(/confirmado_por_usuario BOOLEAN NOT NULL DEFAULT true/i);
    });

    it("normaliza CNPJ exigindo apenas dígitos", () => {
      expect(migrationSql).toMatch(/cnpj_fornecedor_normalizado TEXT NOT NULL/i);
      expect(migrationSql).toMatch(/CONSTRAINT chk_produto_equivalencias_cnpj_digitos\s+CHECK\s*\(\s*cnpj_fornecedor_normalizado\s*~\s*'(\^\[0-9\]\+\$)'\s*\)/i);
    });

    it("impõe constraint UNIQUE por workspace, CNPJ normalizado e código do fornecedor", () => {
      expect(migrationSql).toMatch(
        /CONSTRAINT unq_produto_equivalencia_fornecedor\s+UNIQUE\s*\(\s*workspace_id,\s*cnpj_fornecedor_normalizado,\s*codigo_produto_fornecedor\s*\)/i
      );
    });

    it("possui índice reverso em (workspace_id, produto_eyemobile_uuid)", () => {
      expect(migrationSql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_produto_equivalencias_reverso\s+ON public\.produto_equivalencias\s*\(\s*workspace_id,\s*produto_eyemobile_uuid\s*\)/i
      );
    });

    it("possui índice de listagem em (user_id, workspace_id)", () => {
      expect(migrationSql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_produto_equivalencias_user_ws\s+ON public\.produto_equivalencias\s*\(\s*user_id,\s*workspace_id\s*\)/i
      );
    });

    it("reutiliza o trigger compartilhado update_updated_at_column()", () => {
      expect(migrationSql).toMatch(/CREATE TRIGGER trg_produto_equivalencias_updated_at/i);
      expect(migrationSql).toMatch(/EXECUTE FUNCTION public\.update_updated_at_column\(\)/i);
    });

    it("implementa trigger de validação multi-tenant para impedir cross-workspace e cross-user em produto_equivalencias", () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.validar_produto_equivalencia_tenant\(\)/i);
      expect(migrationSql).toMatch(/CREATE TRIGGER trg_validar_produto_equivalencia_tenant/i);
    });

    it("habilita RLS com modelo consistente (SELECT compartilhado no workspace, mutações restritas ao owner)", () => {
      expect(migrationSql).toMatch(/ALTER TABLE public\.produto_equivalencias ENABLE ROW LEVEL SECURITY/i);
      // SELECT: tem_acesso_workspace
      expect(migrationSql).toMatch(/CREATE POLICY "produto_equivalencias_select_policy"[^;]+USING\s*\(\s*public\.tem_acesso_workspace\(workspace_id\)\s*\)/i);
      // INSERT: tem_acesso_workspace AND auth.uid() = user_id
      expect(migrationSql).toMatch(/CREATE POLICY "produto_equivalencias_insert_policy"[^;]+WITH CHECK\s*\(\s*public\.tem_acesso_workspace\(workspace_id\)\s+AND\s+auth\.uid\(\)\s*=\s*user_id\s*\)/i);
      // UPDATE: tem_acesso_workspace AND auth.uid() = user_id
      expect(migrationSql).toMatch(/CREATE POLICY "produto_equivalencias_update_policy"[^;]+USING\s*\(\s*public\.tem_acesso_workspace\(workspace_id\)\s+AND\s+auth\.uid\(\)\s*=\s*user_id\s*\)/i);
      // DELETE: tem_acesso_workspace AND auth.uid() = user_id
      expect(migrationSql).toMatch(/CREATE POLICY "produto_equivalencias_delete_policy"[^;]+USING\s*\(\s*public\.tem_acesso_workspace\(workspace_id\)\s+AND\s+auth\.uid\(\)\s*=\s*user_id\s*\)/i);
    });

    it("adiciona produto_eyemobile_uuid nullable em historico_custo_produto e trigger multi-tenant", () => {
      expect(migrationSql).toMatch(/ALTER TABLE public\.historico_custo_produto/i);
      expect(migrationSql).toMatch(
        /ADD COLUMN IF NOT EXISTS produto_eyemobile_uuid UUID NULL\s+REFERENCES public\.produtos_eyemobile\(id\)\s+ON DELETE SET NULL/i
      );
      expect(migrationSql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_historico_custo_produto_eyemobile_uuid\s+ON public\.historico_custo_produto\(workspace_id, produto_eyemobile_uuid\)/i
      );
      // Trigger cross-workspace em historico_custo_produto
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.validar_historico_custo_produto_tenant\(\)/i);
      expect(migrationSql).toMatch(/CREATE TRIGGER trg_validar_historico_custo_produto_tenant/i);
    });

    it("NÃO executa nenhum backfill fuzzy/automático com ILIKE ou LIMIT 1", () => {
      expect(migrationSql).not.toMatch(/ILIKE/i);
      expect(migrationSql).not.toMatch(/LIMIT 1/i);
      expect(migrationSql).not.toMatch(/UPDATE public\.historico_custo_produto SET produto_eyemobile_uuid/i);
      expect(migrationSql).not.toMatch(/INSERT INTO public\.produto_equivalencias.*SELECT/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SIMULAÇÃO LÓGICA DE SCHEMA & INVARIANTES (CENÁRIOS A ATÉ N + RLS)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Regras Lógicas e Invariantes do Domínio (Cenários A a N + RLS)", () => {
    interface ProdutoEyemobileRecord {
      id: string;
      user_id: string;
      workspace_id: string;
      eyemobile_id: string;
      codigo: string;
      descricao: string;
    }

    interface ProdutoEquivalenciaRecord {
      id: string;
      user_id: string;
      workspace_id: string;
      cnpj_fornecedor_normalizado: string;
      codigo_produto_fornecedor: string;
      produto_eyemobile_uuid: string;
      fator_conversao: number;
      origem_matching: "manual" | "migracao_legada" | "ean_gtin" | "equivalencia_confirmada" | "sugestao_ia";
      confirmado_por_usuario: boolean;
    }

    interface HistoricoCustoRecord {
      id: string;
      user_id: string;
      workspace_id: string;
      produto_codigo: string;
      produto_descricao: string;
      custo_unitario: number;
      produto_eyemobile_uuid: string | null;
    }

    interface WorkspaceMember {
      workspace_id: string;
      user_id: string;
      role: "admin" | "member";
      active: boolean;
    }

    // Mock store
    const workspaces = [
      { id: "ws-alpha-1", user_id: "user-alpha" },
      { id: "ws-alpha-2", user_id: "user-alpha" },
      { id: "ws-beta-1", user_id: "user-beta" },
    ];

    const workspaceMembers: WorkspaceMember[] = [
      { workspace_id: "ws-alpha-1", user_id: "user-admin-alpha", role: "admin", active: true },
    ];

    const produtos: ProdutoEyemobileRecord[] = [
      {
        id: "prod-uuid-1",
        user_id: "user-alpha",
        workspace_id: "ws-alpha-1",
        eyemobile_id: "eye-101",
        codigo: "SKU-BEB-01",
        descricao: "Cerveja Pilsen 350ml",
      },
      {
        id: "prod-uuid-2",
        user_id: "user-alpha",
        workspace_id: "ws-alpha-2",
        eyemobile_id: "eye-202",
        codigo: "SKU-BEB-02",
        descricao: "Cerveja Puro Malte 350ml",
      },
      {
        id: "prod-uuid-3",
        user_id: "user-beta",
        workspace_id: "ws-beta-1",
        eyemobile_id: "eye-303",
        codigo: "SKU-BEB-03",
        descricao: "Refrigerante 2L",
      },
    ];

    let equivalencias: ProdutoEquivalenciaRecord[] = [];
    const historicoCustos: HistoricoCustoRecord[] = [];

    // Helper tem_acesso_workspace
    const temAcessoWorkspace = (workspaceId: string, authUid: string): boolean => {
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (ws && ws.user_id === authUid) return true;
      const member = workspaceMembers.find(
        (m) => m.workspace_id === workspaceId && m.user_id === authUid && m.active && m.role === "admin"
      );
      return !!member;
    };

    // Helper insertEquivalencia
    const insertEquivalencia = (
      data: Omit<ProdutoEquivalenciaRecord, "id" | "confirmado_por_usuario"> & { confirmado_por_usuario?: boolean },
      authUid: string = data.user_id
    ): ProdutoEquivalenciaRecord => {
      // RLS INSERT: tem_acesso_workspace(workspace_id) AND auth.uid() = user_id
      if (!temAcessoWorkspace(data.workspace_id, authUid) || authUid !== data.user_id) {
        throw new Error("RLS Violation: user cannot INSERT into produto_equivalencias");
      }

      // 1. CHECK fator_conversao > 0
      if (typeof data.fator_conversao !== "number" || isNaN(data.fator_conversao) || data.fator_conversao <= 0) {
        throw new Error("chk_produto_equivalencias_fator_positivo: fator_conversao deve ser > 0");
      }

      // 2. CHECK cnpj_fornecedor_normalizado apenas dígitos
      if (!/^[0-9]+$/.test(data.cnpj_fornecedor_normalizado)) {
        throw new Error("chk_produto_equivalencias_cnpj_digitos: CNPJ normalizado deve conter apenas dígitos");
      }

      // 3. CHECK codigo_produto_fornecedor não vazio
      if (!data.codigo_produto_fornecedor || data.codigo_produto_fornecedor.trim() === "") {
        throw new Error("chk_produto_equivalencias_codigo_fornecedor_not_empty");
      }

      // 4. FK e Trigger Multi-tenant (Workspace & User Match)
      const produto = produtos.find((p) => p.id === data.produto_eyemobile_uuid);
      if (!produto) {
        throw new Error("FK Violation: Produto Eyemobile inexistente");
      }
      if (produto.workspace_id !== data.workspace_id) {
        throw new Error(
          `Workspace mismatch: produto pertence ao workspace ${produto.workspace_id}, mas equivalência pertence ao workspace ${data.workspace_id}`
        );
      }
      if (produto.user_id !== data.user_id) {
        throw new Error(
          `User mismatch: produto pertence ao usuário ${produto.user_id}, mas equivalência foi criada pelo usuário ${data.user_id}`
        );
      }

      // 5. UNIQUE (workspace_id, cnpj_fornecedor_normalizado, codigo_produto_fornecedor)
      const duplicate = equivalencias.find(
        (eq) =>
          eq.workspace_id === data.workspace_id &&
          eq.cnpj_fornecedor_normalizado === data.cnpj_fornecedor_normalizado &&
          eq.codigo_produto_fornecedor === data.codigo_produto_fornecedor
      );
      if (duplicate) {
        throw new Error("unq_produto_equivalencia_fornecedor: duplicidade de chave");
      }

      const record: ProdutoEquivalenciaRecord = {
        id: `eq-${Date.now()}-${Math.random()}`,
        confirmado_por_usuario: data.confirmado_por_usuario ?? false, // Default false!
        ...data,
      };
      equivalencias.push(record);
      return record;
    };

    // Helper insertHistoricoCusto com trigger tenant
    const insertHistoricoCusto = (data: Omit<HistoricoCustoRecord, "id">): HistoricoCustoRecord => {
      if (data.produto_eyemobile_uuid !== null) {
        const produto = produtos.find((p) => p.id === data.produto_eyemobile_uuid);
        if (!produto) {
          throw new Error("FK Violation: Produto Eyemobile inexistente");
        }
        if (produto.workspace_id !== data.workspace_id) {
          throw new Error(
            `Workspace mismatch: produto pertence ao workspace ${produto.workspace_id}, mas histórico pertence ao workspace ${data.workspace_id}`
          );
        }
        if (produto.user_id !== data.user_id) {
          throw new Error(
            `User mismatch: produto pertence ao usuário ${produto.user_id}, mas histórico foi criado pelo usuário ${data.user_id}`
          );
        }
      }

      const record: HistoricoCustoRecord = {
        id: `hist-${Date.now()}-${Math.random()}`,
        ...data,
      };
      historicoCustos.push(record);
      return record;
    };

    it("Cenário A: cria equivalência válida com default confirmado_por_usuario = false", () => {
      equivalencias = [];
      const nova = insertEquivalencia({
        user_id: "user-alpha",
        workspace_id: "ws-alpha-1",
        cnpj_fornecedor_normalizado: "12345678000190",
        codigo_produto_fornecedor: "FORN-COD-99",
        produto_eyemobile_uuid: "prod-uuid-1",
        fator_conversao: 12.0,
        origem_matching: "manual",
      });
      expect(nova.id).toBeDefined();
      expect(nova.fator_conversao).toBe(12.0);
      expect(nova.confirmado_por_usuario).toBe(false); // DEFAULT false comprovado
      expect(equivalencias).toHaveLength(1);
    });

    it("sugestao_ia sem confirmação explícita resulta em confirmado_por_usuario = false", () => {
      const sugestao = insertEquivalencia({
        user_id: "user-alpha",
        workspace_id: "ws-alpha-1",
        cnpj_fornecedor_normalizado: "12345678000190",
        codigo_produto_fornecedor: "FORN-COD-AI",
        produto_eyemobile_uuid: "prod-uuid-1",
        fator_conversao: 6.0,
        origem_matching: "sugestao_ia",
      });
      expect(sugestao.origem_matching).toBe("sugestao_ia");
      expect(sugestao.confirmado_por_usuario).toBe(false);
    });

    it("Cenário B: mesmo workspace + CNPJ + código não pode ter duas equivalências", () => {
      expect(() => {
        insertEquivalencia({
          user_id: "user-alpha",
          workspace_id: "ws-alpha-1",
          cnpj_fornecedor_normalizado: "12345678000190",
          codigo_produto_fornecedor: "FORN-COD-99", // Já cadastrado
          produto_eyemobile_uuid: "prod-uuid-1",
          fator_conversao: 24.0,
          origem_matching: "manual",
          confirmado_por_usuario: true,
        });
      }).toThrow(/unq_produto_equivalencia_fornecedor/);
    });

    it("Cenário C: mesmo código de fornecedor em dois CNPJs diferentes é permitido", () => {
      const nova = insertEquivalencia({
        user_id: "user-alpha",
        workspace_id: "ws-alpha-1",
        cnpj_fornecedor_normalizado: "98765432000111", // CNPJ diferente!
        codigo_produto_fornecedor: "FORN-COD-99", // Mesmo código de produto
        produto_eyemobile_uuid: "prod-uuid-1",
        fator_conversao: 6.0,
        origem_matching: "manual",
        confirmado_por_usuario: true,
      });
      expect(nova.cnpj_fornecedor_normalizado).toBe("98765432000111");
    });

    it("Cenário D: mesma equivalência em dois workspaces diferentes é permitida", () => {
      const nova = insertEquivalencia({
        user_id: "user-alpha",
        workspace_id: "ws-alpha-2", // Workspace 2!
        cnpj_fornecedor_normalizado: "12345678000190",
        codigo_produto_fornecedor: "FORN-COD-99",
        produto_eyemobile_uuid: "prod-uuid-2", // Produto do Workspace 2
        fator_conversao: 12.0,
        origem_matching: "manual",
        confirmado_por_usuario: true,
      });
      expect(nova.workspace_id).toBe("ws-alpha-2");
    });

    it("Cenário E: fator_conversao = 0 é rejeitado", () => {
      expect(() => {
        insertEquivalencia({
          user_id: "user-alpha",
          workspace_id: "ws-alpha-1",
          cnpj_fornecedor_normalizado: "12345678000190",
          codigo_produto_fornecedor: "FORN-ZERO",
          produto_eyemobile_uuid: "prod-uuid-1",
          fator_conversao: 0,
          origem_matching: "manual",
          confirmado_por_usuario: true,
        });
      }).toThrow(/fator_conversao deve ser > 0/);
    });

    it("Cenário F: fator_conversao negativo é rejeitado", () => {
      expect(() => {
        insertEquivalencia({
          user_id: "user-alpha",
          workspace_id: "ws-alpha-1",
          cnpj_fornecedor_normalizado: "12345678000190",
          codigo_produto_fornecedor: "FORN-NEG",
          produto_eyemobile_uuid: "prod-uuid-1",
          fator_conversao: -5.0,
          origem_matching: "manual",
          confirmado_por_usuario: true,
        });
      }).toThrow(/fator_conversao deve ser > 0/);
    });

    it("Cenário G: CNPJ com pontuação/letras é rejeitado na coluna normalizada", () => {
      expect(() => {
        insertEquivalencia({
          user_id: "user-alpha",
          workspace_id: "ws-alpha-1",
          cnpj_fornecedor_normalizado: "12.345.678/0001-90", // Não normalizado
          codigo_produto_fornecedor: "FORN-FORMAT",
          produto_eyemobile_uuid: "prod-uuid-1",
          fator_conversao: 1.0,
          origem_matching: "manual",
          confirmado_por_usuario: true,
        });
      }).toThrow(/apenas dígitos/);
    });

    it("Cenário H: produto_eyemobile_uuid inexistente é rejeitado pela FK", () => {
      expect(() => {
        insertEquivalencia({
          user_id: "user-alpha",
          workspace_id: "ws-alpha-1",
          cnpj_fornecedor_normalizado: "12345678000190",
          codigo_produto_fornecedor: "FORN-NOTFOUND",
          produto_eyemobile_uuid: "uuid-fantasma-999",
          fator_conversao: 1.0,
          origem_matching: "manual",
          confirmado_por_usuario: true,
        });
      }).toThrow(/Produto Eyemobile inexistente/);
    });

    it("Cenário I: produto de outro workspace é rejeitado pelo trigger de tenant", () => {
      expect(() => {
        insertEquivalencia({
          user_id: "user-alpha",
          workspace_id: "ws-alpha-2", // Tentando associar no ws-alpha-2
          cnpj_fornecedor_normalizado: "12345678000190",
          codigo_produto_fornecedor: "FORN-CROSS-WS",
          produto_eyemobile_uuid: "prod-uuid-1", // Pertence ao ws-alpha-1!
          fator_conversao: 1.0,
          origem_matching: "manual",
          confirmado_por_usuario: true,
        });
      }).toThrow(/Workspace mismatch/);
    });

    it("Cenário J: produto de outro tenant/usuário é rejeitado pelo trigger de tenant", () => {
      expect(() => {
        insertEquivalencia({
          user_id: "user-alpha",
          workspace_id: "ws-alpha-1",
          cnpj_fornecedor_normalizado: "12345678000190",
          codigo_produto_fornecedor: "FORN-CROSS-USER",
          produto_eyemobile_uuid: "prod-uuid-3", // Pertence ao user-beta / ws-beta-1!
          fator_conversao: 1.0,
          origem_matching: "manual",
          confirmado_por_usuario: true,
        });
      }).toThrow(/Workspace mismatch|User mismatch/);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TESTES DE RLS (CONSISTÊNCIA OWNER-ONLY MUTATION)
    // ─────────────────────────────────────────────────────────────────────────
    describe("RLS Policies (Owner-only mutation)", () => {
      it("Owner pode SELECT nas equivalências do seu workspace", () => {
        expect(temAcessoWorkspace("ws-alpha-1", "user-alpha")).toBe(true);
      });

      it("Admin do workspace pode SELECT nas equivalências do workspace", () => {
        expect(temAcessoWorkspace("ws-alpha-1", "user-admin-alpha")).toBe(true);
      });

      it("Usuário externo NÃO pode SELECT nas equivalências", () => {
        expect(temAcessoWorkspace("ws-alpha-1", "user-outsider")).toBe(false);
      });

      it("Admin do workspace NÃO pode INSERT (mutação é owner-only)", () => {
        expect(() => {
          insertEquivalencia(
            {
              user_id: "user-alpha", // Pertence ao owner
              workspace_id: "ws-alpha-1",
              cnpj_fornecedor_normalizado: "12345678000190",
              codigo_produto_fornecedor: "FORN-ADMIN-TEST",
              produto_eyemobile_uuid: "prod-uuid-1",
              fator_conversao: 1.0,
              origem_matching: "manual",
            },
            "user-admin-alpha" // Auth UID é o admin, não o owner!
          );
        }).toThrow(/RLS Violation/);
      });

      it("Usuário externo NÃO pode mutar", () => {
        expect(() => {
          insertEquivalencia(
            {
              user_id: "user-alpha",
              workspace_id: "ws-alpha-1",
              cnpj_fornecedor_normalizado: "12345678000190",
              codigo_produto_fornecedor: "FORN-OUTSIDER-TEST",
              produto_eyemobile_uuid: "prod-uuid-1",
              fator_conversao: 1.0,
              origem_matching: "manual",
            },
            "user-outsider"
          );
        }).toThrow(/RLS Violation/);
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TESTES DE historico_custo_produto (CENÁRIOS K A N)
    // ─────────────────────────────────────────────────────────────────────────
    describe("Proteção Cross-Workspace em historico_custo_produto (Cenários K a N)", () => {
      it("Cenário K: histórico com produto correto no mesmo workspace/user é permitido", () => {
        const item = insertHistoricoCusto({
          user_id: "user-alpha",
          workspace_id: "ws-alpha-1",
          produto_codigo: "FORN-COD-99",
          produto_descricao: "Cerveja Lata",
          custo_unitario: 3.5,
          produto_eyemobile_uuid: "prod-uuid-1",
        });
        expect(item.produto_eyemobile_uuid).toBe("prod-uuid-1");
      });

      it("Cenário L: histórico legado com UUID NULL continua permitido", () => {
        const item = insertHistoricoCusto({
          user_id: "user-alpha",
          workspace_id: "ws-alpha-1",
          produto_codigo: "LEGADO-SEM-UUID",
          produto_descricao: "Item Antigo",
          custo_unitario: 10.0,
          produto_eyemobile_uuid: null,
        });
        expect(item.produto_eyemobile_uuid).toBeNull();
      });

      it("Cenário M: histórico workspace A apontando produto workspace B é rejeitado", () => {
        expect(() => {
          insertHistoricoCusto({
            user_id: "user-alpha",
            workspace_id: "ws-alpha-2", // Workspace 2
            produto_codigo: "CROSS-WS",
            produto_descricao: "Item Inválido",
            custo_unitario: 5.0,
            produto_eyemobile_uuid: "prod-uuid-1", // Produto pertence ao Workspace 1!
          });
        }).toThrow(/Workspace mismatch/);
      });

      it("Cenário N: histórico user A apontando produto user B é rejeitado", () => {
        expect(() => {
          insertHistoricoCusto({
            user_id: "user-alpha",
            workspace_id: "ws-alpha-1",
            produto_codigo: "CROSS-USER",
            produto_descricao: "Item Inválido",
            custo_unitario: 5.0,
            produto_eyemobile_uuid: "prod-uuid-3", // Produto pertence ao User Beta / Workspace Beta!
          });
        }).toThrow(/Workspace mismatch|User mismatch/);
      });
    });
  });
});
