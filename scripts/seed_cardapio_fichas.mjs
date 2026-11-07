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

const userId = '0adfbd4b-bc98-48c4-8f3b-e22ee5c317c0';
const workspaceId = '2af415b6-76aa-4134-8133-a9b405671c1c';

const items = [
  {
    nome: 'Café Filtrado Especial',
    eyemobile_code: '2030549',
    preco_venda: 3.00,
    categoria: 'cafes',
    insumos: [
      { nome: 'Café em Grão / Pó Especial (Dose 10g)', qtd: 0.010, unidade: 'kg', custo_unit: 44.00 },
      { nome: 'Copo Térmico Descartável 50ml (NF Sellpack 289.329)', qtd: 1.0, unidade: 'un', custo_unit: 0.05 },
      { nome: 'Mexedor Plástico e Sachê Açúcar (NF Sellpack 289.329)', qtd: 1.0, unidade: 'un', custo_unit: 0.11 }
    ]
  },
  {
    nome: 'Café com Leite',
    eyemobile_code: '2032206',
    preco_venda: 5.00,
    categoria: 'cafes',
    insumos: [
      { nome: 'Café em Grão / Pó Especial (Dose 10g)', qtd: 0.010, unidade: 'kg', custo_unit: 44.00 },
      { nome: 'Leite Integral UHT (50ml)', qtd: 0.050, unidade: 'L', custo_unit: 5.00 },
      { nome: 'Copo Térmico Descartável 100ml (NF Sellpack 289.329)', qtd: 1.0, unidade: 'un', custo_unit: 0.25 },
      { nome: 'Mexedor e Sachê Açúcar (NF Sellpack 289.329)', qtd: 1.0, unidade: 'un', custo_unit: 0.16 }
    ]
  },
  {
    nome: 'Pão de Queijo Tradicional',
    eyemobile_code: '2032363',
    preco_venda: 4.50,
    categoria: 'lanches',
    insumos: [
      { nome: 'Pão de Queijo Tradicional Forneado 80g', qtd: 1.0, unidade: 'un', custo_unit: 1.30 },
      { nome: 'Embalagem e Guardanapo Kraft (NF Sellpack 289.329)', qtd: 1.0, unidade: 'un', custo_unit: 0.05 }
    ]
  },
  {
    nome: 'Salgados Tradicionais R$ 8,00',
    eyemobile_code: '2032401',
    preco_venda: 8.00,
    categoria: 'lanches',
    insumos: [
      { nome: 'Salgado Frito / Assado Tradicional (Gerson Salgados)', qtd: 1.0, unidade: 'un', custo_unit: 2.95 },
      { nome: 'Embalagem e Guardanapo Térmico (NF Sellpack 289.329)', qtd: 1.0, unidade: 'un', custo_unit: 0.05 }
    ]
  },
  {
    nome: 'Salgados Forneados PREMIUM',
    eyemobile_code: '2047391',
    preco_venda: 9.00,
    categoria: 'lanches',
    insumos: [
      { nome: 'Salgado Especial Forneado Premium (Gerson Salgados)', qtd: 1.0, unidade: 'un', custo_unit: 3.55 },
      { nome: 'Embalagem e Guardanapo Térmico (NF Sellpack 289.329)', qtd: 1.0, unidade: 'un', custo_unit: 0.05 }
    ]
  },
  {
    nome: 'Promoção 2 Salgados Fim de Noite',
    eyemobile_code: '2032391',
    preco_venda: 10.00,
    categoria: 'lanches',
    insumos: [
      { nome: 'Salgados Tradicionais (Gerson Salgados)', qtd: 2.0, unidade: 'un', custo_unit: 2.95 },
      { nome: 'Embalagem e Guardanapos Térmicos (NF Sellpack 289.329)', qtd: 2.0, unidade: 'un', custo_unit: 0.05 }
    ]
  },
  {
    nome: 'Combo 1 Café + 2 Pães de Queijo',
    eyemobile_code: '2032171',
    preco_venda: 10.90,
    categoria: 'cafes',
    insumos: [
      { nome: 'Café Filtrado Especial c/ Descartáveis (Ficha 2030549)', qtd: 1.0, unidade: 'dose', custo_unit: 0.60 },
      { nome: 'Pão de Queijo Tradicional Forneado 80g (Ficha 2032363)', qtd: 2.0, unidade: 'un', custo_unit: 1.35 }
    ]
  },
  {
    nome: 'Combo 1 Café c/ Leite + 2 Pães de Queijo',
    eyemobile_code: '2032172',
    preco_venda: 12.90,
    categoria: 'cafes',
    insumos: [
      { nome: 'Café com Leite c/ Descartáveis (Ficha 2032206)', qtd: 1.0, unidade: 'dose', custo_unit: 1.10 },
      { nome: 'Pão de Queijo Tradicional Forneado 80g (Ficha 2032363)', qtd: 2.0, unidade: 'un', custo_unit: 1.35 }
    ]
  },
  {
    nome: 'Combo Funcional 2 Pães de Queijo + Café',
    eyemobile_code: '2096921',
    preco_venda: 8.90,
    categoria: 'cafes',
    insumos: [
      { nome: 'Café Filtrado Especial c/ Descartáveis', qtd: 1.0, unidade: 'dose', custo_unit: 0.60 },
      { nome: 'Pão de Queijo Tradicional Forneado 80g', qtd: 2.0, unidade: 'un', custo_unit: 1.35 }
    ]
  },
  {
    nome: 'Combo Funcional 2 Pães de Queijo + Café c/ Leite',
    eyemobile_code: '2096922',
    preco_venda: 9.90,
    categoria: 'cafes',
    insumos: [
      { nome: 'Café com Leite c/ Descartáveis', qtd: 1.0, unidade: 'dose', custo_unit: 1.10 },
      { nome: 'Pão de Queijo Tradicional Forneado 80g', qtd: 2.0, unidade: 'un', custo_unit: 1.35 }
    ]
  },
  {
    nome: 'Combo Salgado Comum + Café c/ Leite',
    eyemobile_code: '2096931',
    preco_venda: 9.90,
    categoria: 'lanches',
    insumos: [
      { nome: 'Salgado Tradicional R$ 8,00 (Gerson Salgados)', qtd: 1.0, unidade: 'un', custo_unit: 3.00 },
      { nome: 'Café com Leite c/ Descartáveis', qtd: 1.0, unidade: 'dose', custo_unit: 1.10 }
    ]
  },
  {
    nome: 'Combo Salgado Comum + Refri 200ml',
    eyemobile_code: '2096923',
    preco_venda: 9.90,
    categoria: 'lanches',
    insumos: [
      { nome: 'Salgado Tradicional R$ 8,00 (Gerson Salgados)', qtd: 1.0, unidade: 'un', custo_unit: 3.00 },
      { nome: 'Refrigerante Caçulinha 200ml (SPAL NF)', qtd: 1.0, unidade: 'un', custo_unit: 1.34 }
    ]
  },
  {
    nome: 'Combo Salgado + Coca-Cola 200ml',
    eyemobile_code: '2294808',
    preco_venda: 11.90,
    categoria: 'lanches',
    insumos: [
      { nome: 'Salgado Tradicional R$ 8,00 (Gerson Salgados)', qtd: 1.0, unidade: 'un', custo_unit: 3.00 },
      { nome: 'Coca-Cola Pet 200ml (SPAL NF)', qtd: 1.0, unidade: 'un', custo_unit: 1.34 }
    ]
  },
  {
    nome: 'Combo Salgado Especial + Refri 200ml',
    eyemobile_code: '2096924',
    preco_venda: 10.90,
    categoria: 'lanches',
    insumos: [
      { nome: 'Salgado Especial Premium (Gerson Salgados)', qtd: 1.0, unidade: 'un', custo_unit: 3.60 },
      { nome: 'Refrigerante Caçulinha 200ml (SPAL NF)', qtd: 1.0, unidade: 'un', custo_unit: 1.34 }
    ]
  },
  {
    nome: 'Combo Salgado Especial + Coca-Cola KS',
    eyemobile_code: '2096933',
    preco_venda: 12.90,
    categoria: 'lanches',
    insumos: [
      { nome: 'Salgado Especial Premium (Gerson Salgados)', qtd: 1.0, unidade: 'un', custo_unit: 3.60 },
      { nome: 'Coca-Cola KS Garrafa Vidro 290ml (SPAL NF)', qtd: 1.0, unidade: 'un', custo_unit: 1.70 }
    ]
  }
];

async function seed() {
  console.log('--- ETAPA 4: Cadastrando Produtos do Cardápio e Fichas Técnicas ---');

  for (const item of items) {
    // 1. Inserir ou atualizar em produtos_cardapio
    const existing = await runQuery(`
      SELECT id FROM produtos_cardapio WHERE eyemobile_product_id = '${item.eyemobile_code}';
    `);

    let cardapioId;
    if (existing && existing.length > 0) {
      cardapioId = existing[0].id;
      await runQuery(`
        UPDATE produtos_cardapio
        SET nome = '${item.nome.replace(/'/g, "''")}',
            preco_venda = ${item.preco_venda},
            categoria = '${item.categoria}',
            ativo = true,
            updated_at = NOW()
        WHERE id = '${cardapioId}';
      `);
    } else {
      const insRes = await runQuery(`
        INSERT INTO produtos_cardapio (
          user_id, workspace_id, nome, preco_venda, eyemobile_product_id, categoria, ativo, created_at, updated_at
        ) VALUES (
          '${userId}', '${workspaceId}', '${item.nome.replace(/'/g, "''")}', ${item.preco_venda}, '${item.eyemobile_code}', '${item.categoria}', true, NOW(), NOW()
        ) RETURNING id;
      `);
      if (!insRes || !insRes[0]) {
        console.error('Erro criando produto cardapio:', item.nome, insRes);
        continue;
      }
      cardapioId = insRes[0].id;
    }

    // 2. Limpar e recriar insumos em fichas_tecnicas
    await runQuery(`DELETE FROM fichas_tecnicas WHERE produto_id = '${cardapioId}';`);

    const values = item.insumos.map(ins => 
      `('${userId}', '${workspaceId}', '${cardapioId}', '${ins.nome.replace(/'/g, "''")}', ${ins.qtd}, '${ins.unidade}', ${ins.custo_unit}, NOW(), NOW())`
    );

    const fRes = await runQuery(`
      INSERT INTO fichas_tecnicas (
        user_id, workspace_id, produto_id, insumo_nome, quantidade, unidade_medida, custo_unitario, created_at, updated_at
      ) VALUES ${values.join(', ')};
    `);

    if (fRes && fRes.error) {
      console.error(`Erro inserindo ficha para ${item.nome}:`, fRes.error);
    } else {
      console.log(`[OK] Ficha técnica criada para: ${item.nome} (${item.insumos.length} insumos)`);
    }

    // 3. Registrar no historico_custo_produto
    const custoTotalItem = item.insumos.reduce((acc, i) => acc + (i.qtd * i.custo_unit), 0);
    const histExist = await runQuery(`
      SELECT id FROM historico_custo_produto WHERE produto_codigo = '${item.eyemobile_code}';
    `);

    if (!histExist || histExist.length === 0) {
      await runQuery(`
        INSERT INTO historico_custo_produto (
          workspace_id, produto_codigo, produto_descricao, fornecedor, custo_unitario, data_compra, nf_id, created_at
        ) VALUES (
          '${workspaceId}', '${item.eyemobile_code}', '${item.nome.replace(/'/g, "''")}', 'Ficha Técnica Auditada (Gerson Salgados / NF Sellpack)', ${custoTotalItem.toFixed(4)}, '2026-11-01', 'FICHA-TECNICA-ETAPA-4', NOW()
        );
      `);
    }
  }

  // Verificar na view v_produtos_custo
  const viewRes = await runQuery(`
    SELECT nome, preco_venda, custo_total, margem_percentual, status_margem, qtd_insumos
    FROM v_produtos_custo
    WHERE workspace_id = '${workspaceId}'
    ORDER BY nome;
  `);

  console.log('\n--- View v_produtos_custo (Resultado Etapa 4) ---');
  console.table(viewRes);
}

seed().catch(console.error);
