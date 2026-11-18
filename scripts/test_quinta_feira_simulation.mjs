import fs from 'fs';

const token = fs.readFileSync('C:/Users/Heitor/.supabase/mcp-token.txt', 'utf8').trim();
const PROJECT_REF = 'hdeguzxkdvebdrrutbnx';
const WORKSPACE_ID = '2af415b6-76aa-4134-8133-a9b405671c1c';

async function testQuintaFeira() {
  const dataQuinta = '2026-11-19';

  console.log(`[TESTE GATE 8] Consultando pedidos reais gerados para ${dataQuinta}...`);

  const pedidosRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        SELECT p.id, p.fornecedor_nome, p.status, p.canal_envio, p.texto_pedido_formatado, p.metadata
        FROM public.compras_pedidos p
        WHERE p.workspace_id = '${WORKSPACE_ID}' AND p.data_pedido = '${dataQuinta}'
        ORDER BY p.fornecedor_nome;
      `
    })
  });

  const pedidos = await pedidosRes.json();
  console.log(`Total de pedidos encontrados para ${dataQuinta}:`, pedidos.length);
  for (const ped of pedidos) {
    console.log(`- Fornecedor: ${ped.fornecedor_nome} | Status: ${ped.status} | Canal: ${ped.canal_envio} | Meta:`, ped.metadata);
  }

  // Itens
  const itensRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        SELECT pi.produto_nome, pi.quantidade_referencia, pi.estoque_atual, pi.quantidade_sugerida, pi.status_estoque, p.fornecedor_nome
        FROM public.compras_pedidos_itens pi
        JOIN public.compras_pedidos p ON p.id = pi.pedido_id
        WHERE p.workspace_id = '${WORKSPACE_ID}' AND p.data_pedido = '${dataQuinta}'
        ORDER BY p.fornecedor_nome, pi.produto_nome;
      `
    })
  });

  const itens = await itensRes.json();
  console.log(`Total de itens em pedidos para ${dataQuinta}:`, itens.length);
  for (const item of itens) {
    console.log(`  [${item.fornecedor_nome}] ${item.produto_nome}: ref=${item.quantidade_referencia}, est=${item.estoque_atual}, sug=${item.quantidade_sugerida}, status=${item.status_estoque}`);
  }
}

testQuintaFeira().catch(console.error);
