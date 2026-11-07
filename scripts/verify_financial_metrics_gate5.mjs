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

async function calculateMetrics() {
  // 1. Catálogo e Histórico de custos
  const [prods, hist, txRaw] = await Promise.all([
    runQuery(`SELECT codigo, descricao, custo_atual, preco_venda FROM produtos_eyemobile WHERE workspace_id = '${workspaceId}';`),
    runQuery(`SELECT produto_codigo, custo_unitario, data_compra, fornecedor, created_at FROM historico_custo_produto WHERE workspace_id = '${workspaceId}' ORDER BY data_compra ASC;`),
    runQuery(`
      SELECT id, valor, data, created_at, descricao, observacoes, deduplication_key, itens 
      FROM transacoes 
      WHERE workspace_id = '${workspaceId}' 
        AND tipo = 'receita'
        AND data >= '2026-11-01' 
        AND data <= '2026-11-07T23:59:59.999Z'
        AND itens IS NOT NULL
      ORDER BY data DESC;
    `)
  ]);

  // Deduplicação
  const seen = new Set();
  const tx = [];
  for (const t of txRaw) {
    let key = t.deduplication_key ? `dedup:${t.deduplication_key}` : null;
    if (!key) {
      const matchObs = (t.observacoes || '').match(/Venda:\s*#(\d+)/i);
      const matchDesc = (t.descricao || '').match(/Venda Eyemobile\s*#(\d+)/i);
      if (matchObs) key = `eyemobile:sale:${matchObs[1]}`;
      else if (matchDesc) key = `eyemobile:sale:${matchDesc[1]}`;
      else if (t.id) key = `id:${t.id}`;
    }
    if (key && !seen.has(key)) {
      seen.add(key);
      tx.push(t);
    }
  }

  const costMap = new Map();
  for (const p of prods) {
    if (p.codigo) {
      costMap.set(String(p.codigo), {
        custo: Number(p.custo_atual || 0),
        descricao: p.descricao || '',
        precoVenda: Number(p.preco_venda || 0)
      });
    }
  }

  const historyByCode = new Map();
  for (const h of hist) {
    if (!h.produto_codigo || Number(h.custo_unitario) <= 0) continue;
    const list = historyByCode.get(String(h.produto_codigo)) || [];
    const f = (h.fornecedor || '').toUpperCase();
    const isProven =
      !f.includes('PARIDADE') &&
      !f.includes('COTAÇÃO') &&
      !f.includes('COTADO') &&
      !f.includes('COMBO') &&
      !f.includes('INSUMOS') &&
      !f.includes('PANIFICAÇÃO') &&
      !f.includes('GERSON SALGADOS') &&
      (f.includes('NF') || f.includes('SPAL') || f.includes('BRASNORTE') || f.includes('AMBEV'));

    list.push({
      custo: Number(h.custo_unitario),
      dataCompra: h.data_compra || (h.created_at ? h.created_at.slice(0, 10) : '2026-01-01'),
      fornecedor: h.fornecedor,
      isProvenNf: isProven
    });
    historyByCode.set(String(h.produto_codigo), list);
  }

  let receitaTotal = 0;
  let receitaComCusto = 0;
  let receitaComprovada = 0;
  let receitaEstimada = 0;
  let receitaSemCusto = 0;
  let cmvTotal = 0;
  let cmvComprovado = 0;
  let cmvEstimado = 0;

  for (const t of tx) {
    if (!t.itens || !Array.isArray(t.itens)) continue;
    const saleDateStr = t.data ? t.data.slice(0, 10) : '2026-11-01';

    for (const raw of t.itens) {
      if (!raw || typeof raw !== 'object' || raw.cancelled === true || raw.status === 'cancelled') continue;
      const pId = String(raw.product_id || raw.id || 'sem_id');
      const qtd = Number(raw.quantity ?? raw.quantidade ?? 1);
      const pr = Number(raw.price || 0);
      const disc = Number(raw.discount || 0);
      let totalItem = Number(raw.total ?? raw.valor ?? 0);
      if (totalItem === 0 && pr > 0 && qtd > 0) totalItem = pr * qtd - disc;

      receitaTotal += totalItem;

      let custoLinha = null;
      let tipoLinha = 'sem_custo';

      const histList = historyByCode.get(pId);
      if (histList && histList.length > 0) {
        const purchaseMatch = histList.filter(h => h.dataCompra <= saleDateStr).pop();
        if (purchaseMatch && purchaseMatch.custo > 0) {
          custoLinha = purchaseMatch.custo;
          tipoLinha = purchaseMatch.isProvenNf ? 'comprovado' : 'estimado';
        }
      }

      if (custoLinha === null) {
        const refCost = costMap.get(pId);
        if (refCost && refCost.custo > 0) {
          custoLinha = refCost.custo;
          tipoLinha = 'estimado';
        }
      }

      if (custoLinha !== null && custoLinha > 0) {
        const cmvItem = custoLinha * qtd;
        receitaComCusto += totalItem;
        cmvTotal += cmvItem;
        if (tipoLinha === 'comprovado') {
          receitaComprovada += totalItem;
          cmvComprovado += cmvItem;
        } else {
          receitaEstimada += totalItem;
          cmvEstimado += cmvItem;
        }
      } else {
        receitaSemCusto += totalItem;
      }
    }
  }

  // Resumo Financeiro
  const lucroBrutoComprovado = receitaComprovada - cmvComprovado;
  const margemComprovada = receitaComprovada > 0 ? (lucroBrutoComprovado / receitaComprovada) * 100 : 0;
  const lucroBrutoEstimado = receitaEstimada - cmvEstimado;
  const lucroBrutoTotalConhecido = receitaComCusto - cmvTotal;
  const margemTotalConhecida = receitaComCusto > 0 ? (lucroBrutoTotalConhecido / receitaComCusto) * 100 : 0;

  console.log('=== RESULTADOS AUDITADOS GATE 5 (01/11/2026 - 07/11/2026) ===');
  console.log(`Faturamento Total: R$ ${receitaTotal.toFixed(2)}`);
  console.log(`Receita Comprovada (NF SEFAZ): R$ ${receitaComprovada.toFixed(2)}`);
  console.log(`Receita Estimada (Fichas/Cotações): R$ ${receitaEstimada.toFixed(2)}`);
  console.log(`Receita Sem Custo (Em Apuração): R$ ${receitaSemCusto.toFixed(2)}`);
  console.log('---');
  console.log(`CMV Comprovado (NF SEFAZ): R$ ${cmvComprovado.toFixed(2)}`);
  console.log(`CMV Estimado: R$ ${cmvEstimado.toFixed(2)}`);
  console.log(`CMV Total Conhecido: R$ ${cmvTotal.toFixed(2)}`);
  console.log('---');
  console.log(`Lucro Bruto Comprovado: R$ ${lucroBrutoComprovado.toFixed(2)} (Margem: ${margemComprovada.toFixed(1)}%)`);
  console.log(`Lucro Bruto Estimado: R$ ${lucroBrutoEstimado.toFixed(2)}`);
  console.log(`Lucro Bruto dos Produtos Cobertos: R$ ${lucroBrutoTotalConhecido.toFixed(2)} (Margem: ${margemTotalConhecida.toFixed(1)}%)`);
  console.log(`Cobertura de Custos: ${((receitaComCusto / receitaTotal) * 100).toFixed(1)}%`);
}

calculateMetrics().catch(console.error);
