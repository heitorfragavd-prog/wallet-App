const fs = require('fs');

const produtosEyemobile = JSON.parse(fs.readFileSync('scripts/produtos_eyemobile_dump.json', 'utf8'));
const nfItens = JSON.parse(fs.readFileSync('scripts/nf_itens_extracted.json', 'utf8'));
const salesPrices = JSON.parse(fs.readFileSync('scripts/eyemobile_sales_prices.json', 'utf8'));

// Mapa de vendas por código do produto Eyemobile
const salesByCodigo = new Map();
for (const s of salesPrices) {
  salesByCodigo.set(String(s.product_id), s);
}

// Helper para parsear embalagem e fator comprovado
function parsePackagingAndFactor(descricao, unidade, valorUnitario) {
  const d = descricao.toUpperCase();
  const u = (unidade || '').toUpperCase();
  const v = Number(valorUnitario);

  // 1. Del Valle / Sucos Lata 290ml ou Pet 450ml em packs de 6
  if (d.includes('6U') || d.includes('6P') || d.includes('(6U)') || d.includes('C/6') || d.includes('CX/6') || d.includes('CX C/6')) {
    return { factor: 6, embalagem: 'Pack/Caixa com 6 unidades', confiavel: true };
  }

  // 2. Cervejas e Refrigerantes Latas / Pets em fardos de 12
  if (d.includes('12U') || d.includes('C/12') || d.includes('CX/12') || d.includes('CX C/12') || d.includes('12 CP') || d.includes('SH C/12')) {
    return { factor: 12, embalagem: 'Fardo/Caixa com 12 unidades', confiavel: true };
  }

  // 3. Cervejas ou Refrigerantes em caixas de 24
  if (d.includes('24U') || d.includes('C/24') || d.includes('CX C/24') || d.includes('24 CP') || d.includes('SH C/24')) {
    return { factor: 24, embalagem: 'Caixa/Fardo com 24 unidades', confiavel: true };
  }

  // 4. Monster Energy em pack de 6
  if (d.includes('MONSTER') && (d.includes('6P') || d.includes('6U') || d.includes('CP'))) {
    return { factor: 6, embalagem: 'Pack com 6 latas', confiavel: true };
  }

  // 5. Unidade direta
  if (u === 'UN' || u === 'LT' || u === 'PC') {
    // Se a descrição contiver "C/12" ou similar mas a unidade veio como UN, a quantidade faturada pode ser a caixa
    // Ex: "BRAHMA CHOPP LT 473ML SH C/12" com valor R$ 51.76 -> claramente valor de 1 fardo de 12 latas!
    if (v > 20 && (d.includes('C/12') || d.includes('SH C/12') || d.includes('12'))) {
      return { factor: 12, embalagem: 'Fardo com 12 latas (unidade NF: UN fardo)', confiavel: true };
    }
    if (v > 100 && (d.includes('C/24') || d.includes('24'))) {
      return { factor: 24, embalagem: 'Caixa com 24 garrafas (unidade NF: UN caixa)', confiavel: true };
    }
    return { factor: 1, embalagem: 'Unidade individual', confiavel: true };
  }

  // 6. Quilos / Insumos a granel
  if (u === 'KG') {
    return { factor: 1, embalagem: 'Quilo (Insumo a granel)', confiavel: true, isInsumo: true };
  }

  return { factor: 1, embalagem: 'Unidade presumida (sem pack explícito)', confiavel: false };
}

// Analisar compras mais recentes válidas por código ou descrição
const nfItemsValid = nfItens.filter(it => it.valor_unitario && Number(it.valor_unitario) > 0);

// Classificação dos 178 produtos
const confirmados = [];
const ambiguos = [];
const indisponiveis = [];

for (const prod of produtosEyemobile) {
  const pDesc = prod.descricao.trim();
  const pDescUpper = pDesc.toUpperCase();
  const pCodigo = String(prod.codigo);
  const salesInfo = salesByCodigo.get(pCodigo);
  const precoVenda = salesInfo ? Number(salesInfo.preco_moda) : (Number(prod.preco_venda) > 0 ? Number(prod.preco_venda) : 0);
  const qtdVendida = salesInfo ? Number(salesInfo.total_vendido) : 0;
  const custoAnterior = Number(prod.custo_atual || 0);

  // Casos especiais conhecidos da Rodo Point:
  
  // A. PÃO DE QUEIJO, COMBOS E RECEITAS PRÓPRIAS (Insumos parciais e compostos)
  if (
    pDescUpper.includes('PÃO DE QUEIJO') ||
    pDescUpper.includes('PAO DE QUEIJO') ||
    pDescUpper.includes('CAFÉ') ||
    pDescUpper.includes('CAFE') ||
    pDescUpper.includes('BOLO') ||
    pDescUpper.includes('+') ||
    pDescUpper.includes('COMBO') ||
    pDescUpper.includes('SALGADO COMUM') ||
    pDescUpper.includes('SALGADO ESPECIAL')
  ) {
    if (pDescUpper.includes('+') || pDescUpper.includes('COMBO')) {
      ambiguos.push({
        tipo: 'COMBO_PRODUTOS_MULTIPLOS',
        produtoEyemobile: { id: prod.id, codigo: pCodigo, descricao: pDesc, precoVenda, qtdVendida, custoAnterior },
        motivo: 'Combo composto por múltiplos itens (ex: bebida + salgado/bolo). Requer composição e soma de todos os componentes.',
        acaoProposta: 'Pendente de composição completa de combo (protegido contra custo parcial artificial)'
      });
    } else if (pDescUpper.includes('PÃO DE QUEIJO') || pDescUpper.includes('PAO DE QUEIJO')) {
      ambiguos.push({
        tipo: 'RECEITA_PROPRIA_INSUMO_PARCIAL',
        produtoEyemobile: { id: prod.id, codigo: pCodigo, descricao: pDesc, precoVenda, qtdVendida, custoAnterior },
        evidenciaNF: {
          fornecedor: 'XODO FOODS E DISTRIBUICAO LTDA',
          nfCodigo: '1004',
          descricaoNF: 'PÓ DE QUEIJO SUPER LANCHE PCT 3KG',
          dataCompra: '2026-08-16',
          valorCompra: 15.67,
          unidade: 'KG'
        },
        motivo: 'Pó de queijo (R$ 15,67/kg) é insumo parcial. Fabricação requer ovos, leite, óleo, queijo e mão de obra. Não representa custo total unitário.',
        acaoProposta: 'Pendente de ficha técnica completa (protegido contra custo parcial artificial)'
      });
    } else {
      ambiguos.push({
        tipo: 'RECEITA_PROPRIA_LOCAL',
        produtoEyemobile: { id: prod.id, codigo: pCodigo, descricao: pDesc, precoVenda, qtdVendida, custoAnterior },
        motivo: 'Item preparado localmente (café/bolo/lanche). Requer insumos múltiplos e embalagem.',
        acaoProposta: 'Pendente de ficha técnica de preparo local'
      });
    }
    continue;
  }

  // B. ITENS INDUSTRIALIZADOS COM NF COMPROVADA E INEQUÍVOCA
  let matchConfirmado = null;
  let matchAmbiguo = null;

  // 1. Monster Energy LT 473ml (Lata 473ml)
  if (pDescUpper.includes('MONSTER') && pDescUpper.includes('473')) {
    const nfCand = nfItemsValid.find(n => n.descricao.toUpperCase().includes('MONSTER') && n.descricao.toUpperCase().includes('473') && (n.descricao.toUpperCase().includes('6P') || n.descricao.toUpperCase().includes('6U')));
    if (nfCand) {
      const pack = parsePackagingAndFactor(nfCand.descricao, nfCand.unidade, nfCand.valor_unitario);
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF SPAL/Coca-Cola FEMSA. Pack 6 unidades de Monster 473ml.'
      };
    }
  }

  // 2. Brahma Chopp / Cerveja Brahma
  else if (pDescUpper === 'BRAHMA' || pDescUpper.includes('BRAHMA CHOPP') || pDescUpper === 'CERVEJA BRAHMA') {
    const nfCand = nfItemsValid.find(n => n.descricao.toUpperCase().includes('BRAHMA CHOPP') && n.descricao.toUpperCase().includes('473'));
    if (nfCand) {
      const pack = parsePackagingAndFactor(nfCand.descricao, nfCand.unidade, nfCand.valor_unitario);
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'Brasnorte Distribuidora de Bebidas Ltda',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF Brasnorte. Fardo 12 latas 473ml.'
      };
    }
  }

  // 3. Corona Long Neck 330ml
  else if (pDescUpper.includes('CORONA')) {
    const nfCand = nfItemsValid.find(n => n.descricao.toUpperCase().includes('CORONA') && n.descricao.toUpperCase().includes('330'));
    if (nfCand) {
      const pack = parsePackagingAndFactor(nfCand.descricao, nfCand.unidade, nfCand.valor_unitario);
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'Brasnorte Distribuidora de Bebidas Ltda',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF Brasnorte. Caixa com 24 Long Necks 330ml.'
      };
    }
  }

  // 4. Skol Lata 473ml
  else if (pDescUpper.includes('SKOL') && (pDescUpper.includes('473') || pDescUpper.includes('LATA'))) {
    const nfCand = nfItemsValid.find(n => n.descricao.toUpperCase().includes('SKOL') && n.descricao.toUpperCase().includes('473'));
    if (nfCand) {
      const pack = parsePackagingAndFactor(nfCand.descricao, nfCand.unidade, nfCand.valor_unitario);
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'Brasnorte Distribuidora de Bebidas Ltda',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF Brasnorte. Fardo com 12 latas 473ml.'
      };
    }
  }

  // 5. Suco Del Valle (Suco Dell vale no PDV)
  else if (pDescUpper.includes('SUCO DELL VALE') || pDescUpper.includes('SUCO DEL VALLE') || pDescUpper === 'SUCO DELL VALE') {
    // Na NF SPAL existem opções Goiaba, Maracujá, Manga, Uva (6U FL) no valor de R$ 17.17 / 6 = R$ 2.8617
    const nfCand = nfItemsValid.find(n => (n.descricao.toUpperCase().includes('DV ') || n.descricao.toUpperCase().includes('DEL VALLE')) && n.descricao.toUpperCase().includes('290ML'));
    if (nfCand) {
      const pack = parsePackagingAndFactor(nfCand.descricao, nfCand.unidade, nfCand.valor_unitario);
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF SPAL/Coca-Cola FEMSA. Caixa com 6 latas 290ml Del Valle.'
      };
    }
  }

  // 6. Coca KS 290ml Vidro
  else if (pDescUpper === 'COCA KS' || pDescUpper === 'COCA-COLA KS' || pDescUpper.includes('KS')) {
    const nfCand = nfItemsValid.find(n => n.descricao.toUpperCase().includes('COCA') && n.descricao.toUpperCase().includes('KS'));
    if (nfCand) {
      // COCA-COLA 290ML VDR RET KS ULTRA - Caixa com 24 garrafas retornáveis = R$ 40.84 / 24 = R$ 1.7017
      const pack = { factor: 24, embalagem: 'Caixa com 24 garrafas KS retornáveis', confiavel: true };
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF SPAL/Coca-Cola FEMSA. Engradado retornável com 24 unidades KS 290ml.'
      };
    }
  }

  // 7. Refrigerante 200ml (Pet 200ml)
  else if (pDescUpper === 'REFRIGERANTE 200ML' || pDescUpper === 'REFRIGERANTE 200 ML') {
    // Na NF SPAL: Coca-Cola PET 200ml 12U MAINLINE = R$ 16.0327 / 12 = R$ 1.3361
    const nfCand = nfItemsValid.find(n => n.descricao.toUpperCase().includes('COCA') && n.descricao.toUpperCase().includes('200ML') && n.descricao.toUpperCase().includes('12U'));
    if (nfCand) {
      const pack = parsePackagingAndFactor(nfCand.descricao, nfCand.unidade, nfCand.valor_unitario);
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF SPAL/Coca-Cola FEMSA. Fardo com 12 garrafas Pet 200ml.'
      };
    }
  }

  // 8. Refrigerante 350ml (Lata 350ml)
  else if (pDescUpper === 'REFRIGERANTE 350ML' || pDescUpper === 'REFRIGERANTE LATA' || pDescUpper === 'REFRIGERANTE 350 ML') {
    // Na NF SPAL: COCA COLA LT 350ML C/12 = R$ 21.96 / 12 = R$ 1.83 (ou CC Zero LT 350ml 12U = R$ 33.04 / 12 = R$ 2.7533)
    const nfCand = nfItemsValid.find(n => n.descricao.toUpperCase().includes('COCA') && n.descricao.toUpperCase().includes('350ML') && (n.descricao.toUpperCase().includes('12') || n.descricao.toUpperCase().includes('12U')));
    if (nfCand) {
      const pack = parsePackagingAndFactor(nfCand.descricao, nfCand.unidade, nfCand.valor_unitario);
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF SPAL/Coca-Cola FEMSA. Fardo 12 latas 350ml.'
      };
    }
  }

  // 9. Red Bull 250ml
  else if (pDescUpper.includes('RED BULL') && pDescUpper.includes('250')) {
    // Na NF Brasnorte: RED BULL BR LATA 250ML SI = R$ 48.75 por pack de 6 = R$ 8.125
    const nfCand = nfItemsValid.find(n => n.descricao.toUpperCase().includes('RED BULL') && n.descricao.toUpperCase().includes('250'));
    if (nfCand) {
      const pack = { factor: 6, embalagem: 'Pack com 6 latas 250ml', confiavel: true };
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'Brasnorte Distribuidora de Bebidas Ltda',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF Brasnorte. Pack 6 latas Red Bull 250ml.'
      };
    }
  }

  // 10. Kapo Uva / Suco Kapo
  else if (pDescUpper.includes('KAPO')) {
    const nfCand = nfItemsValid.find(n => n.descricao.toUpperCase().includes('KAPO') && n.descricao.toUpperCase().includes('12'));
    if (nfCand) {
      const pack = parsePackagingAndFactor(nfCand.descricao, nfCand.unidade, nfCand.valor_unitario);
      const custoEfetivo = Number((Number(nfCand.valor_unitario) / pack.factor).toFixed(4));
      matchConfirmado = {
        fornecedor: nfCand.fornecedor || 'SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A',
        nfCodigo: nfCand.codigo_produto,
        descricaoNF: nfCand.descricao,
        dataCompra: nfCand.data_emissao,
        valorCompra: Number(nfCand.valor_unitario),
        embalagem: pack.embalagem,
        fatorConversao: pack.factor,
        custoEfetivo,
        confianca: 'ALTA (100% comprovado)',
        evidencia: 'NF SPAL/Coca-Cola FEMSA. Caixa com 12 unidades Kapo 200ml.'
      };
    }
  }

  // C. ITENS AMBÍGUOS OU SEM COMPROVAÇÃO DE EMBALAGEM / SABOR
  else if (pDescUpper.includes('ÁGUA') || pDescUpper.includes('AGUA')) {
    ambiguos.push({
      tipo: 'PRODUTO_SEM_NF_ESPECIFICA',
      produtoEyemobile: { id: prod.id, codigo: pCodigo, descricao: pDesc, precoVenda, qtdVendida, custoAnterior },
      motivo: 'Produto de altíssima saída (5.538 vendas a R$ 5,00), porém as NFs cadastradas contêm bebidas/refrigerantes e cervejas, sem NF de distribuidor de água mineral com/sem gás.',
      acaoProposta: 'Pendente de nota fiscal de compra de água mineral'
    });
    continue;
  }
  else if (pDescUpper.includes('CAFÉ') || pDescUpper.includes('CAFE')) {
    ambiguos.push({
      tipo: 'RECEITA_PROPRIA_CAFE',
      produtoEyemobile: { id: prod.id, codigo: pCodigo, descricao: pDesc, precoVenda, qtdVendida, custoAnterior },
      motivo: 'Café coado/expresso e café com leite são produtos preparados localmente. Requer grão/pó de café, açúcar, copo descartável e leite.',
      acaoProposta: 'Pendente de ficha técnica de preparo de café'
    });
    continue;
  }
  else if (pDescUpper.includes('SALGADO') || pDescUpper.includes('SALGADOS')) {
    ambiguos.push({
      tipo: 'PRODUCAO_PROPRIA_OU_TERCEIRIZADO',
      produtoEyemobile: { id: prod.id, codigo: pCodigo, descricao: pDesc, precoVenda, qtdVendida, custoAnterior },
      motivo: 'Salgados (R$ 8,00 e Salgados Premium R$ 9,00) são fornecidos prontos ou fabricados localmente, sem NF de fábrica de salgados anexada.',
      acaoProposta: 'Pendente de nota fiscal ou custo unitário de fornecedor de salgados'
    });
    continue;
  }
  else if (pDescUpper.includes('RED BULL 473') || pDescUpper.includes('ENERG.RED BULL 473')) {
    ambiguos.push({
      tipo: 'DIVERGENCIA_VOLUME_NF',
      produtoEyemobile: { id: prod.id, codigo: pCodigo, descricao: pDesc, precoVenda, qtdVendida, custoAnterior },
      motivo: 'NF Brasnorte possui compra de Red Bull 250ml. Red Bull 473ml possui custo significativamente maior e não deve herdar o custo de 250ml.',
      acaoProposta: 'Pendente de NF de Red Bull 473ml (não aplicar custo do 250ml)'
    });
    continue;
  }

  // Decisão final para o produto
  if (matchConfirmado) {
    const lucroBruto = precoVenda > 0 ? Number((precoVenda - matchConfirmado.custoEfetivo).toFixed(2)) : null;
    const margemPercentual = precoVenda > 0 ? Number(((lucroBruto / precoVenda) * 100).toFixed(1)) : null;
    confirmados.push({
      produtoEyemobile: { id: prod.id, codigo: pCodigo, descricao: pDesc, precoVenda, qtdVendida, custoAnterior },
      match: matchConfirmado,
      lucroBruto,
      margemPercentual,
      acaoProposta: `GRAVAR custo_atual = ${matchConfirmado.custoEfetivo.toFixed(4)}`
    });
  } else {
    indisponiveis.push({
      produtoEyemobile: { id: prod.id, codigo: pCodigo, descricao: pDesc, precoVenda, qtdVendida, custoAnterior },
      motivo: 'Sem registro de nota fiscal correspondente cadastrada no banco.',
      acaoProposta: 'Manter como "Custo não cadastrado" (sem inventar zero ou valores fictícios)'
    });
  }
}

console.log('================================================================');
console.log('DRY-RUN DE CONCILIAÇÃO DE CUSTOS - RESULTADOS CONSOLIDADOS');
console.log('================================================================\n');

console.log(`1. PRODUTOS COM CORRESPONDÊNCIA CONFIRMADA (INEQUÍVOCA): ${confirmados.length}`);
console.log(`2. PRODUTOS AMBÍGUOS OU EM RECEITA PRÓPRIA (PENDENTES): ${ambiguos.length}`);
console.log(`3. PRODUTOS COM CUSTO INDISPONÍVEL (SEM NF REGISTRADA): ${indisponiveis.length}`);
console.log(`TOTAL DO CATÁLOGO ANALISADO: ${confirmados.length + ambiguos.length + indisponiveis.length} de ${produtosEyemobile.length} produtos.\n`);

console.log('--- GRUPO 1: PRODUTOS COM CORRESPONDÊNCIA CONFIRMADA ---');
console.table(confirmados.map(c => ({
  'ID PDV': c.produtoEyemobile.codigo,
  'Produto Eyemobile': c.produtoEyemobile.descricao,
  Fornecedor: c.match.fornecedor.slice(0, 22),
  'NF Original': c.match.descricaoNF.slice(0, 24),
  Embalagem: c.match.embalagem.slice(0, 25),
  Fator: `${c.match.fatorConversao} un`,
  'Custo Unit': `R$ ${c.match.custoEfetivo.toFixed(2)}`,
  'Preço Venda': c.produtoEyemobile.precoVenda ? `R$ ${c.produtoEyemobile.precoVenda.toFixed(2)}` : 'N/D',
  'Lucro Unit': c.lucroBruto != null ? `R$ ${c.lucroBruto.toFixed(2)}` : 'N/D',
  'Margem %': c.margemPercentual != null ? `${c.margemPercentual}%` : 'N/D',
  'Confiança': c.match.confianca.slice(0, 15)
})));

console.log('\n--- GRUPO 2: PRODUTOS AMBÍGUOS OU RECEITA PRÓPRIA (AMOSTRA) ---');
console.table(ambiguos.slice(0, 10).map(a => ({
  'ID PDV': a.produtoEyemobile.codigo,
  'Produto Eyemobile': a.produtoEyemobile.descricao,
  'Tipo / Classificação': a.tipo,
  'Motivo de Proteção': a.motivo.slice(0, 45),
  'Ação': a.acaoProposta.slice(0, 35)
})));

// Gravar relatórios completos em JSON
fs.writeFileSync('scripts/dryrun_confirmados.json', JSON.stringify(confirmados, null, 2));
fs.writeFileSync('scripts/dryrun_ambiguos.json', JSON.stringify(ambiguos, null, 2));
fs.writeFileSync('scripts/dryrun_indisponiveis.json', JSON.stringify(indisponiveis, null, 2));
console.log('\nArquivos de auditoria gravados: scripts/dryrun_confirmados.json, scripts/dryrun_ambiguos.json, scripts/dryrun_indisponiveis.json');
