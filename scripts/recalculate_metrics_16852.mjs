import fs from 'fs';
import https from 'https';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      port: 443,
      path: '/v1/projects/hdeguzxkdvebdrrutbnx/database/query',
      method: 'POST',
      family: 4,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const workspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';

async function main() {
  console.log('--- RECALCULANDO INDICADORES DE VENDAS 01 A 07/11/2026 ---');

  // 1. Buscar produtos_eyemobile atualizados do banco
  const produtos = await runQuery(`
    SELECT codigo, descricao, custo_atual, preco_venda, ultima_atualizacao_custo 
    FROM produtos_eyemobile 
    WHERE workspace_id = '${workspaceId}'
  `);
  
  const prodMap = new Map();
  produtos.forEach(p => prodMap.set(String(p.codigo), p));

  // 2. Carregar vendas consolidadas de 01 a 07/11/2026
  const vendas = JSON.parse(fs.readFileSync('scripts/backups/vendas_produtos_nov2026.json', 'utf8'));

  let totalReceitaGeral = 0;
  let receitaComCusto = 0;
  let receitaSemCusto = 0;
  let cmvTotalConhecido = 0;

  const resultadoProdutos = [];

  for (const v of vendas) {
    const pId = String(v.id);
    const prodDb = prodMap.get(pId);
    const custoUnit = prodDb ? Number(prodDb.custo_atual || 0) : 0;
    const temCusto = custoUnit > 0;
    const cmvItem = v.qtd * custoUnit;
    const lucroBruto = v.total - cmvItem;
    const margem = v.total > 0 && temCusto ? (lucroBruto / v.total * 100) : 0;

    totalReceitaGeral += v.total;
    if (temCusto) {
      receitaComCusto += v.total;
      cmvTotalConhecido += cmvItem;
    } else {
      receitaSemCusto += v.total;
    }

    resultadoProdutos.push({
      codigo: pId,
      descricao: prodDb ? prodDb.descricao : v.name,
      qtd: v.qtd,
      receita: v.total,
      custoUnit,
      cmv: cmvItem,
      lucroBruto: temCusto ? lucroBruto : null,
      margem: temCusto ? margem : null,
      temCusto,
      ultima_atualizacao: prodDb ? prodDb.ultima_atualizacao_custo : null
    });
  }

  const lucroBrutoTotalCoberto = receitaComCusto - cmvTotalConhecido;
  const margemGeralCoberta = receitaComCusto > 0 ? (lucroBrutoTotalCoberto / receitaComCusto * 100) : 0;
  const percentualCobertura = totalReceitaGeral > 0 ? (receitaComCusto / totalReceitaGeral * 100) : 0;

  console.log('\n======================================================');
  console.log('RESUMO CONSOLIDADO DE VENDAS (01/11/2026 A 07/11/2026)');
  console.log('======================================================');
  console.log(`Receita Total de Vendas Faturada: R$ ${totalReceitaGeral.toFixed(2)}`);
  console.log(`Receita com Custo Identificado:   R$ ${receitaComCusto.toFixed(2)} (${percentualCobertura.toFixed(1)}% do faturamento)`);
  console.log(`Receita sem Custo Cadastrado:     R$ ${receitaSemCusto.toFixed(2)} (${(100 - percentualCobertura).toFixed(1)}% do faturamento)`);
  console.log(`CMV Conhecido (Custo dos Produtos): R$ ${cmvTotalConhecido.toFixed(2)}`);
  console.log(`Lucro Bruto dos Produtos Cobertos:  R$ ${lucroBrutoTotalCoberto.toFixed(2)}`);
  console.log(`Margem Bruta Média dos Cobertos:    ${margemGeralCoberta.toFixed(1)}%`);
  console.log('======================================================\n');

  // Filtrar e ordenar produtos cobertos por lucro bruto decrescente
  const cobertos = resultadoProdutos.filter(p => p.temCusto);
  cobertos.sort((a, b) => b.lucroBruto - a.lucroBruto);

  console.log(`TOP 20 PRODUTOS MAIS LUCRATIVOS (LUCRO BRUTO ABSOLUTO):`);
  console.log('------------------------------------------------------------------------------------------------------------------');
  console.log('CÓDIGO  | DESCRIÇÃO                      | QTD  | FATURADO    | CUSTO UN. | CMV TOTAL   | LUCRO BRUTO | MARGEM %');
  console.log('------------------------------------------------------------------------------------------------------------------');
  cobertos.slice(0, 20).forEach(p => {
    const cod = p.codigo.padEnd(7);
    const desc = p.descricao.padEnd(30).substring(0, 30);
    const qtd = String(p.qtd).padStart(4);
    const fat = ('R$ ' + p.receita.toFixed(2)).padStart(11);
    const cUnit = ('R$ ' + p.custoUnit.toFixed(4)).padStart(10);
    const cmv = ('R$ ' + p.cmv.toFixed(2)).padStart(11);
    const lb = ('R$ ' + p.lucroBruto.toFixed(2)).padStart(11);
    const mg = (p.margem.toFixed(1) + '%').padStart(8);
    console.log(`${cod} | ${desc} | ${qtd} | ${fat} | ${cUnit} | ${cmv} | ${lb} | ${mg}`);
  });

  // Mostrar especificamente os 15 produtos do orçamento de atacado
  console.log('\n------------------------------------------------------------------------------------------------------------------');
  console.log('DESEMPENHO DOS PRODUTOS ATUALIZADOS PELO ORÇAMENTO Nº 16852 (13/11/2026):');
  console.log('------------------------------------------------------------------------------------------------------------------');
  const codigos16852 = [
    '2032416', '2032404', '2032412', '2032388', '2032339', '2030584', '2032405', 
    '2032411', '2032189', '2032237', '2030585', '2032372', '2032369', '2032305', '2032251'
  ];
  
  const prods16852Vendas = resultadoProdutos.filter(p => codigos16852.includes(p.codigo));
  prods16852Vendas.sort((a, b) => b.receita - a.receita);

  prods16852Vendas.forEach(p => {
    const cod = p.codigo.padEnd(7);
    const desc = p.descricao.padEnd(32).substring(0, 32);
    const qtd = String(p.qtd).padStart(4);
    const fat = ('R$ ' + p.receita.toFixed(2)).padStart(11);
    const cUnit = ('R$ ' + p.custoUnit.toFixed(4)).padStart(10);
    const cmv = ('R$ ' + p.cmv.toFixed(2)).padStart(11);
    const lb = ('R$ ' + p.lucroBruto.toFixed(2)).padStart(11);
    const mg = (p.margem.toFixed(1) + '%').padStart(8);
    console.log(`${cod} | ${desc} | ${qtd} | ${fat} | ${cUnit} | ${cmv} | ${lb} | ${mg}`);
  });

  // Salvar relatório detalhado
  fs.writeFileSync('scripts/backups/indicadores_consolidados_orcamento16852.json', JSON.stringify({
    periodo: '2026-11-01 a 2026-11-07',
    totalReceitaGeral,
    receitaComCusto,
    receitaSemCusto,
    cmvTotalConhecido,
    lucroBrutoTotalCoberto,
    margemGeralCoberta,
    percentualCobertura,
    produtosAtualizados16852: prods16852Vendas,
    top20Lucrativos: cobertos.slice(0, 20),
    todosCobertos: cobertos,
    pendentesSemCusto: resultadoProdutos.filter(p => !p.temCusto)
  }, null, 2));

  console.log('\nDados salvos com sucesso em scripts/backups/indicadores_consolidados_orcamento16852.json');
}

main().catch(console.error);
