const fs = require('fs');

const produtosEyemobile = JSON.parse(fs.readFileSync('scripts/produtos_eyemobile_dump.json', 'utf8'));
const nfItens = JSON.parse(fs.readFileSync('scripts/nf_itens_extracted.json', 'utf8'));
const salesPrices = JSON.parse(fs.readFileSync('scripts/eyemobile_sales_prices.json', 'utf8'));

console.log('=== ANÁLISE DE CONCILIAÇÃO DE CUSTOS (EYEMOBILE X NF_ITENS) ===');
console.log(`Catálogo Eyemobile: ${produtosEyemobile.length} produtos`);
console.log(`Itens de NF Compra: ${nfItens.length} registros de compra`);
console.log(`Produtos com Vendas: ${salesPrices.length} produtos`);

// Mapeamento de vendas por ID e Nome
const salesMapById = new Map();
const salesMapByName = new Map();
for (const s of salesPrices) {
  salesMapById.set(s.product_id, s);
  salesMapByName.set(s.product_name.toLowerCase().trim(), s);
}

// Analisar correspondências candidatas
const matches = [];
const ambiguities = [];
const unmapped = [];

// Regras de conversão por descrição/unidade de atacado
function parsePackaging(desc, unidade) {
  const d = desc.toLowerCase();
  
  // Fardo ou Caixa com quantidade explícita
  // Ex: "12u", "c/12", "cx c/12", "cx/12", "12 cp", "sh c/12"
  const m12 = d.match(/(?:c\/|cx\s*c\/|cx\/|sh\s*c\/|\b)(\d+)\s*(?:u|un|cp|fl|npal|p\b)/) || d.match(/c\/(\d+)/);
  if (d.includes('12u') || d.includes('c/12') || d.includes('cx/12') || d.includes('12 cp') || d.includes('sh c/12') || d.includes('cx c/12')) {
    return { factor: 12, type: 'caixa_12' };
  }
  if (d.includes('24u') || d.includes('c/24') || d.includes('cx c/24') || d.includes('24 cp') || d.includes('sh c/24')) {
    return { factor: 24, type: 'caixa_24' };
  }
  if (d.includes('6u') || d.includes('c/6') || d.includes('cx c/6') || d.includes('6p') || d.includes('6 cp')) {
    return { factor: 6, type: 'caixa_6' };
  }
  if (d.includes('8u') || d.includes('c/8')) {
    return { factor: 8, type: 'caixa_8' };
  }
  if (m12) {
    const qty = parseInt(m12[1], 10);
    if (qty > 1 && qty <= 100) return { factor: qty, type: `pack_${qty}` };
  }
  if (unidade === 'UN' || unidade === 'LT' || unidade === 'PC') {
    return { factor: 1, type: 'unitario' };
  }
  if (unidade === 'KG') {
    return { factor: 1, type: 'quilo' };
  }
  return { factor: 1, type: 'presumido_1' };
}

// Listar todos os itens únicos de NF com custo mais recente
const latestNfItemByCode = new Map();
for (const it of nfItens) {
  if (!it.codigo_produto || !it.valor_unitario || Number(it.valor_unitario) <= 0) continue;
  const key = `${it.fornecedor || 'SEM_FORN'}_${it.codigo_produto}`;
  const existing = latestNfItemByCode.get(key);
  if (!existing || (it.data_emissao && (!existing.data_emissao || it.data_emissao > existing.data_emissao))) {
    latestNfItemByCode.set(key, it);
  }
}

console.log(`Itens distintos de NF de compra válidos: ${latestNfItemByCode.size}`);

// Criar tabela de conciliação
const conciliatedRows = [];

for (const [k, nfIt] of latestNfItemByCode.entries()) {
  const packInfo = parsePackaging(nfIt.descricao, nfIt.unidade);
  const valorUnitarioNF = Number(nfIt.valor_unitario);
  const custoUnitarioConvertido = Number((valorUnitarioNF / packInfo.factor).toFixed(4));

  // Tentar encontrar o produto Eyemobile correspondente
  let matchedEye = null;
  const nfDescLower = nfIt.descricao.toLowerCase();

  for (const eye of produtosEyemobile) {
    const eyeDescLower = eye.descricao.toLowerCase();
    
    // Regras estritas de matching (não confundir zero com normal, volumes diferentes, etc.)
    const isZeroNf = nfDescLower.includes('zero');
    const isZeroEye = eyeDescLower.includes('zero');
    if (isZeroNf !== isZeroEye) continue;

    // Coca-Cola KS
    if ((nfDescLower.includes('ks') || nfDescLower.includes('290ml vdr')) && eyeDescLower.includes('ks')) {
      matchedEye = eye;
      break;
    }

    // Coca-Cola 200ml Pet
    if (nfDescLower.includes('200ml') && eyeDescLower.includes('200ml')) {
      if (nfDescLower.includes('coca') && (eyeDescLower.includes('coca') || eyeDescLower.includes('refrigerante 200ml'))) {
        matchedEye = eye;
        break;
      }
    }

    // Coca-Cola Lata 350ml
    if (nfDescLower.includes('350ml') && (eyeDescLower.includes('350ml') || eyeDescLower.includes('lata'))) {
      if (nfDescLower.includes('coca') && (eyeDescLower.includes('coca') || eyeDescLower.includes('refrigerante 350ml'))) {
        matchedEye = eye;
        break;
      }
    }

    // Monster Energy 473ml
    if (nfDescLower.includes('monster') && eyeDescLower.includes('monster')) {
      matchedEye = eye;
      break;
    }

    // Del Valle Suco
    if (nfDescLower.includes('del valle') || nfDescLower.includes('dv ')) {
      if (eyeDescLower.includes('dell vale') || eyeDescLower.includes('del valle') || eyeDescLower.includes('suco')) {
        matchedEye = eye;
        break;
      }
    }

    // Corona Long Neck
    if (nfDescLower.includes('corona') && eyeDescLower.includes('corona')) {
      matchedEye = eye;
      break;
    }

    // Brahma
    if (nfDescLower.includes('brahma') && eyeDescLower.includes('brahma')) {
      matchedEye = eye;
      break;
    }

    // Skol
    if (nfDescLower.includes('skol') && eyeDescLower.includes('skol')) {
      matchedEye = eye;
      break;
    }

    // Red Bull
    if (nfDescLower.includes('red bull') && eyeDescLower.includes('red bull')) {
      matchedEye = eye;
      break;
    }
  }

  const salesInfo = matchedEye ? (salesMapById.get(matchedEye.codigo) || salesMapByName.get(matchedEye.descricao.toLowerCase().trim())) : null;
  const precoVendaPraticado = salesInfo ? Number(salesInfo.preco_moda) : (matchedEye && Number(matchedEye.preco_venda) > 0 ? Number(matchedEye.preco_venda) : null);

  let lucroBruto = null;
  let margemPercentual = null;
  if (precoVendaPraticado && custoUnitarioConvertido > 0) {
    lucroBruto = Number((precoVendaPraticado - custoUnitarioConvertido).toFixed(2));
    margemPercentual = Number(((lucroBruto / precoVendaPraticado) * 100).toFixed(1));
  }

  conciliatedRows.push({
    fornecedor: nfIt.fornecedor,
    dataNF: nfIt.data_emissao,
    nfCodigo: nfIt.codigo_produto,
    nfDescricao: nfIt.descricao,
    nfValorUnit: valorUnitarioNF,
    fator: packInfo.factor,
    tipoEmb: packInfo.type,
    custoUnitarioPDV: custoUnitarioConvertido,
    matchedEyeId: matchedEye?.codigo || null,
    matchedEyeDesc: matchedEye?.descricao || null,
    precoVendaPraticado,
    lucroBruto,
    margemPercentual,
    qtdVendida: salesInfo?.total_vendido || 0
  });
}

console.log(`\nConciliações computadas: ${conciliatedRows.length}`);
const withMatch = conciliatedRows.filter(r => r.matchedEyeDesc);
console.log(`Itens com correspondência confirmada com o PDV Eyemobile: ${withMatch.length}`);

console.log('\n--- TABELA DE CORRESPONDÊNCIA DE CUSTOS E MARGENS REAIS ---');
console.table(withMatch.slice(0, 25).map(r => ({
  Produto: r.matchedEyeDesc,
  Fornecedor: r.fornecedor?.slice(0, 20),
  'NF Original': r.nfDescricao?.slice(0, 25),
  Fator: `${r.fator} un`,
  'Custo Unit': `R$ ${r.custoUnitarioPDV.toFixed(2)}`,
  'Preço Venda': r.precoVendaPraticado ? `R$ ${r.precoVendaPraticado.toFixed(2)}` : 'Sem venda',
  'Lucro Bruto': r.lucroBruto != null ? `R$ ${r.lucroBruto.toFixed(2)}` : 'N/A',
  'Margem %': r.margemPercentual != null ? `${r.margemPercentual}%` : 'N/A',
  'Vendido': r.qtdVendida
})));

fs.writeFileSync('scripts/reconciliation_result.json', JSON.stringify(conciliatedRows, null, 2));
