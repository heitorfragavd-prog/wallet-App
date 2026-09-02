import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── PARSER DETERMINÍSTICO DE XML DE NF-e ───
function parseNFeXml(xmlText: string) {
  const getTag = (xml: string, tag: string): string => {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return match ? match[1].trim() : "";
  };

  const getNum = (xml: string, tag: string): number => {
    const v = getTag(xml, tag);
    return v ? parseFloat(v) || 0 : 0;
  };

  let chaveAcesso = getTag(xmlText, "chNFe");
  if (!chaveAcesso) {
    const idMatch = xmlText.match(/Id="NFe(\d{44})"/i);
    if (idMatch) chaveAcesso = idMatch[1];
  }

  const ideMatch = xmlText.match(/<ide[\s\S]*?<\/ide>/i);
  const ideXml = ideMatch ? ideMatch[0] : "";
  const numeroNf = getTag(ideXml, "nNF");
  const serieNf = getTag(ideXml, "serie");
  const dataEmissaoRaw = getTag(ideXml, "dhEmi") || getTag(ideXml, "dEmi");
  const dataEmissao = dataEmissaoRaw ? dataEmissaoRaw.split("T")[0] : "";

  const emitMatch = xmlText.match(/<emit[\s\S]*?<\/emit>/i);
  const emitXml = emitMatch ? emitMatch[0] : "";
  const cnpjFornecedor = getTag(emitXml, "CNPJ") || getTag(emitXml, "CPF");
  const razaoSocial = getTag(emitXml, "xNome");
  const nomeFantasia = getTag(emitXml, "xFant");
  const fornecedor = razaoSocial || nomeFantasia || "Fornecedor";

  const totalMatch = xmlText.match(/<ICMSTot[\s\S]*?<\/ICMSTot>/i);
  const totalXml = totalMatch ? totalMatch[0] : "";
  const valorTotalNf = getNum(totalXml, "vNF");
  const valorProdutos = getNum(totalXml, "vProd");
  const valorIcms = getNum(totalXml, "vICMS");
  const valorIcmsSt = getNum(totalXml, "vST");
  const valorIpi = getNum(totalXml, "vIPI");
  const valorFrete = getNum(totalXml, "vFrete");
  const valorDesconto = getNum(totalXml, "vDesc");

  const detMatches = xmlText.match(/<det[\s\S]*?<\/det>/gi) || [];
  const itens = detMatches.map((detXml, index) => {
    const prodMatch = detXml.match(/<prod[\s\S]*?<\/prod>/i);
    const prodXml = prodMatch ? prodMatch[0] : "";

    const codigo = getTag(prodXml, "cProd") || String(index + 1);
    const descricao = getTag(prodXml, "xProd");
    const ncm = getTag(prodXml, "NCM");
    const cfop = getTag(prodXml, "CFOP");
    const unidade = getTag(prodXml, "uCom") || "UN";
    const quantidade = getNum(prodXml, "qCom") || 1;
    const valorUnitario = getNum(prodXml, "vUnCom");
    const valorTotal = getNum(prodXml, "vProd");

    const icmsAliq = getNum(detXml, "pICMS");
    const ipiAliq = getNum(detXml, "pIPI");
    const pisAliq = getNum(detXml, "pPIS");
    const cofinsAliq = getNum(detXml, "pCOFINS");

    const icmsValor = valorUnitario * (icmsAliq / 100);
    const ipiValor = valorUnitario * (ipiAliq / 100);
    const custoUnitarioLiquido = Math.max(0, valorUnitario - icmsValor - ipiValor);

    return {
      codigo,
      descricao,
      ncm,
      cfop,
      unidade,
      quantidade,
      valor_unitario: valorUnitario,
      valor_total: valorTotal,
      icms_aliquota: icmsAliq,
      ipi_aliquota: ipiAliq,
      pis_aliquota: pisAliq,
      cofins_aliquota: cofinsAliq,
      custo_unitario_liquido: custoUnitarioLiquido > 0 ? custoUnitarioLiquido : valorUnitario,
    };
  });

  return {
    tipo: "nf_compra",
    confianca_geral: "alta",
    origem: "sefaz",
    cabecalho: {
      numero_nf: numeroNf,
      serie_nf: serieNf,
      data_emissao: dataEmissao,
      data_entrada: dataEmissao,
      fornecedor,
      cnpj_fornecedor: cnpjFornecedor,
      chave_acesso: chaveAcesso,
    },
    valores_totais: {
      valor_total_nf: valorTotalNf,
      valor_produtos: valorProdutos,
      valor_icms: valorIcms,
      valor_icms_st: valorIcmsSt,
      valor_ipi: valorIpi,
      valor_frete: valorFrete,
      valor_desconto: valorDesconto,
    },
    itens,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    console.log("[sefaz-sync] Iniciando ciclo de sincronização SEFAZ DF-e...");

    // 1. Busca todos os certificados ativos
    const { data: certificados, error: errCert } = await supabase
      .from("workspace_certificados_sefaz")
      .select("*")
      .eq("status", "ativo")
      .eq("sincronizacao_automatica", true);

    if (errCert || !certificados || certificados.length === 0) {
      console.log("[sefaz-sync] Nenhum certificado digital ativo encontrado para sincronização.");
      return new Response(JSON.stringify({ message: "Nenhum certificado ativo", synced: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalNotasSincronizadas = 0;

    for (const cert of certificados) {
      console.log(`[sefaz-sync] Sincronizando CNPJ ${cert.cnpj} (Workspace: ${cert.workspace_id})...`);

      // Atualiza timestamp da última sincronização
      await supabase
        .from("workspace_certificados_sefaz")
        .update({ ultima_sincronizacao: new Date().toISOString() })
        .eq("id", cert.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        certificados_processados: certificados.length,
        notas_sincronizadas: totalNotasSincronizadas,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[sefaz-sync] Erro geral na sincronização SEFAZ:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
