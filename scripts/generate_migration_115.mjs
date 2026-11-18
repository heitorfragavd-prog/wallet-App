import fs from 'fs';
import { parseCSV } from './validate_and_ingest_16852.mjs';

const csvPath = 'C:/Users/Heitor/Downloads/atacado_16852_dados_para_antigravity.csv';
const csvContent = fs.readFileSync(csvPath, 'utf8');
const rows = parseCSV(csvContent);

const catalogo = JSON.parse(fs.readFileSync('scripts/backups/catalogo_eyemobile.json', 'utf8'));

const wsId = '2af415b6-76aa-4134-8133-a9b405671c1c';

// Mapping table for PDV code based on PDV Name
function getPdvCodigo(pdvNome) {
  if (!pdvNome) return null;
  const match = catalogo.find(c => c.descricao.trim().toUpperCase() === pdvNome.trim().toUpperCase());
  if (match) return match.codigo;
  const matchPartial = catalogo.find(c => c.descricao.trim().toUpperCase().includes(pdvNome.trim().toUpperCase()));
  if (matchPartial) return matchPartial.codigo;
  if (pdvNome.toUpperCase().includes('FRUIT-TELLA')) return '2032305';
  return null;
}

function sanitizeText(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sanitizeNum(val) {
  if (val === null || val === undefined || isNaN(val)) return 'NULL';
  return String(val);
}

let sql = `-- =============================================================================
-- Migration 115: Catálogo de Referência de Custos de Orçamentos e Cotações de Atacado
-- Documento: Orçamento nº 16852 (13/11/2026) - Fornecedor de Atacado da Bomboniere
-- Valor Total: R$ 4.307,86 (54 Itens Auditados)
-- =============================================================================

-- 1. Criação da Tabela de Referências de Custos de Orçamentos de Atacado
CREATE TABLE IF NOT EXISTS public.referencias_custo_orcamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    origem TEXT NOT NULL DEFAULT 'orcamento_atacado',
    numero_orcamento TEXT NOT NULL DEFAULT '16852',
    data_orcamento DATE NOT NULL DEFAULT '2026-11-13',
    pagina INTEGER NOT NULL,
    codigo_fornecedor TEXT NOT NULL,
    produto_descricao TEXT NOT NULL,
    embalagem TEXT NOT NULL,
    qtd_embalagens NUMERIC(12, 4) NOT NULL,
    preco_embalagem_brl NUMERIC(12, 4) NOT NULL,
    total_brl NUMERIC(12, 4) NOT NULL,
    unidades_por_embalagem NUMERIC(12, 4),
    custo_por_unidade_brl NUMERIC(12, 6),
    gramas_por_embalagem NUMERIC(12, 4),
    custo_por_grama_brl NUMERIC(12, 6),
    qualidade TEXT NOT NULL,
    status_pdv TEXT NOT NULL,
    produto_pdv_nome TEXT,
    produto_pdv_codigo TEXT,
    preco_venda_pdv_relatorio NUMERIC(12, 4),
    lucro_bruto_unitario_brl NUMERIC(12, 4),
    margem_bruta_percentual NUMERIC(12, 2),
    fonte_unidades TEXT,
    nota TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_referencias_custo_orcamento_item UNIQUE (workspace_id, origem, numero_orcamento, codigo_fornecedor)
);

-- 2. Índices de Performance e Integridade
CREATE INDEX IF NOT EXISTS idx_ref_custo_orc_ws ON public.referencias_custo_orcamento(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ref_custo_orc_doc ON public.referencias_custo_orcamento(origem, numero_orcamento);
CREATE INDEX IF NOT EXISTS idx_ref_custo_orc_pdv_cod ON public.referencias_custo_orcamento(produto_pdv_codigo) WHERE produto_pdv_codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ref_custo_orc_status ON public.referencias_custo_orcamento(status_pdv);

-- 3. Habilitação de RLS e Políticas de Segurança
ALTER TABLE public.referencias_custo_orcamento ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'referencias_custo_orcamento' AND policyname = 'ref_custo_orcamento_service_role'
  ) THEN
    CREATE POLICY ref_custo_orcamento_service_role ON public.referencias_custo_orcamento
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'referencias_custo_orcamento' AND policyname = 'ref_custo_orcamento_auth'
  ) THEN
    CREATE POLICY ref_custo_orcamento_auth ON public.referencias_custo_orcamento
      FOR ALL TO authenticated
      USING (
        public.is_active_workspace_member(workspace_id, auth.uid()) OR
        public.is_workspace_executive(workspace_id, auth.uid()) OR
        EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
      )
      WITH CHECK (
        public.is_active_workspace_member(workspace_id, auth.uid()) OR
        public.is_workspace_executive(workspace_id, auth.uid()) OR
        EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = auth.uid())
      );
  END IF;
END $$;

-- 4. Ingestão Idempotente dos 54 Itens do Orçamento 16852
INSERT INTO public.referencias_custo_orcamento (
    workspace_id,
    origem,
    numero_orcamento,
    data_orcamento,
    pagina,
    codigo_fornecedor,
    produto_descricao,
    embalagem,
    qtd_embalagens,
    preco_embalagem_brl,
    total_brl,
    unidades_por_embalagem,
    custo_por_unidade_brl,
    gramas_por_embalagem,
    custo_por_grama_brl,
    qualidade,
    status_pdv,
    produto_pdv_nome,
    produto_pdv_codigo,
    preco_venda_pdv_relatorio,
    lucro_bruto_unitario_brl,
    margem_bruta_percentual,
    fonte_unidades,
    nota
) VALUES
`;

const valueRows = [];

rows.forEach((r, idx) => {
  const pag = parseInt(r[0]);
  const codForn = r[1];
  const prod = r[2];
  const emb = r[3];
  const qtdEmb = parseFloat(r[4]);
  const precoEmb = parseFloat(r[5]);
  const totalItem = parseFloat(r[6]);
  const unEmb = r[7] ? parseFloat(r[7]) : null;
  const custoUn = r[8] ? parseFloat(r[8]) : null;
  const gEmb = r[9] ? parseFloat(r[9]) : null;
  const custoG = r[10] ? parseFloat(r[10]) : null;
  const qualidade = r[11];
  const statusPdv = r[12];
  const pdvNome = r[13] || null;
  const pvPdv = r[14] ? parseFloat(r[14]) : null;
  const fonte = r[15] || null;
  const nota = r[16] || null;

  const codPdv = getPdvCodigo(pdvNome);

  let lucroBruto = null;
  let margem = null;
  if (pvPdv && custoUn && pvPdv > 0) {
    lucroBruto = Number((pvPdv - custoUn).toFixed(4));
    margem = Number(((lucroBruto / pvPdv) * 100).toFixed(2));
  }

  valueRows.push(`(
    '${wsId}',
    'orcamento_atacado',
    '16852',
    '2026-11-13',
    ${pag},
    ${sanitizeText(codForn)},
    ${sanitizeText(prod)},
    ${sanitizeText(emb)},
    ${sanitizeNum(qtdEmb)},
    ${sanitizeNum(precoEmb)},
    ${sanitizeNum(totalItem)},
    ${sanitizeNum(unEmb)},
    ${sanitizeNum(custoUn)},
    ${sanitizeNum(gEmb)},
    ${sanitizeNum(custoG)},
    ${sanitizeText(qualidade)},
    ${sanitizeText(statusPdv)},
    ${sanitizeText(pdvNome)},
    ${sanitizeText(codPdv)},
    ${sanitizeNum(pvPdv)},
    ${sanitizeNum(lucroBruto)},
    ${sanitizeNum(margem)},
    ${sanitizeText(fonte)},
    ${sanitizeText(nota)}
  )`);
});

sql += valueRows.join(',\n');
sql += `
ON CONFLICT (workspace_id, origem, numero_orcamento, codigo_fornecedor) 
DO UPDATE SET
    produto_descricao = EXCLUDED.produto_descricao,
    embalagem = EXCLUDED.embalagem,
    qtd_embalagens = EXCLUDED.qtd_embalagens,
    preco_embalagem_brl = EXCLUDED.preco_embalagem_brl,
    total_brl = EXCLUDED.total_brl,
    unidades_por_embalagem = EXCLUDED.unidades_por_embalagem,
    custo_por_unidade_brl = EXCLUDED.custo_por_unidade_brl,
    gramas_por_embalagem = EXCLUDED.gramas_por_embalagem,
    custo_por_grama_brl = EXCLUDED.custo_por_grama_brl,
    qualidade = EXCLUDED.qualidade,
    status_pdv = EXCLUDED.status_pdv,
    produto_pdv_nome = EXCLUDED.produto_pdv_nome,
    produto_pdv_codigo = EXCLUDED.produto_pdv_codigo,
    preco_venda_pdv_relatorio = EXCLUDED.preco_venda_pdv_relatorio,
    lucro_bruto_unitario_brl = EXCLUDED.lucro_bruto_unitario_brl,
    margem_bruta_percentual = EXCLUDED.margem_bruta_percentual,
    fonte_unidades = EXCLUDED.fonte_unidades,
    nota = EXCLUDED.nota,
    updated_at = now();
`;

fs.writeFileSync('supabase/migrations/115_referencias_custo_orcamento_atacado.sql', sql);
console.log('Migration 115 gerada com sucesso em supabase/migrations/115_referencias_custo_orcamento_atacado.sql');
