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

async function inspectNfItens() {
  const sql = `
    SELECT nfc.numero_nf, nfc.fornecedor, nfc.data_emissao, nfi.codigo_produto, nfi.descricao, nfi.unidade, nfi.quantidade, nfi.valor_unitario, nfi.valor_total
    FROM nf_itens nfi
    JOIN notas_fiscais_compra nfc ON nfc.id = nfi.nf_id
    WHERE nfc.numero_nf IN ('000.832.082', '013.790.902', '68047', '013.664.150')
    ORDER BY nfc.data_emissao DESC, nfi.descricao ASC;
  `;
  const itens = await runQuery(sql);
  console.log('Total itens inspecionados:', itens.length);
  fs.writeFileSync('scripts/nf_itens_audit.json', JSON.stringify(itens, null, 2));
  console.log('Gravado em scripts/nf_itens_audit.json');
}

inspectNfItens();
