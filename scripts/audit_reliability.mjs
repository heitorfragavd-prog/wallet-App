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

async function audit() {
  const prods = await runQuery("SELECT pe.codigo, pe.descricao, pe.categoria, pe.preco_venda, pe.custo_atual, pe.ultima_atualizacao_custo FROM produtos_eyemobile pe WHERE pe.custo_atual > 0 ORDER BY pe.descricao ASC;");
  const hists = await runQuery("SELECT produto_codigo, produto_descricao, fornecedor, custo_unitario, data_compra, nf_id, created_at FROM historico_custo_produto ORDER BY created_at DESC;");

  const histMap = new Map();
  for (const h of hists) {
    if (!histMap.has(h.produto_codigo)) {
      histMap.set(h.produto_codigo, h);
    }
  }

  const tx = await runQuery("SELECT id, valor, data, descricao, observacoes, deduplication_key, itens FROM transacoes WHERE workspace_id = '2af415b6-76aa-4134-8133-a9b405671c1c' AND tipo = 'receita' AND data >= '2026-11-01' AND data <= '2026-11-07 23:59:59' AND itens IS NOT NULL ORDER BY data ASC;");

  // Deduplicação
  const seen = new Set();
  const dedup = [];
  for (const t of tx) {
    let key = t.deduplication_key;
    if (!key) {
      const m = (t.observacoes || '').match(/Venda:\s*#(\d+)/i) || (t.descricao || '').match(/Venda Eyemobile\s*#(\d+)/i);
      key = m ? m[1] : t.id;
    }
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(t);
    }
  }

  // Agregação de vendas por produto_id
  const vendasMap = new Map();
  for (const t of dedup) {
    if (!t.itens || !Array.isArray(t.itens)) continue;
    for (const item of t.itens) {
      if (item.cancelled === true || item.status === 'cancelled') continue;
      const pid = String(item.product_id || item.id || 'sem_id');
      const name = item.product_name || item.name || item.descricao || 'Item sem nome';
      const qtd = Number(item.quantity ?? item.quantidade ?? 1);
      const pr = Number(item.price || 0);
      const disc = Number(item.discount || 0);
      let tot = Number(item.total ?? item.valor ?? 0);
      if (tot === 0 && pr > 0 && qtd > 0) tot = pr * qtd - disc;

      const cur = vendasMap.get(pid) || { pid, name, qtd: 0, faturamento: 0 };
      cur.qtd += qtd;
      cur.faturamento += tot;
      vendasMap.set(pid, cur);
    }
  }

  // Classificação dos 42 produtos com custo
  // 1. Custo comprovado por nota fiscal
  // 2. Custo comprovado por compra documentada
  // 3. Cotação atual de fornecedor
  // 4. Média estimada de produtos genéricos / combos
  // 5. Custo sem comprovação suficiente
  const result = prods.map(p => {
    const code = String(p.codigo);
    const hist = histMap.get(code);
    const venda = vendasMap.get(code) || { qtd: 0, faturamento: 0 };
    const fornecedor = hist ? hist.fornecedor : 'Direto no cadastro';

    let tipoClassificacao = '5. Sem comprovação suficiente';
    let docOrigem = 'Nenhum documento comprovatório';
    let metodoCalculo = 'Manual no cadastro';
    let qtdEmbalagem = '1 un';
    let evidencia = 'Sem NF vinculada';

    // Verificação detalhada de NF
    if (fornecedor.includes('SPAL') || fornecedor.includes('Brasnorte') || fornecedor.includes('AMBEV')) {
      if (fornecedor.includes('Paridade') || fornecedor.includes('Estimativa')) {
        tipoClassificacao = '4. Média estimada / Paridade';
        docOrigem = 'Estimativa de paridade com Original 473ml';
        metodoCalculo = 'Cópia de preço da Original 473ml';
        qtdEmbalagem = '12 un';
        evidencia = 'Não possui NF própria de Spaten no sistema';
      } else if (fornecedor.includes('NF 68047') || fornecedor.includes('NF 000.832.082') || fornecedor.includes('NF 013.790.902') || fornecedor.includes('NF 013.664.150') || fornecedor.includes('NF 013754779') || fornecedor.includes('SPAL INDUSTRIA') || fornecedor.includes('Brasnorte Distribuidora')) {
        tipoClassificacao = '1. Custo comprovado por nota fiscal';
        if (fornecedor.includes('NF 013.790.902') || fornecedor.includes('SPAL')) {
          docOrigem = 'NF-e 013.790.902 / 013.664.150 (SPAL)';
          evidencia = 'XML/Danfe SEFAZ SPAL arquivada no sistema';
        } else if (fornecedor.includes('NF 68047')) {
          docOrigem = 'NF-e 68047 (AMBEV S/A)';
          evidencia = 'Danfe AMBEV no sistema';
        } else {
          docOrigem = 'NF-e 000.832.082 (Brasnorte Distribuidora)';
          evidencia = 'XML/Danfe SEFAZ Brasnorte no sistema';
        }

        // Embalagens e conversões
        if (p.descricao.toLowerCase().includes('ks') || code === '2032242') {
          metodoCalculo = 'R$ 40,84 / cx 24 un = R$ 1,7017';
          qtdEmbalagem = '24 un (caixa vidro 290ml)';
        } else if (p.descricao.toLowerCase().includes('corona') || code === '2032243') {
          metodoCalculo = 'R$ 162,52 / cx 24 un = R$ 6,7717';
          qtdEmbalagem = '24 un (caixa long neck 330ml)';
        } else if (p.descricao.toLowerCase().includes('stella') || code === '2044235') {
          metodoCalculo = 'R$ 55,00 / cx 8 un = R$ 6,8750';
          qtdEmbalagem = '8 un (pack 275ml)';
        } else if (p.descricao.toLowerCase().includes('red bull') || code === '2032254') {
          metodoCalculo = 'R$ 48,75 / pack 6 un = R$ 8,1250';
          qtdEmbalagem = '6 un (pack lata 250ml)';
        } else if (p.descricao.toLowerCase().includes('gatorade') || code === '2032312') {
          metodoCalculo = 'R$ 27,0950 / pack 6 un = R$ 4,5158';
          qtdEmbalagem = '6 un (sixpack 500ml)';
        } else if (p.descricao.toLowerCase().includes('power') || code === '2033766') {
          metodoCalculo = 'R$ 17,53 / pack 6 un = R$ 2,9217';
          qtdEmbalagem = '6 un (pack 500ml)';
        } else if (p.descricao.toLowerCase().includes('monster') || code === '2032362') {
          metodoCalculo = 'R$ 43,2567 / pack 6 un = R$ 7,2095';
          qtdEmbalagem = '6 un (pack lata 473ml)';
        } else if (p.descricao.toLowerCase().includes('kapo') || code === '2032350') {
          metodoCalculo = 'R$ 19,6350 / cx 12 un = R$ 1,6363';
          qtdEmbalagem = '12 un (caixa 200ml)';
        } else if (p.descricao.toLowerCase().includes('refri 200') || p.descricao.toLowerCase().includes('refrigerante 200') || code === '2032601' || code === '2032329') {
          metodoCalculo = 'R$ 16,0333 / cx 12 un = R$ 1,3361';
          qtdEmbalagem = '12 un (fardo pet 200ml)';
        } else if (p.descricao.toLowerCase().includes('350') || code === '2032394') {
          metodoCalculo = 'R$ 21,96 / cx 12 un = R$ 1,8300';
          qtdEmbalagem = '12 un (fardo lata 350ml)';
        } else if (p.descricao.toLowerCase().includes('suco dell') || code === '2032410' || code === '2033266') {
          metodoCalculo = 'R$ 17,17 / cx 6 un = R$ 2,8617';
          qtdEmbalagem = '6 un (fardo lata 290ml)';
        } else if (p.descricao.toLowerCase().includes('h2oh') || code === '2032337') {
          metodoCalculo = 'R$ 49,79 / cx 12 un = R$ 4,1492';
          qtdEmbalagem = '12 un (fardo pet 500ml)';
        } else if (p.descricao.toLowerCase().includes('brahma') || code === '2044232') {
          metodoCalculo = 'R$ 51,7670 / cx 12 un = R$ 4,3139';
          qtdEmbalagem = '12 un (pack lata 473ml)';
        } else if (p.descricao.toLowerCase().includes('skol') || code === '2032231') {
          metodoCalculo = 'R$ 47,60 / cx 12 un = R$ 3,9667';
          qtdEmbalagem = '12 un (pack lata 473ml)';
        } else if (p.descricao.toLowerCase().includes('original') || code === '2044233') {
          metodoCalculo = 'R$ 60,9175 / cx 12 un = R$ 5,0765';
          qtdEmbalagem = '12 un (pack lata 473ml - NOTA: NF é lata 473ml)';
        } else if (p.descricao.toLowerCase().includes('chá gelado') || code === '2032233') {
          metodoCalculo = 'R$ 15,13 / cx 6 un = R$ 2,5217';
          qtdEmbalagem = '6 un (pack pet 450ml)';
        } else if (p.descricao.toLowerCase().includes('guaraná leão copo') || code === '2032328') {
          metodoCalculo = 'R$ 44,32 / cx 24 un = R$ 1,8467';
          qtdEmbalagem = '24 un (caixa copo 300ml)';
        } else if (p.descricao.toLowerCase().includes('guaraná leão') || code === '2032324') {
          metodoCalculo = 'R$ 13,11 / cx 6 un = R$ 2,1850';
          qtdEmbalagem = '6 un (pack pet 450ml)';
        }
      }
    } else if (fornecedor.includes('Gerson Salgados')) {
      tipoClassificacao = '2. Compra documentada (sem NF-e discriminada)';
      docOrigem = 'Registros de pagamentos Pix/Extrato Fornecedor Gerson Salgados';
      metodoCalculo = 'Preço de compra por cento acordado / 100';
      qtdEmbalagem = '1 un (unidade avulsa)';
      evidencia = 'Pagamentos bancários a Gerson Salgados no extrato, sem XML/NF SEFAZ de itens';
    } else if (fornecedor.includes('Cotação') || fornecedor.includes('Atacado')) {
      tipoClassificacao = '3. Cotação atual de fornecedor';
      docOrigem = 'Cotação comercial de atacado / catálogo distribuidor';
      if (p.descricao.toLowerCase().includes('água')) {
        metodoCalculo = 'R$ 13,20 / fardo 12 un = R$ 1,10 (sem gás) | R$ 15,60 / 12 un = R$ 1,30 (com gás)';
        qtdEmbalagem = '12 un (fardo 500ml)';
      } else if (p.descricao.toLowerCase().includes('heineken')) {
        metodoCalculo = 'R$ 81,60 / pack 12 un = R$ 6,80';
        qtdEmbalagem = '12 un (pack lata 473ml)';
      } else if (p.descricao.toLowerCase().includes('itambezinho')) {
        metodoCalculo = 'R$ 44,55 / cx 27 un = R$ 1,65';
        qtdEmbalagem = '27 un (caixa 200ml)';
      }
      evidencia = 'Cotação em tabela de fornecedores, sem nota fiscal de entrada no ERP';
    } else if (fornecedor.includes('Combo') || fornecedor.includes('Insumos') || fornecedor.includes('Panificação')) {
      tipoClassificacao = '4. Média estimada / Composição de Insumos';
      if (p.descricao.toLowerCase().includes('pão de queijo') && !p.descricao.includes('+') && !p.descricao.includes('café')) {
        docOrigem = 'Estimativa de custo panificação congelado';
        metodoCalculo = 'R$ 1,35 por unidade de 80g assada';
        qtdEmbalagem = '1 un';
        evidencia = 'Estimativa operacional interna, sem ficha técnica formalizada';
      } else if (p.descricao.toLowerCase().includes('café') && !p.descricao.includes('+') && !p.descricao.includes('leite') && !p.descricao.includes('pães')) {
        docOrigem = 'Estimativa de insumos de cafeteria (grão moído + copo + coador)';
        metodoCalculo = 'R$ 0,60 por dose 50ml';
        qtdEmbalagem = '1 dose';
        evidencia = 'Estimativa paramétrica, não apura perdas nem energia elétrica';
      } else if (p.descricao.toLowerCase().includes('leite') && !p.descricao.includes('+') && !p.descricao.includes('pães')) {
        docOrigem = 'Estimativa de insumos de cafeteria (Café R$ 0,60 + Leite R$ 0,50)';
        metodoCalculo = 'R$ 0,60 + R$ 0,50 = R$ 1,10';
        qtdEmbalagem = '1 dose';
        evidencia = 'Estimativa paramétrica';
      } else {
        docOrigem = 'Fórmula de composição de combo (soma dos insumos estimados)';
        metodoCalculo = 'Soma linear dos componentes';
        qtdEmbalagem = '1 combo';
        evidencia = 'Derivado aritmético dos insumos de salgado/café/bebida';
      }
    }

    return {
      codigo: code,
      descricao: p.descricao,
      categoria: p.categoria,
      custo_atual: Number(p.custo_atual),
      preco_venda: Number(p.preco_venda),
      fornecedor,
      tipoClassificacao,
      docOrigem,
      metodoCalculo,
      qtdEmbalagem,
      evidencia,
      qtdVendidaNov: venda.qtd,
      faturamentoNov: venda.faturamento,
    };
  });

  fs.writeFileSync('C:/Users/Heitor/OneDrive/Documentos/Dev/wallet/scripts/audit_result.json', JSON.stringify(result, null, 2));

  // Totais por tipo de classificação
  const summary = {};
  for (const r of result) {
    if (!summary[r.tipoClassificacao]) {
      summary[r.tipoClassificacao] = { count: 0, faturamentoNov: 0, cmvNov: 0 };
    }
    summary[r.tipoClassificacao].count++;
    summary[r.tipoClassificacao].faturamentoNov += r.faturamentoNov;
    summary[r.tipoClassificacao].cmvNov += r.qtdVendidaNov * r.custo_atual;
  }

  console.log('=== RESUMO POR CLASSIFICAÇÃO ===');
  console.log(JSON.stringify(summary, null, 2));

  const totalFaturamentoComCusto = result.reduce((acc, r) => acc + r.faturamentoNov, 0);
  console.log('Faturamento de produtos com custo cadastrado:', totalFaturamentoComCusto.toFixed(2));
}

audit();
