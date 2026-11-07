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

async function auditDespesas() {
  const sql = `
    SELECT d.id, d.descricao, d.valor, d.data, d.status, c.nome as categoria_nome, d.observacoes
    FROM despesas d
    LEFT JOIN categorias c ON c.id = d.categoria_id
    WHERE d.workspace_id = '2af415b6-76aa-4134-8133-a9b405671c1c'
      AND d.data >= '2026-11-01'
      AND d.data <= '2026-11-07'
      AND d.status = 'pago'
    ORDER BY d.valor DESC;
  `;
  const despesas = await runQuery(sql);
  console.log('Total despesas pagas 01 a 07 nov:', despesas.length);

  let totalPago = 0;
  let estoqueRegexAntigo = 0;
  let estoqueCorreto = 0;
  let operacionalCorreto = 0;

  const itensAuditados = [];

  for (const d of despesas) {
    const val = Number(d.valor || 0);
    totalPago += val;
    const cat = (d.categoria_nome || '').toLowerCase();
    const desc = (d.descricao || '').toLowerCase();

    // Regra antiga com boleto
    const antigoEstoque = (
      cat.includes('mercadoria') ||
      cat.includes('estoque') ||
      cat.includes('fornecedor') ||
      cat.includes('compra') ||
      cat.includes('bebida') ||
      desc.includes('ambev') ||
      desc.includes('coca') ||
      desc.includes('spal') ||
      desc.includes('salgados') ||
      desc.includes('biscoitos') ||
      desc.includes('boleto')
    );
    if (antigoEstoque) estoqueRegexAntigo += val;

    // Regra rigorosa auditada: apenas mercadorias/estoque comprovados
    // Fornecedores de atacado conhecidos: Spal, Ambev, Brasnorte, Gerson Salgados, Xodó, Sellpack
    // Ou categorias explicitamente de compras de revenda
    const isEstoqueRigoroso = (
      cat.includes('mercadoria') ||
      cat.includes('estoque') ||
      cat.includes('matéria prima') ||
      desc.includes('spal') ||
      desc.includes('coca-cola') ||
      desc.includes('ambev') ||
      desc.includes('brasnorte') ||
      desc.includes('gerson salgados') ||
      desc.includes('salgados') ||
      desc.includes('biscoito') ||
      desc.includes('xodó') ||
      desc.includes('fornecedor bebidas') ||
      desc.includes('compra mercadoria')
    );

    if (isEstoqueRigoroso) {
      estoqueCorreto += val;
    } else {
      operacionalCorreto += val;
    }

    itensAuditados.push({
      descricao: d.descricao,
      categoria: d.categoria_nome,
      valor: val,
      classificacaoAntiga: antigoEstoque ? 'Estoque' : 'Operacional',
      classificacaoRigorosa: isEstoqueRigoroso ? 'Estoque' : 'Operacional',
      mudou: antigoEstoque !== isEstoqueRigoroso
    });
  }

  console.log('Total pago:', totalPago.toFixed(2));
  console.log('Estoque regra antiga (com "boleto"):', estoqueRegexAntigo.toFixed(2));
  console.log('Estoque rigoroso (sem "boleto"):', estoqueCorreto.toFixed(2));
  console.log('Operacional rigoroso:', operacionalCorreto.toFixed(2));

  const mudados = itensAuditados.filter(i => i.mudou);
  console.log('Itens que tinham sido incorretamente classificados como estoque:', mudados);
}

auditDespesas();
