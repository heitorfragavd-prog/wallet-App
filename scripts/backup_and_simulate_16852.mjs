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

// Lista dos 15 produtos identificados com correspondência 100% segura
export const mappedProducts = [
  {
    codigo: '2032416',
    descricao: 'TRIDENT',
    preco_venda: 4.00,
    embalagem: 'Display c/ 21 unidades (32 DP)',
    qtd_embalagem: 21,
    preco_embalagem: 36.00,
    custo_unitario: 1.7143,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '75567 - CHICLE TRIDENT CANELA C/21 (R$ 36,00)',
      '22863 - CHICLE TRIDENT HORTELA C/21 (R$ 36,00)',
      '50730 - CHICLE TRIDENT MELANCIA C/21 (R$ 36,00)',
      '51711 - CHICLE TRIDENT MENTA VDE C/21 (R$ 36,00)',
      '42650 - CHICLE TRIDENT MORANGO C/21 (R$ 36,00)',
      '681 - CHICLE TRIDENT T.FRUTTI C/21 (R$ 36,00)'
    ]
  },
  {
    codigo: '2032404',
    descricao: 'Snickers',
    preco_venda: 5.00,
    embalagem: 'Display 20x40g / 20x42g (12 DP)',
    qtd_embalagem: 20,
    preco_embalagem: 61.00,
    custo_unitario: 3.0500,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '2501 - CHOC MARS SNICKERS 20X40G (R$ 61,00)',
      '5509 - CHOC MARS SNICKERS PE DE MOLEQUE 20X42G (R$ 61,00)'
    ]
  },
  {
    codigo: '2032412',
    descricao: 'TRENTO',
    preco_venda: 3.50,
    embalagem: 'Display 16x2 sticks (8 DP)',
    qtd_embalagem: 16,
    preco_embalagem: 26.00,
    custo_unitario: 1.6250,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '75507 - CHOC PECCIN TRENTO AVELAS 16X2 (R$ 26,00)',
      '2217 - CHOC PECCIN TRENTO CHOC.BRANCO DARK 16X2 (R$ 26,00)',
      '75505 - CHOC PECCIN TRENTO CHOCOLATE 16X2 (R$ 26,00)',
      '6209 - CHOC PECCIN TRENTO DUO 16X2 (R$ 26,00)'
    ]
  },
  {
    codigo: '2032388',
    descricao: 'PRESTIGIO',
    preco_venda: 4.00,
    embalagem: 'Pacote/Caixa c/ 30 unidades (18 PCT)',
    qtd_embalagem: 30,
    preco_embalagem: 64.00,
    custo_unitario: 2.1333,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '112 - CHOC NESTLE PRESTIGIO C/30 (R$ 64,00)'
    ]
  },
  {
    codigo: '2032339',
    descricao: 'HALLS ',
    preco_venda: 4.00,
    embalagem: 'Display c/ 21 unidades (30 DP)',
    qtd_embalagem: 21,
    preco_embalagem: 22.90,
    custo_unitario: 1.0905,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '4540 - DROPS HALLS CEREJA C/21 NOVO (R$ 22,90)',
      '22894 - DROPS HALLS EXTRA FORTE C/21 (R$ 22,90)',
      '22893 - DROPS HALLS MENTA C/21 (R$ 22,90)',
      '22895 - DROPS HALLS MENTHOL C/21 (R$ 22,90)'
    ]
  },
  {
    codigo: '2030584',
    descricao: 'OURO BRANCO',
    preco_venda: 2.00,
    embalagem: 'Pacote 1kg (50 bombons de 20g) (10 PCT)',
    qtd_embalagem: 50,
    preco_embalagem: 50.00,
    custo_unitario: 1.0000,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '1439 - BOMBOM LACTA OURO BRANCO 1KG (R$ 50,00)'
    ]
  },
  {
    codigo: '2032405',
    descricao: 'SONHO DE VALSA',
    preco_venda: 2.00,
    embalagem: 'Pacote 1kg (50 bombons de 20g) (10 PCT)',
    qtd_embalagem: 50,
    preco_embalagem: 49.00,
    custo_unitario: 0.9800,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '22510 - BOMBOM LACTA SONHO DE VALSA 1KG (R$ 49,00)'
    ]
  },
  {
    codigo: '2032411',
    descricao: 'TALENTO AVELÃ 85G',
    preco_venda: 11.90,
    embalagem: 'Display 12x85g (8 DP)',
    qtd_embalagem: 12,
    preco_embalagem: 94.00,
    custo_unitario: 7.8333,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '46284 - CHOC GAROTO TALENTO AVELA VERM 12X85G (R$ 94,00)',
      '46285 - CHOC GAROTO TALENTO BCO/PASSAS 12X85G (R$ 94,00)',
      '1477 - CHOC GAROTO TALENTO CAST PARA 12X85G (R$ 94,00)'
    ]
  },
  {
    codigo: '2032189',
    descricao: 'BARRA JOY',
    preco_venda: 4.50,
    embalagem: 'Display c/ 12 barras (DP)',
    qtd_embalagem: 12,
    preco_embalagem: 37.50,
    custo_unitario: 3.1250,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '6646 - BARRA CEREAIS &JOY NUTS CLASSICA C/12 (R$ 37,50)'
    ]
  },
  {
    codigo: '2032237',
    descricao: 'CHICLETE POOSH',
    preco_venda: 0.50,
    embalagem: 'Display c/ 40 unidades (18 DP)',
    qtd_embalagem: 40,
    preco_embalagem: 5.20,
    custo_unitario: 0.1300,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '574 - CHICLE ARCOR POOSH HORTELA C/40 (R$ 5,20)',
      '1728 - CHICLE ARCOR POOSH MORANGO C/40 (R$ 5,20)',
      '922 - CHICLE ARCOR POOSH T.FRUTTI C/40 (R$ 5,20)'
    ]
  },
  {
    codigo: '2030585',
    descricao: 'PAÇOQUITA ROLHA EMBRULHADA',
    preco_venda: 0.50,
    embalagem: 'Caixa c/ 100 unidades (CX)',
    qtd_embalagem: 100,
    preco_embalagem: 21.00,
    custo_unitario: 0.2100,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '4579 - DOCES RIKO DAAL PACOCA ROLHA EMB C/100 (R$ 21,00)'
    ]
  },
  {
    codigo: '2032372',
    descricao: 'Pipoca 40g',
    preco_venda: 2.50,
    embalagem: 'Fardo 40x40g (5 FD)',
    qtd_embalagem: 40,
    preco_embalagem: 31.50,
    custo_unitario: 0.7875,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '45976 - PIPOCA DOCE ARITANA 40X40GR (R$ 31,50)'
    ]
  },
  {
    codigo: '2032369',
    descricao: 'Pipoca 100g',
    preco_venda: 5.00,
    embalagem: 'Fardo 10x100g (10 FD)',
    qtd_embalagem: 10,
    preco_embalagem: 20.70,
    custo_unitario: 2.0700,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '47554 - PIPOCA DOCE ARITANA 10X100G (R$ 20,70)'
    ]
  },
  {
    codigo: '2032305',
    descricao: 'FRUIT-TELLA CARAMELO DE MORANGO COM CREME DE LEITE',
    preco_venda: 4.50,
    embalagem: 'Display c/ 15 unidades (1 DP)',
    qtd_embalagem: 15,
    preco_embalagem: 33.30,
    custo_unitario: 2.2200,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '1596 - DROPS FRUITELLA MORANGO C/CREME C/15 (R$ 33,30)',
      '5887 - DROPS FRUITELLA S.DURA FRAMB VITC C/15 (R$ 33,30)'
    ]
  },
  {
    codigo: '2032251',
    descricao: 'DROPS MENTOS STICK FRUIT 16UNIDADE',
    preco_venda: 4.50,
    embalagem: 'Display c/ 16 unidades (24 DP / PCT)',
    qtd_embalagem: 16,
    preco_embalagem: 31.50,
    custo_unitario: 1.9688,
    fornecedor_doc: 'Orçamento Comercial nº 16852 (13/11/2026)',
    itens_orcamento: [
      '52129 - DROPS MENTOS RAINBOW NOVO C/16 (R$ 31,50)',
      '878 - DROPS MENTOS MINT C/16 (R$ 31,50)',
      '50217 - DROPS MENTOS MORANGO/IOGURTE C/16 (R$ 31,50)'
    ]
  }
];

async function main() {
  console.log('--- 1. EXECUTANDO BACKUP PRÉVIO ---');
  const pe = await runQuery(`SELECT * FROM produtos_eyemobile WHERE workspace_id = '${workspaceId}'`);
  fs.writeFileSync('scripts/backups/backup_eyemobile_pre_orcamento16852.json', JSON.stringify(pe, null, 2));
  console.log(`Backup salvo: ${pe.length} produtos em scripts/backups/backup_eyemobile_pre_orcamento16852.json`);

  const hist = await runQuery(`SELECT * FROM historico_custo_produto WHERE workspace_id = '${workspaceId}'`);
  fs.writeFileSync('scripts/backups/backup_historico_custo_pre_orcamento16852.json', JSON.stringify(hist, null, 2));
  console.log(`Backup salvo: ${hist.length} registros de histórico em scripts/backups/backup_historico_custo_pre_orcamento16852.json`);

  console.log('\n--- 2. SIMULAÇÃO DE ATUALIZAÇÃO ---');
  for (const item of mappedProducts) {
    const existing = pe.find(p => String(p.codigo) === String(item.codigo));
    if (!existing) {
      console.warn(`[AVISO] Produto ${item.codigo} (${item.descricao}) não encontrado no banco!`);
      continue;
    }
    const custoAnterior = Number(existing.custo_atual || 0);
    const markup = item.preco_venda > 0 ? ((item.preco_venda - item.custo_unitario) / item.preco_venda * 100) : 0;
    console.log(`OK: [${item.codigo}] ${existing.descricao} | Custo Ant: R$ ${custoAnterior.toFixed(4)} -> Novo Custo: R$ ${item.custo_unitario.toFixed(4)} | PV: R$ ${item.preco_venda.toFixed(2)} | Margem Bruta: ${markup.toFixed(1)}%`);
  }
  console.log('\nSimulação finalizada com sucesso. 15 produtos prontos para atualização.');
}

main().catch(console.error);
