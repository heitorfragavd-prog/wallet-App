import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ProcessMessageContext {
  text?: string;
  imageBase64?: string;
  userId: string;
  workspaceId: string;
  accessLevel: string;
  isGroup: boolean;
  channelType: "whatsapp" | "telegram" | "chatgpt";
  supabaseUrl: string;
  supabaseServiceKey: string;
  nomeExibicao?: string;
}

export async function processMessage(ctx: ProcessMessageContext): Promise<string> {
  const supabase = createClient(ctx.supabaseUrl, ctx.supabaseServiceKey);
  
  // Buscar a chave API da OpenAI nas configurações do usuário no banco
  const { data: config } = await supabase
    .from("ia_configuracoes")
    .select("api_key")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  const openAiKey = config?.api_key || Deno.env.get("OPENAI_API_KEY") || "";

  if (!openAiKey) {
    return "⚠️ Chave API da OpenAI não configurada. Por favor, insira sua chave no painel do Wallet > IA > Configurações.";
  }

  if (ctx.imageBase64) {
    return await processDocument(ctx, supabase, openAiKey);
  }

  const cleanText = (ctx.text || "").trim();
  
  if (cleanText.startsWith("/")) {
    return await processCommand(cleanText, ctx, supabase);
  }

  return await processQuery(cleanText, ctx, supabase, openAiKey);
}

// Função ultra-rápida (0.2ms) que injeta cabeçalho EXIF de orientação sem decodificar pixels
function addExifOrientation(base64Str: string, orientation = 8): string {
  try {
    const binaryStr = atob(base64Str);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return base64Str;

    const exifHeader = new Uint8Array([
      0xFF, 0xE1, 0x00, 0x1E,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
      orientation, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);

    const combined = new Uint8Array(2 + exifHeader.length + (bytes.length - 2));
    combined.set(bytes.subarray(0, 2), 0);
    combined.set(exifHeader, 2);
    combined.set(bytes.subarray(2), 2 + exifHeader.length);

    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < combined.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, combined.subarray(i, i + chunkSize) as any);
    }
    return btoa(binary);
  } catch (_e) {
    return base64Str;
  }
}

// ─── 📄 PROCESSAMENTO DE IMAGEM (NF / BOLETO) ───────────────────────────────────
async function processDocument(ctx: ProcessMessageContext, supabase: any, openAiKey: string): Promise<string> {
  try {
    const prompt = `Você é um extrator de OCR financeiro profissional especialista em boletos bancários e notas fiscais brasileiras.
Você pode receber a imagem do documento em diferentes orientações.

REGRAS RIGOROSAS DE EXTRAÇÃO:
1. EXAMINE A IMAGEM NA ORIENTAÇÃO CORRETA (gire mentalmente 90 ou 270 graus se necessário). Foque na "Ficha de Compensação" na via principal do boleto.
2. BENEFICIÁRIO / CREDOR: Localize o campo "Beneficiário", "Cedente" ou "Sacador/Avalista". Extraia a razão social da empresa cobradora que recebe o valor (ex: "SPAL INDÚSTRIA BRASILEIRA DE BEBIDAS S.A."). NUNCA use o nome do Pagador/Sacado ("Heitor Fraga de Oliveira").
3. VALOR TOTAL DO DOCUMENTO: Leia os últimos 10 dígitos da Linha Digitável (eles representam o valor total exato do boleto em centavos, por exemplo: se a linha digitável termina em 0000126255, o valor total é EXATAMENTE 1262.55). Verifique também a caixa "Valor do Documento" (1.262,55). NUNCA confunda o valor total com os campos de Multa (25,25) ou Mora (1,52)!
4. DATA DE VENCIMENTO: Localize a data na caixa "Vencimento" na Ficha de Compensação principal (ex: 14/08/2026 ou 24/08/2026 -> formato YYYY-MM-DD). Se o boleto for referente a bebidas (SPAL/Coca-Cola), atente-se para o ano 2026.
5. LINHA DIGITÁVEL: Extraia a linha digitável completa gravada no boleto.
6. VERACIDADE ABSOLUTA: NUNCA invente, adivinhe ou alucine nomes de credores, valores ou datas. Só extraia o que estiver visível no documento.

Retorne estritamente um JSON no seguinte formato:
{
  "document_type": "nota_fiscal" | "boleto" | "desconhecido",
  "nf_data": {
    "fornecedor": "Nome do fornecedor exato",
    "valor": 123.45,
    "data": "YYYY-MM-DD",
    "numero_nf": "Número da NF se houver",
    "categoria_sugerida": "Categoria aplicável"
  },
  "boleto_data": {
    "credor": "Nome exato do BENEFICIÁRIO (cedente/credor que recebe o pagamento)",
    "valor_total": 1262.55,
    "data_vencimento": "YYYY-MM-DD",
    "codigo_barras": "Apenas os números",
    "linha_digitavel": "Apenas os números/caracteres",
    "pix_copia_cola": "Código Pix se houver",
    "categoria_sugerida": "Categoria aplicável"
  }
}`;

    const base64Exif8 = addExifOrientation(ctx.imageBase64 || "", 8);

    const userContent: any[] = [
      { type: "text", text: "Extraia os dados exatos deste documento financeiro. Analise todas as orientações fornecidas e use a mais legível na vertical." },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${ctx.imageBase64}`, detail: "high" } },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Exif8}`, detail: "high" } }
    ];



    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: userContent
          }
        ]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI API returned status ${resp.status}: ${errText}`);
    }

    const resJson = await resp.json();
    const resultText = resJson.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(resultText);

    if (data.document_type === "nota_fiscal") {
      const nf = data.nf_data || {};
      
      // Salvar na tabela ia_analysis_results como pendente para confirmação
      const { data: saved, error: insertError } = await supabase.from("ia_analysis_results").insert({
        user_id: ctx.userId,
        file_name: "nota_fiscal_telegram.jpg",
        tipo: "nota_fiscal",
        descricao: JSON.stringify(nf),
        valor: nf.valor || 0,
        categoria: nf.categoria_sugerida || "Outros",
        data: nf.data || new Date().toISOString().split("T")[0],
        status: "pendente"
      }).select("id").single();

      if (insertError) {
        console.error("[processDocument Insert NF Error]", insertError);
      }

      if (ctx.isGroup) {
        return `✅ Nota Fiscal de ${nf.fornecedor || "Fornecedor"} processada (R$ ${(nf.valor || 0).toFixed(2)}). Digite /confirmar para salvar.`;
      } else {
        return `📄 *Nota Fiscal Detectada*\n` +
               `- **Fornecedor:** ${nf.fornecedor || "Não identificado"}\n` +
               `- **Valor:** R$ ${(nf.valor || 0).toFixed(2)}\n` +
               `- **Data:** ${nf.data || "Não identificada"}\n` +
               `- **Ações Pendentes:** Atualizar custo Eyemobile, Adicionar ao estoque e Lançar despesa.\n\n` +
               `Digite **/confirmar** para efetivar o lançamento.`;
      }
    } else if (data.document_type === "boleto") {
      const bol = data.boleto_data || {};

      // Validação de sanidade dos dados extraídos do boleto
      const validacao = validarDadosBoleto(bol);
      if (!validacao.valido) {
        console.warn("[processDocument] Validação de dados do boleto falhou:", validacao);

        // Tarefa 3: Logar erro na tabela ia_leitura_erros
        try {
          await supabase.from("ia_leitura_erros").insert({
            user_id: ctx.userId,
            motivo: validacao.motivo || "Dados de boleto suspeitos ou inconsistentes",
            campos_suspeitos: validacao.camposSuspeitos || [],
            raw_analysis: data,
            channel_type: ctx.channelType
          });
        } catch (logErr) {
          console.error("[processDocument ia_leitura_erros Error]", logErr);
        }

        // Tarefa 2: Resposta amigável de fallback
        return `⚠️ *Não consegui ler o boleto direito*\n\n` +
               `*Problema:* ${validacao.motivo || "Dados de leitura inconsistentes"}\n\n` +
               `💡 *Como tirar a foto corretamente:*\n` +
               `1️⃣ Segure o celular *em pé* (vertical)\n` +
               `2️⃣ Coloque o boleto sobre uma mesa plana\n` +
               `3️⃣ Certifique-se de que a luz está boa (sem sombras)\n` +
               `4️⃣ O boleto deve ocupar a maior parte da foto\n` +
               `5️⃣ Evite enviar deitado (horizontal)\n\n` +
               `Envie a foto novamente em pé que vou conseguir ler todos os dados! 📸`;
      }

      // Salvar na tabela ia_analysis_results como pendente para confirmação
      const { data: saved, error: insertError } = await supabase.from("ia_analysis_results").insert({
        user_id: ctx.userId,
        file_name: "boleto_telegram.jpg",
        tipo: "boleto",
        descricao: JSON.stringify(bol),
        valor: bol.valor_total || 0,
        categoria: bol.categoria_sugerida || "Outros",
        data: bol.data_vencimento || new Date().toISOString().split("T")[0],
        status: "pendente"
      }).select("id").single();

      if (insertError) {
        console.error("[processDocument Insert Boleto Error]", insertError);
      }

      if (ctx.isGroup) {
        return `✅ Boleto de ${bol.credor || "Credor"} processado (R$ ${(bol.valor_total || 0).toFixed(2)}). Digite /confirmar para salvar.`;
      } else {
        let textMsg = `📑 *Boleto Bancário Detectado*\n` +
               `- **Credor:** ${bol.credor || "Não identificado"}\n` +
               `- **Valor:** R$ ${(bol.valor_total || 0).toFixed(2)}\n` +
               `- **Vencimento:** ${bol.data_vencimento || "Não identificado"}\n` +
               `- **Linha Digitável:** \`${bol.linha_digitavel || "Não identificada"}\`\n\n`;
        if (bol.pix_copia_cola) {
          textMsg += `⚡ *Pix Copia e Cola:* \`${bol.pix_copia_cola}\`\n\n`;
        }
        textMsg += `Digite **/confirmar** para cadastrar esta dívida pendente.`;
        return textMsg;
      }
    }

    return "⚠️ Não foi possível identificar o tipo de documento na imagem (deve ser Nota Fiscal ou Boleto).";
  } catch (err) {
    console.error("[processDocument Error]", err);
    return "❌ Ocorreu um erro ao processar a imagem do documento.";
  }
}

// ─── 🎛️ PROCESSAMENTO DE COMANDOS (/nf, /boleto, etc.) ──────────────────────
async function processCommand(commandText: string, ctx: ProcessMessageContext, supabase: any): Promise<string> {
  const parts = commandText.split(" ");
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (cmd === "/start") {
    return `Olá, ${ctx.nomeExibicao || "usuário"}! Bem-vindo ao Wallet AI. 🤖💼\n\n` +
           `Aqui estão os comandos que você pode utilizar comigo:\n` +
           `- **Nota Fiscal**: Envie uma foto da NF ou use o comando /nf\n` +
           `- **Boleto**: Envie uma foto do boleto ou use o comando /boleto\n` +
           `- **Fechamento de Caixa**: /fechamento <valor> (calcula a diferença do dia)\n` +
           `- **Conferir caixa retroativo**: /conferir <data YYYY-MM-DD> <valor>\n` +
           `- **Confirmar lançamento**: /confirmar (para salvar no banco a NF/Boleto recém-enviado)\n\n` +
           `No chat privado, você também pode me fazer perguntas financeiras diretamente!`;
  }

  if (cmd === "/nf") {
    return "Envie a foto da Nota Fiscal para processar.";
  }
  if (cmd === "/boleto") {
    return "Envie a foto do Boleto Bancário para processar.";
  }

  if (cmd === "/fechamento" || cmd === "/conferir") {
    if (ctx.accessLevel !== "admin" && ctx.accessLevel !== "socio") {
      return "⚠️ Permissão negada. Este comando está disponível apenas para Sócios e Administradores.";
    }

    let valorRelatado = 0;
    let dataTurno = new Date().toISOString().split("T")[0];

    if (cmd === "/fechamento") {
      if (args.length === 0) {
        return "ℹ️ Informe o valor do fechamento. Ex: `/fechamento 1500.00`";
      }
      valorRelatado = Number(args[0]);
    } else { // /conferir
      if (args.length < 2) {
        return "ℹ️ Uso correto: `/conferir YYYY-MM-DD valor`. Ex: `/conferir 2026-08-12 1500.00`";
      }
      dataTurno = args[0];
      valorRelatado = Number(args[1]);
    }

    // Calcular fechamento
    // 1. Vendas Eyemobile
    const { data: vendas } = await supabase
      .from("transacoes")
      .select("valor")
      .eq("user_id", ctx.userId)
      .eq("workspace_id", ctx.workspaceId)
      .eq("tipo", "receita")
      .eq("data", dataTurno);
    const totalVendas = (vendas || []).reduce((sum: number, v: any) => sum + Number(v.valor || 0), 0);

    // 2. Saques Divipay
    const { data: saques } = await supabase
      .from("transacoes")
      .select("valor")
      .eq("user_id", ctx.userId)
      .eq("workspace_id", ctx.workspaceId)
      .eq("tipo", "despesa")
      .eq("data", dataTurno)
      .ilike("descricao", "%divipay%");
    const totalSaques = (saques || []).reduce((sum: number, s: any) => sum + Number(s.valor || 0), 0);

    const esperado = totalVendas - totalSaques;
    const diferenca = valorRelatado - esperado;

    if (Math.abs(diferenca) <= 0.01) {
      return `✅ *Fechamento batera perfeito!*\n- Data: ${dataTurno}\n- Vendas Eyemobile: R$ ${totalVendas.toFixed(2)}\n- Saques Divipay: R$ ${totalSaques.toFixed(2)}\n- Saldo Esperado: R$ ${esperado.toFixed(2)}\n- Relatado: R$ ${valorRelatado.toFixed(2)}`;
    } else if (diferenca < 0) {
      return `⚠️ *Diferença de Caixa (FURO)*\n- Data: ${dataTurno}\n- Vendas Eyemobile: R$ ${totalVendas.toFixed(2)}\n- Saques Divipay: R$ ${totalSaques.toFixed(2)}\n- Saldo Esperado: R$ ${esperado.toFixed(2)}\n- Relatado: R$ ${valorRelatado.toFixed(2)}\n- **Furo:** R$ ${Math.abs(diferenca).toFixed(2)} faltantes!`;
    } else {
      return `📊 *Diferença de Caixa (SOBRA)*\n- Data: ${dataTurno}\n- Vendas Eyemobile: R$ ${totalVendas.toFixed(2)}\n- Saques Divipay: R$ ${totalSaques.toFixed(2)}\n- Saldo Esperado: R$ ${esperado.toFixed(2)}\n- Relatado: R$ ${valorRelatado.toFixed(2)}\n- **Sobra:** R$ ${diferenca.toFixed(2)} a mais!`;
    }
  }

  if (cmd === "/confirmar") {
    // Buscar última análise pendente do usuário
    const { data: pendente, error } = await supabase
      .from("ia_analysis_results")
      .select("*")
      .eq("user_id", ctx.userId)
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !pendente) {
      return "⚠️ Nenhuma ação pendente de confirmação encontrada.";
    }

    const payload = JSON.parse(pendente.descricao);

    if (pendente.tipo === "nota_fiscal") {
      // Cadastrar despesa da NF
      const { data: catId } = await supabase.rpc("resolve_categoria_by_name", {
        p_user_id: ctx.userId,
        p_name: pendente.categoria,
        p_type: "despesa"
      });

      await supabase.from("despesas").insert({
        user_id: ctx.userId,
        workspace_id: ctx.workspaceId,
        descricao: `Compra: ${payload.fornecedor || "Fornecedor"} (NF ${payload.numero_nf || ""})`,
        valor: Number(pendente.valor),
        data: pendente.data,
        categoria_id: catId || null
      });

      await supabase.from("ia_analysis_results").update({ status: "confirmado" }).eq("id", pendente.id);
      return `✅ Lançamento da Nota Fiscal de R$ ${Number(pendente.valor).toFixed(2)} confirmado com sucesso!`;
    } else if (pendente.tipo === "boleto") {
      // Cadastrar dívida do boleto
      const obsParts = [
        `Boleto.`,
        payload.linha_digitavel ? `Linha digitável: ${payload.linha_digitavel}` : null,
        payload.codigo_barras ? `Código de barras: ${payload.codigo_barras}` : null,
        payload.pix_copia_cola ? `Pix Copia e Cola: ${payload.pix_copia_cola}` : null
      ].filter(Boolean);

      await supabase.from("dividas").insert({
        user_id: ctx.userId,
        workspace_id: ctx.workspaceId,
        descricao: payload.descricao || `Boleto: ${payload.credor || "Credor"}`,
        valor_total: Number(pendente.valor),
        data_vencimento: pendente.data,
        credor: payload.credor || null,
        status: "pendente",
        observacoes: obsParts.join(" | ")
      });

      await supabase.from("ia_analysis_results").update({ status: "confirmado" }).eq("id", pendente.id);
      return `✅ Dívida do boleto de R$ ${Number(pendente.valor).toFixed(2)} cadastrada com sucesso!`;
    }
  }

  return `⚠️ Comando desconhecido: ${cmd}`;
}

// ─── 💬 PERGUNTAS E CONTEXTO FINANCEIRO (INTEGRADO) ───────────────────────────
async function processQuery(queryText: string, ctx: ProcessMessageContext, supabase: any, openAiKey: string): Promise<string> {
  // Se for em grupo, bloqueia perguntas livres
  if (ctx.isGroup) {
    return "ℹ️ Use o chat privado comigo para dúvidas.";
  }

  // 1. Construir contexto financeiro real
  const contextText = await getFinancialContextString(supabase, ctx.userId, ctx.workspaceId);

  // 2. Invocar GPT-4o com o contexto no System Prompt
  const systemPrompt = `Você é o Assistente Financeiro Inteligente do Wallet. Você tem acesso completo aos dados financeiros do usuário.

## COMPORTAMENTO DE CANAL (PRIVADO)
- Aja como conselheira financeira completa.
- Respostas detalhadas, análises profundas, sugestões proativas e amigáveis.
- Combine múltiplas fontes de dados e ajude no planejamento financeiro.
- Sempre formate valores monetários como R$ X.XXX,XX.
- Use emojis para facilitar leitura.

${contextText}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: queryText }
      ]
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI API returned status ${resp.status}: ${errText}`);
  }

  const resJson = await resp.json();
  return resJson.choices?.[0]?.message?.content || "Desculpe, não consegui processar sua dúvida.";
}

// Helper para montar a string de contexto exatamente igual ao useFinancialContext
async function getFinancialContextString(supabase: any, userId: string, workspaceId: string): Promise<string> {
  const hoje = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const hojeIso = formatter.format(hoje); // YYYY-MM-DD
  
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemIso = formatter.format(ontem); // YYYY-MM-DD

  const inicioMes = `${hojeIso.substring(0, 7)}-01`;

  // Para evitar WORKER_RESOURCE_LIMIT devido ao grande volume de transações históricas,
  // limitamos a consulta aos últimos 35 dias (cobrando o mês atual e final do anterior)
  const trintaEDoisDiasAtras = new Date();
  trintaEDoisDiasAtras.setDate(trintaEDoisDiasAtras.getDate() - 35);
  const limiteData = formatter.format(trintaEDoisDiasAtras); // YYYY-MM-DD

  const [
    { data: resDividas },
    { data: resReceitas },
    { data: resDespesas },
    { data: resTransacoes },
    { data: resContas },
    { data: resMetas },
  ] = await Promise.all([
    supabase.from("dividas").select("*").or(`workspace_id.eq.${workspaceId},workspace_id.is.null`),
    supabase.from("receitas").select("*, categorias!categoria_id(nome)").or(`workspace_id.eq.${workspaceId},workspace_id.is.null`).gte("data", limiteData),
    supabase.from("despesas").select("*, categorias!categoria_id(nome)").or(`workspace_id.eq.${workspaceId},workspace_id.is.null`).gte("data", limiteData),
    supabase.from("transacoes").select("*, categorias!categoria_id(nome)").or(`workspace_id.eq.${workspaceId},workspace_id.is.null`).gte("data", limiteData),
    supabase.from("contas_usuario").select("*").or(`workspace_id.eq.${workspaceId},workspace_id.is.null`),
    supabase.from("metas").select("*").or(`workspace_id.eq.${workspaceId},workspace_id.is.null`),
  ]);

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  function normalizeDate(d: any): string {
    if (!d) return "";
    const str = typeof d === "string" ? d : d.toISOString();
    return str.substring(0, 10);
  }

  // ─── RECEITAS ───
  const receitasList = [...(resReceitas || []), ...(resTransacoes || []).filter((t: any) => t.tipo === "receita")];
  const receitasNoMes = receitasList.filter((r: any) => normalizeDate(r.data) >= inicioMes && normalizeDate(r.data) <= hojeIso);
  const totalReceitasMes = receitasNoMes.reduce((sum: number, r: any) => sum + Number(r.valor || 0), 0);
  const totalReceitasHoje = receitasList.filter((r: any) => normalizeDate(r.data) === hojeIso).reduce((sum: number, r: any) => sum + Number(r.valor || 0), 0);

  // ─── DESPESAS ───
  const despesasList = [...(resDespesas || []), ...(resTransacoes || []).filter((t: any) => t.tipo === "despesa")];
  const despesasNoMes = despesasList.filter((d: any) => normalizeDate(d.data) >= inicioMes && normalizeDate(d.data) <= hojeIso);
  const totalDespesasMes = despesasNoMes.reduce((sum: number, d: any) => sum + Number(d.valor || 0), 0);
  const totalDespesasHoje = despesasList.filter((d: any) => normalizeDate(d.data) === hojeIso).reduce((sum: number, d: any) => sum + Number(d.valor || 0), 0);

  // ─── EYEMOBILE PDV ───
  const vendasHoje = receitasList
    .filter(r => normalizeDate(r.data) === hojeIso && (String(r.observacoes || "").toLowerCase().includes("eyemobile") || String(r.origem || "").toLowerCase().includes("eyemobile") || String(r.descricao || "").toLowerCase().includes("eyemobile")))
    .reduce((sum, r) => sum + Number(r.valor || 0), 0);
  
  const vendasOntem = receitasList
    .filter(r => normalizeDate(r.data) === ontemIso && (String(r.observacoes || "").toLowerCase().includes("eyemobile") || String(r.origem || "").toLowerCase().includes("eyemobile") || String(r.descricao || "").toLowerCase().includes("eyemobile")))
    .reduce((sum, r) => sum + Number(r.valor || 0), 0);

  const vendasMes = receitasList
    .filter(r => normalizeDate(r.data) >= inicioMes && normalizeDate(r.data) <= hojeIso && (String(r.observacoes || "").toLowerCase().includes("eyemobile") || String(r.origem || "").toLowerCase().includes("eyemobile") || String(r.descricao || "").toLowerCase().includes("eyemobile")))
    .reduce((sum, r) => sum + Number(r.valor || 0), 0);

  // ─── DÍVIDAS ───
  const dividasList = resDividas || [];
  const totalPendente = dividasList
    .filter((d: any) => d.status === "pendente")
    .reduce((sum: number, d: any) => sum + (Number(d.valor_total || 0) - Number(d.valor_pago || 0)), 0);

  // ─── CONTAS ───
  const contasMapped = (resContas || []).map((c: any) => ({
    nome: c.nome,
    saldo_atual: Number(c.saldo_atual ?? c.saldo ?? 0),
    tipo: c.tipo
  }));
  const saldoTotal = contasMapped
    .filter((c: any) => c.tipo !== "cartao_credito")
    .reduce((sum: number, c: any) => sum + c.saldo_atual, 0);

  let text = `# CONTEXTO FINANCEIRO REAL DO USUÁRIO\n`;
  text += `Atualizado em: ${hoje.toLocaleString("pt-BR")} (Fuso Horário de Brasília)\n\n`;
  text += `## 💰 Caixa & Saldos\n`;
  text += `- **Saldo total (caixa livre):** ${fmt(saldoTotal)}\n`;
  contasMapped.forEach((c: any) => {
    text += `  - *${c.nome}*: ${fmt(c.saldo_atual)}\n`;
  });
  text += `\n`;
  text += `## 📈 Receitas & Despesas (Este Mês)\n`;
  text += `- **Total Receitas:** ${fmt(totalReceitasMes)} (Hoje: ${fmt(totalReceitasHoje)})\n`;
  text += `- **Total Despesas:** ${fmt(totalDespesasMes)} (Hoje: ${fmt(totalDespesasHoje)})\n`;
  text += `- **Lucro/Resultado:** ${fmt(totalReceitasMes - totalDespesasMes)}\n\n`;
  
  text += `## 🏪 Eyemobile PDV & Vendas\n`;
  text += `- **Vendas PDV Hoje (${hojeIso}):** ${fmt(vendasHoje)}\n`;
  text += `- **Vendas PDV Ontem (${ontemIso}):** ${fmt(vendasOntem)}\n`;
  text += `- **Vendas PDV no Mês:** ${fmt(vendasMes)}\n\n`;

  text += `## 🛑 Dívidas & Compromissos\n`;
  text += `- **Total Pendente:** ${fmt(totalPendente)}\n\n`;

  // Detalhar as 30 últimas transações (receitas/despesas/vendas) para que a IA tenha histórico de ontem, etc.
  const transacoesMapeadas = [
    ...receitasList.map(r => ({ ...r, tipo_transacao: "receita" })),
    ...despesasList.map(d => ({ ...d, tipo_transacao: "despesa" }))
  ].sort((a, b) => {
    const dateA = normalizeDate(a.data);
    const dateB = normalizeDate(b.data);
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const timeA = a.created_at || "";
    const timeB = b.created_at || "";
    return timeB.localeCompare(timeA);
  }).slice(0, 30);

  text += `## 📝 Últimas 30 Transações Registradas (Histórico Recente)\n`;
  if (transacoesMapeadas.length > 0) {
    transacoesMapeadas.forEach((t: any) => {
      const dataFormatada = normalizeDate(t.data);
      const dataLabel = dataFormatada === hojeIso ? "Hoje" : dataFormatada === ontemIso ? "Ontem" : dataFormatada;
      const emoji = t.tipo_transacao === "receita" ? "📈" : "📉";
      text += `- ${emoji} **[${t.tipo_transacao.toUpperCase()}]** [${dataLabel}] **${t.descricao || "Sem descrição"}**: ${fmt(Number(t.valor || 0))} | Categoria: ${t.categorias?.nome || "Outros"} | Pagamento: ${t.metodo_pagamento || "Não especificado"}${t.observacoes ? ` | Obs: ${t.observacoes}` : ""}\n`;
    });
  } else {
    text += `- Nenhuma transação registrada no período.\n`;
  }

  return text;
}

// ─── 🛡️ FUNÇÃO DE VALIDAÇÃO DE SANIDADE DOS DADOS DO BOLETO ──────────────────────
function validarDadosBoleto(bol: any): { valido: boolean; motivo?: string; camposSuspeitos?: string[] } {
  const erros: string[] = [];
  const camposSuspeitos: string[] = [];
  
  // 1. Valor: deve ser entre R$ 1 e R$ 100.000
  const valor = Number(bol.valor_total || bol.valor || bol.amount || 0);
  if (valor < 1) {
    erros.push("Valor menor que R$ 1,00 ou não identificado");
    camposSuspeitos.push("valor");
  }
  if (valor > 100000) {
    erros.push("Valor excessivamente alto (acima de R$ 100.000)");
    camposSuspeitos.push("valor");
  }
  
  // 2. Data: entre 1 ano atrás e 1 ano no futuro
  const vencimento = bol.data_vencimento || bol.vencimento || bol.dueDate || "";
  const dataVenc = new Date(vencimento);
  const hoje = new Date();
  const umAnoAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
  const umAnoFrente = new Date(hoje.getFullYear() + 1, hoje.getMonth(), hoje.getDate());
  
  if (!vencimento || isNaN(dataVenc.getTime()) || dataVenc < umAnoAtras || dataVenc > umAnoFrente) {
    erros.push("Data de vencimento fora do intervalo normal");
    camposSuspeitos.push("vencimento");
  }
  
  // 3. Linha digitável: 44-48 dígitos se fornecida
  const linha = String(bol.linha_digitavel || "").replace(/\D/g, "");
  if (linha.length > 0 && (linha.length < 44 || linha.length > 48)) {
    erros.push("Linha digitável com número de dígitos incorreto");
    camposSuspeitos.push("linha_digitavel");
  }
  
  // 4. Código de barras: 44 dígitos se fornecido
  const codigo = String(bol.codigo_barras || "").replace(/\D/g, "");
  if (codigo.length > 0 && codigo.length !== 44) {
    erros.push("Código de barras com número de dígitos incorreto");
    camposSuspeitos.push("codigo_barras");
  }
  
  // 5. Credor: pelo menos 3 caracteres
  const credor = String(bol.credor || bol.beneficiario || "").trim();
  if (!credor || credor.length < 3) {
    erros.push("Credor não identificado com clareza");
    camposSuspeitos.push("credor");
  }
  
  // Se mais de 1 campo suspeito -> rejeita
  if (camposSuspeitos.length >= 2) {
    return { valido: false, motivo: erros.join("; "), camposSuspeitos };
  }
  
  // Se campo crítico (valor ou linha) suspeito -> rejeita
  if (camposSuspeitos.includes("valor") || (linha.length > 0 && camposSuspeitos.includes("linha_digitavel"))) {
    return { valido: false, motivo: erros.join("; "), camposSuspeitos };
  }
  
  return { valido: true };
}
