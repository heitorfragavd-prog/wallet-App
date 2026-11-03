import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CORE_TABLES = [
  'workspaces',
  'workspace_members',
  'profiles',
  'fechamentos_caixa',
  'eyemobile_config',
  'eyemobile_produtos',
  'eyemobile_sync_logs',
  'divipay_config',
  'divipay_transacoes',
  'divipay_conciliacoes',
  'colaboradores',
  'colaborador_acertos',
  'colaborador_ajustes',
  'colaborador_acerto_itens',
  'delivery_channels',
  'delivery_orders',
  'delivery_order_items',
  'delivery_catalog_items',
  'wallet_growth_opportunities',
  'wallet_commercial_experiments',
  'contas_usuario',
  'faturas_cartao',
  'categorias',
  'centros_custo'
];

console.log('=== INICIANDO BACKUP AUDITADO DE DADOS DE PRODUÇÃO ===');
const backupResult = {
  timestamp: new Date().toISOString(),
  environment: 'production',
  project_ref: 'hdeguzxkdvebdrrutbnx',
  summary: {},
  tables: {}
};

// 1. Auditoria e Totais de Controle de Transações
console.log('1. Coletando totais de controle da tabela transacoes (84.992 registros)...');
try {
  const auditSql = `
    SELECT 
      count(*) as total_count,
      min(data) as min_date,
      max(data) as max_date,
      sum(case when tipo = 'receita' then valor else 0 end) as total_receitas,
      sum(case when tipo = 'despesa' then valor else 0 end) as total_despesas
    FROM public.transacoes;
  `;
  const auditOut = execSync(`npx supabase db query --linked "${auditSql}"`, { encoding: 'utf-8' });
  const auditParsed = JSON.parse(auditOut);
  backupResult.summary.transacoes_audit = auditParsed.rows?.[0] || {};
  console.log('   Totais auditados com sucesso:', backupResult.summary.transacoes_audit);
} catch (err) {
  console.warn('   Falha ao auditar transações:', err.message);
}

// 2. Extração Integral das Tabelas Estruturais e Operacionais
console.log('\n2. Extraindo registros integrais das tabelas estruturais e de domínio...');
for (const table of CORE_TABLES) {
  process.stdout.write(`   Backup da tabela: ${table.padEnd(32, ' ')}... `);
  try {
    const sql = `SELECT coalesce(json_agg(t), '[]'::json) as data FROM (SELECT * FROM public.${table}) t;`;
    const output = execSync(`npx supabase db query --linked "${sql}"`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 50 * 1024 * 1024
    });

    const parsed = JSON.parse(output);
    const rows = parsed.rows?.[0]?.data || [];
    backupResult.tables[table] = {
      count: rows.length,
      data: rows
    };
    console.log(`OK (${rows.length} registros)`);
  } catch (err) {
    console.log(`FALHA: ${err.message}`);
    backupResult.tables[table] = {
      count: 0,
      error: err.message,
      data: []
    };
  }
}

// 3. Salvar Arquivo
const backupPath = path.resolve('backup_wallet_prod_pre_deploy_20261102.json');
fs.writeFileSync(backupPath, JSON.stringify(backupResult, null, 2), 'utf-8');
console.log(`\n=== BACKUP AUDITADO CONCLUÍDO COM SUCESSO ===`);
console.log(`Arquivo salvo em: ${backupPath}`);
console.log(`Tamanho do backup: ${(fs.statSync(backupPath).size / 1024).toFixed(2)} KB`);
