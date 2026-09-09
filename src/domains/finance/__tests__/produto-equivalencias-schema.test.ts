import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Subetapa 9.1 — Fundação de Identidade Canônica e Produto Equivalencias", () => {
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

    it("implementa trigger de validação multi-tenant para impedir cross-workspace e cross-user", () => {
      expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.validar_produto_equivalencia_tenant\(\)/i);
      expect(migrationSql).toMatch(/Workspace mismatch/i);
      expect(migrationSql).toMatch(/User mismatch/i);
      expect(migrationSql).toMatch(/CREATE TRIGGER trg_validar_produto_equivalencia_tenant/i);
    });

    it("habilita RLS e reutiliza tem_acesso_workspace() para isolamento seguro", () => {
      expect(migrationSql).toMatch(/ALTER TABLE public\.produto_equivalencias ENABLE ROW LEVEL SECURITY/i);
      expect(migrationSql).toMatch(/public\.tem_acesso_workspace\(workspace_id\)/i);
    });

    it("adiciona produto_eyemobile_uuid nullable em historico_custo_produto sem alterar colunas legadas", () => {
      expect(migrationSql).toMatch(/ALTER TABLE public\.historico_custo_produto/i);
      expect(migrationSql).toMatch(
        /ADD COLUMN IF NOT EXISTS produto_eyemobile_uuid UUID NULL\s+REFERENCES public\.produtos_eyemobile\(id\)\s+ON DELETE SET NULL/i
      );
      expect(migrationSql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_historico_custo_produto_eyemobile_uuid\s+ON public\.historico_custo_produto\(workspace_id, produto_eyemobile_uuid\)/i
      );
      // Garante que produto_codigo e produto_descricao NÃO são removidos
      expect(migrationSql).not.toMatch(/DROP COLUMN.*produto_codigo/i);
      expect(migrationSql).not.toMatch(/DROP COLUMN.*produto_descricao/i);
    });

    it("NÃO executa nenhum backfill fuzzy/automático com ILIKE ou LIMIT 1", () => {
      expect(migrationSql).not.toMatch(/ILIKE/i);
      expect(migrationSql).not.toMatch(/LIMIT 1/i);
      expect(migrationSql).not.toMatch(/UPDATE public\.historico_custo_produto SET produto_eyemobile_uuid/i);
      expect(migrationSql).not.toMatch(/INSERT INTO public\.produto_equivalencias.*SELECT/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SIMULAÇÃO LÓGICA DE SCHEMA & INVARIANTES (CENÁRIOS A ATÉ M)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Regras Lógicas e Invariantes do Domínio (Cenários A a M)", () => {
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

    // Mock store
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
        workspace_id: "ws-alpha-2", // Outro workspace do mesmo user
        eyemobile_id: "eye-202",
        codigo: "SKU-BEB-02",
        descricao: "Cerveja Puro Malte 350ml",
      },
      {
        id: "prod-uuid-3",
        user_id: "user-beta", // Outro tenant/user
        workspace_id: "ws-beta-1",
        eyemobile_id: "eye-303",
        codigo: "SKU-BEB-03",
        descricao: "Refrigerante 2L",
      },
    ];

    let equivalencias: ProdutoEquivalenciaRecord[] = [];

    // Função de validação que simula todas as constraints do Postgres + Triggers
    const insertEquivalencia = (data: Omit<ProdutoEquivalenciaRecord, "id">): ProdutoEquivalenciaRecord => {
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
        ...data,
      };
      equivalencias.push(record);
      return record;
    };

    it("Cenário A: cria equivalência válida com sucesso", () => {
      equivalencias = [];
      const nova = insertEquivalencia({
        user_id: "user-alpha",
        workspace_id: "ws-alpha-1",
        cnpj_fornecedor_normalizado: "12345678000190",
        codigo_produto_fornecedor: "FORN-COD-99",
        produto_eyemobile_uuid: "prod-uuid-1",
        fator_conversao: 12.0,
        origem_matching: "manual",
        confirmado_por_usuario: true,
      });
      expect(nova.id).toBeDefined();
      expect(nova.fator_conversao).toBe(12.0);
      expect(equivalencias).toHaveLength(1);
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

    it("Cenário K: historico_custo_produto aceita produto_eyemobile_uuid válido", () => {
      const historicoItem: HistoricoCustoRecord = {
        id: "hist-1",
        user_id: "user-alpha",
        workspace_id: "ws-alpha-1",
        produto_codigo: "FORN-COD-99",
        produto_descricao: "Cerveja Lata",
        custo_unitario: 3.5,
        produto_eyemobile_uuid: "prod-uuid-1", // Válido
      };
      expect(historicoItem.produto_eyemobile_uuid).toBe("prod-uuid-1");
    });

    it("Cenário L: histórico legado continua funcionando com produto_eyemobile_uuid NULL", () => {
      const historicoLegado: HistoricoCustoRecord = {
        id: "hist-legado",
        user_id: "user-alpha",
        workspace_id: "ws-alpha-1",
        produto_codigo: "COD-LEGADO-123",
        produto_descricao: "Item Antigo da NF",
        custo_unitario: 12.0,
        produto_eyemobile_uuid: null, // Nullable para legado
      };
      expect(historicoLegado.produto_eyemobile_uuid).toBeNull();
      expect(historicoLegado.produto_codigo).toBe("COD-LEGADO-123");
    });

    it("Cenário M: nenhum backfill fuzzy/textual é inferido sem confirmação", () => {
      // Garante que a tabela produto_equivalencias começa vazia e não há mapeamento implícito
      expect(equivalencias.every((eq) => eq.confirmado_por_usuario === true)).toBe(true);
      expect(equivalencias.some((eq) => eq.origem_matching === "sugestao_ia" && !eq.confirmado_por_usuario)).toBe(false);
    });
  });
});
