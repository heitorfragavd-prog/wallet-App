import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Configurar worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface TransacaoParseada {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  parcela_atual: number | null;
  total_parcelas: number | null;
  valor_total: number | null;
  categoria_id?: string;
  categoria_nome?: string;
  categoria_sugerida?: string;
  isDuplicada: boolean;
  selecionada: boolean;
}

export type BancoDetectado = "sicoob" | "nubank" | "itau" | "desconhecido";

// ========== MAPEAMENTO DE PALAVRAS-CHAVE PARA CATEGORIAS ==========
const KEYWORD_CATEGORIES: Record<string, string[]> = {
  "Alimentação": ["GRILETTO", "RESTAURANTE", "PADARIA", "LANCHONETE", "PIZZARIA", "HAMBURGUER", "IFOOD", "UBER EATS", "RAPPI", "AÇAI", "SORVETERIA", "CAFETERIA", "COFFEE", "RESTAURANTE FAZENDA", "SUPER LUNA", "FULLDARIN", "DEPOSITO DA BADIA", "ESPACO BEBIDAS", "DELLYS"],
  "Supermercado": ["SUPERMERCADO", "HIPERMERCADO", "MERCADO", "ATACADO", "ASSAI", "CARREFOUR", "WALMART", "EXTRA", "SONDA", "TAUSTE", "APOIO", "MINEIRAO", "SUPER LUNA PARTAGE", "VILLEFORT"],
  "Compras": ["AMAZON", "SHOPEE", "MERCADO LIVRE", "MAGAZINE", "AMERICANAS", "CASAS BAHIA", "SUBMARINO", "SHEIN", "ALIEXPRESS", "LOJAS AMERICANAS", "ELECTROLUX", "NILKO", "DISTRIBUIDORA"],
  "Transporte": ["UBER", "99", "CABIFY", "TAXI", "POSTO", "SHELL", "IPRANGA", "PETROBRAS", "ESTACIONAMENTO", "PARKING", "PEDAGIO"],
  "Assinaturas": ["NETFLIX", "SPOTIFY", "YOUTUBE", "GOOGLE", "AMAZON PRIME", "DISNEY", "HBO", "GLOBOPLAY", "PARAMOUNT", "APPLE", "MICROSOFT", "ADOBE", "VINDI", "MARKETUP"],
  "Serviços": ["MP*CHAVEIRO", "CHAVEIRO", "MATERIAIS", "LIDER MATERIAIS", "CONSTRUÇAO", "REFORMA"],
  "Saúde": ["FARMACIA", "DROGARIA", "HOSPITAL", "CLINICA", "MEDICO", "DENTISTA", "LABORATORIO", "RAIO X"],
  "Educação": ["ESCOLA", "FACULDADE", "UNIVERSIDADE", "CURSO", "ALURA", "UDEMY", "COURSERA", "ROCKETSEAT"],
  "Vestuário": ["ROUPA", "CALÇADO", "TENIS", "MODA", "LOJA", "CAMISETA", "BERMUDA"],
  "Entretenimento": ["CINEMA", "SHOW", "TEATRO", "EVENTO", "BILHETE", "INGRESSO"],
};

function sugerirCategoria(descricao: string): string | undefined {
  const descUpper = descricao.toUpperCase();
  for (const [categoria, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
    for (const keyword of keywords) {
      if (descUpper.includes(keyword.toUpperCase())) {
        return categoria;
      }
    }
  }
  return undefined;
}

// ========== HASH ==========
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function hashTransacoes(transacoes: TransacaoParseada[]): string {
  const str = transacoes
    .map(t => `${t.data}|${t.descricao}|${t.valor}|${t.parcela_atual || 0}`)
    .sort()
    .join(";;");
  return hashString(str);
}

// ========== EXTRACAO DE PDF ==========
export async function extrairTextoDoPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textoCompleto = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const textItems = content.items.map((item: any) => item.str).join(" ");
    textoCompleto += textItems + "\n";
  }

  return textoCompleto;
}

// ========== DETECCAO DE BANCO ==========
export function detectarBanco(texto: string): BancoDetectado {
  const upper = texto.toUpperCase();
  if (upper.includes("SICOOB") || upper.includes("EXTRATO DE CARTAO") || /\d{2}\/\d{2}\s*\|/.test(texto)) {
    return "sicoob";
  }
  if (upper.includes("NUBANK") || upper.includes("NU PAGAMENTOS") || /\d{2}\s+[A-Z]{3}\s+/.test(texto)) {
    return "nubank";
  }
  if (upper.includes("ITAU") || upper.includes("ITAÚ") || /ITAU\s+UNIBANCO/.test(upper)) {
    return "itau";
  }
  return "desconhecido";
}

// ========== PARSER SICOOB MULTILINHA E ANCORAS DE DATA ==========
export function parsearFaturaSicoob(texto: string, anoFatura: number): TransacaoParseada[] {
  const transacoes: TransacaoParseada[] = [];
  
  // DIVIDIR POR PONTOS DE TRANSAÇÃO: logo após um valor financeiro (ex: 103,55) seguido de uma data (ex: 04/06 )
  // Ou dividir por quebras de linha se o texto for formatado
  const blocosBrutos = texto.split(/\n|\r\n/);
  const blocos: string[] = [];

  for (const b of blocosBrutos) {
    const subBlocos = b.split(/(?<=[\d\.]+,\d{2}\s+)(?=\d{2}\/\d{2}\s)/);
    for (const sb of subBlocos) {
      if (sb.trim()) blocos.push(sb.trim());
    }
  }

  for (const bloco of blocos) {
    const trimmed = bloco.trim();
    if (!trimmed || trimmed.length < 12) continue;

    // Ignorar cabeçalhos e resumos
    if (/^(SICOOB|SISTEMA|PLATAFORMA|EXTRATO|CLIENTE|CONTA|FATURA|MOVIMENTOS|SALDO|ANUIDADE|DESC|PAGAMENTO|PROTECAO|GASTOS|TOTAL|DEMONSTRATIVO|LIMITES|ENCARGOS|RESUMO|PERFIL|CANAIS|REGIOES|OUVIDORIA|DEFICIENTE|SAC|Site|Vencimento|Pagamento|Rotativo|Saque|Crédito|Débitos|ARTIGO|EDUCAÇÃO|CONSTRUÇÃO|SUPERMERCADO|AUTOMÓVEIS|DIVERSOS|GASTRONOMIA|ESPORTES)/i.test(trimmed)) {
      continue;
    }

    // Procura data DD/MM no início do bloco
    const dataMatch = trimmed.match(/^(\d{2})\/(\d{2})/);
    if (!dataMatch) continue;
    const dia = parseInt(dataMatch[1]);
    const mes = parseInt(dataMatch[2]);

    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) continue;

    const mesFatura = new Date().getMonth() + 1;
    let ano = anoFatura;
    if (mes > mesFatura + 1) ano = anoFatura - 1;
    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

    // Procura valor no final do bloco (ex: 103,55)
    const valorMatch = trimmed.match(/([\d\.]+,\d{2})\b/);
    if (!valorMatch) continue;
    const valor = parseFloat(valorMatch[1].replace(/\./g, "").replace(",", "."));
    if (isNaN(valor) || valor <= 0 || valor > 1000000) continue;

    // Extrair o texto intermediário (entre data e valor)
    let meio = trimmed.substring(trimmed.indexOf(" ")).trim();
    const idxValor = meio.lastIndexOf(valorMatch[1]);
    if (idxValor > -1) {
      meio = meio.substring(0, idxValor).trim();
    }

    // Extrair informação de parcelas se houver (ex: 03/03)
    let parcela_atual: number | null = null;
    let total_parcelas: number | null = null;
    let descricao = meio;

    const parcelaMatch = meio.match(/(\d{2})\/(\d{2})/);
    if (parcelaMatch) {
      const p1 = parseInt(parcelaMatch[1]);
      const p2 = parseInt(parcelaMatch[2]);
      if (p1 <= p2 && p2 <= 48 && p1 > 0) {
        parcela_atual = p1;
        total_parcelas = p2;
        const idx = meio.indexOf(parcelaMatch[0]);
        descricao = meio.substring(0, idx).trim();
      }
    }

    descricao = descricao.replace(/\s+/g, " ").trim();
    if (!descricao || descricao.length < 2) continue;

    // Ignorar lançamentos institucionais / pagamentos
    const descUpper = descricao.toUpperCase();
    if (/^(PAGAMENTO|ANUIDADE|ENCARGO|JUROS|IOF|PROTECAO|PROTEÇÃO|SALDO|DESC\s)/.test(descUpper)) continue;
    if (/PAGAMENTO-BOLETO|ANUIDADE MASTERCARD|PROTECAO PERDA|SALDO ANTERIOR/.test(descUpper)) continue;

    const valor_total = total_parcelas ? valor * total_parcelas : null;
    const categoria_sugerida = sugerirCategoria(descricao);

    transacoes.push({
      id: crypto.randomUUID(),
      data,
      descricao,
      valor,
      parcela_atual,
      total_parcelas,
      valor_total,
      categoria_sugerida,
      selecionada: true,
      isDuplicada: false,
    });
  }

  return transacoes;
}

// ========== PARSER NUBANK MULTILINHA ROBULTO ==========
export function parsearFaturaNubank(texto: string, anoFatura: number): TransacaoParseada[] {
  const rawLines = texto.split(/\n|\r\n/);
  const entryBuffers: string[] = [];
  let currentBuffer = "";

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^(NUBANK|NU PAGAMENTOS|FATURA|RESUMO|CARTAO|LIMITE|TOTAL|PARCELAS|COMPRAS|AJUSTES)/i.test(line)) {
      continue;
    }

    const isDateStart = /^\d{2}\s+[A-Z]{3}\b/i.test(line) || /^\d{2}\/\d{2}\b/.test(line);
    if (isDateStart) {
      if (currentBuffer) entryBuffers.push(currentBuffer);
      currentBuffer = line;
    } else if (currentBuffer) {
      currentBuffer += " " + line;
    }
  }
  if (currentBuffer) entryBuffers.push(currentBuffer);

  const transacoes: TransacaoParseada[] = [];

  for (const entry of entryBuffers) {
    const regexNubank1 = /^(\d{2})\s+([A-Z]{3})\s+(.+?)\s+R?\$?\s*(-?[\d\.]+,\d{2})$/i;
    const regexNubank2 = /^(\d{2})\/(\d{2})\s+(.+?)\s+R?\$?\s*(-?[\d\.]+,\d{2})$/;

    const match = entry.match(regexNubank1) || entry.match(regexNubank2);
    if (!match) continue;

    let dia: number, mes: number, descricao: string, valorStr: string;

    if (match.length === 5 && /^[A-Z]{3}$/i.test(match[2])) {
      const meses: Record<string, number> = {
        JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
        JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
      };
      dia = parseInt(match[1]);
      mes = meses[match[2].toUpperCase()] || 1;
      descricao = match[3].trim();
      valorStr = match[4];
    } else {
      dia = parseInt(match[1]);
      mes = parseInt(match[2]);
      descricao = match[3].trim();
      valorStr = match[4];
    }

    if (valorStr.includes("-")) continue;

    const descUpper = descricao.toUpperCase();
    if (/PAGAMENTO|ANUIDADE|ENCARGO|JUROS|IOF/.test(descUpper)) continue;

    const mesFatura = new Date().getMonth() + 1;
    let ano = anoFatura;
    if (mes > mesFatura + 1) ano = anoFatura - 1;

    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

    let parcela_atual: number | null = null;
    let total_parcelas: number | null = null;

    const parcelaMatch = descricao.match(/(\d{2})\/(\d{2})/);
    if (parcelaMatch) {
      parcela_atual = parseInt(parcelaMatch[1]);
      total_parcelas = parseInt(parcelaMatch[2]);
      descricao = descricao.replace(/\s*\d{2}\/\d{2}/, "").trim();
    }

    const valor = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
    if (isNaN(valor) || valor <= 0) continue;

    const valor_total = total_parcelas ? valor * total_parcelas : null;
    const categoria_sugerida = sugerirCategoria(descricao);

    transacoes.push({
      id: crypto.randomUUID(),
      data,
      descricao,
      valor,
      parcela_atual,
      total_parcelas,
      valor_total,
      categoria_sugerida,
      selecionada: true,
      isDuplicada: false,
    });
  }

  return transacoes;
}

// ========== PARSER ITAU MULTILINHA ROBULTO ==========
export function parsearFaturaItau(texto: string, anoFatura: number): TransacaoParseada[] {
  const rawLines = texto.split(/\n|\r\n/);
  const entryBuffers: string[] = [];
  let currentBuffer = "";

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^(ITAU|ITAÚ|EXTRATO|CARTAO|FATURA|RESUMO|LIMITE|DISPONIVEL|VENCIMENTO|TOTAL|SAQUES|COMPRAS|PARCELAS)/i.test(line)) {
      continue;
    }

    if (/^\d{2}\/\d{2}/.test(line)) {
      if (currentBuffer) entryBuffers.push(currentBuffer);
      currentBuffer = line;
    } else if (currentBuffer) {
      currentBuffer += " " + line;
    }
  }
  if (currentBuffer) entryBuffers.push(currentBuffer);

  const transacoes: TransacaoParseada[] = [];

  for (const entry of entryBuffers) {
    const regexItau = /^(\d{2})\/(\d{2})(?:\/(\d{4}))?\s+(.+?)\s+(-?[\d\.]+,\d{2})$/;
    const match = entry.match(regexItau);
    if (!match) continue;

    const dia = parseInt(match[1]);
    const mes = parseInt(match[2]);
    const ano = match[3] ? parseInt(match[3]) : anoFatura;
    let descricao = match[4].trim();
    const valorStr = match[5];

    if (valorStr.includes("-")) continue;

    const descUpper = descricao.toUpperCase();
    if (/PAGAMENTO|ANUIDADE|ENCARGO|JUROS|IOF/.test(descUpper)) continue;

    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

    let parcela_atual: number | null = null;
    let total_parcelas: number | null = null;

    const parcelaMatch = descricao.match(/(\d{2})\/(\d{2})/);
    if (parcelaMatch) {
      parcela_atual = parseInt(parcelaMatch[1]);
      total_parcelas = parseInt(parcelaMatch[2]);
      descricao = descricao.replace(/\s*\d{2}\/\d{2}/, "").trim();
    }

    const valor = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
    if (isNaN(valor) || valor <= 0) continue;

    const valor_total = total_parcelas ? valor * total_parcelas : null;
    const categoria_sugerida = sugerirCategoria(descricao);

    transacoes.push({
      id: crypto.randomUUID(),
      data,
      descricao,
      valor,
      parcela_atual,
      total_parcelas,
      valor_total,
      categoria_sugerida,
      selecionada: true,
      isDuplicada: false,
    });
  }

  return transacoes;
}

// ========== PARSER UNIVERSAL ==========
export function parsearFatura(texto: string, anoFatura: number): { banco: BancoDetectado; transacoes: TransacaoParseada[] } {
  const banco = detectarBanco(texto);
  
  switch (banco) {
    case "sicoob":
      return { banco, transacoes: parsearFaturaSicoob(texto, anoFatura) };
    case "nubank":
      return { banco, transacoes: parsearFaturaNubank(texto, anoFatura) };
    case "itau":
      return { banco, transacoes: parsearFaturaItau(texto, anoFatura) };
    default:
      const parsers = [
        parsearFaturaSicoob(texto, anoFatura),
        parsearFaturaNubank(texto, anoFatura),
        parsearFaturaItau(texto, anoFatura),
      ];
      const melhor = parsers.reduce((a, b) => a.length > b.length ? a : b);
      return { banco: "desconhecido", transacoes: melhor };
  }
}

export function extrairDatasDaFatura(texto: string): { fechamento: string | null; vencimento: string | null; diaFechamento: number | null; diaVencimento: number | null } {
  let fechamento: string | null = null;
  let vencimento: string | null = null;
  let diaFechamento: number | null = null;
  let diaVencimento: number | null = null;
  
  // Padrão: "Fechamento 01/08/2026" ou "Fechamento: 01/08/2026"
  const fechamentoMatch = texto.match(/Fechamento[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (fechamentoMatch) {
    const [, dia, mes, ano] = fechamentoMatch;
    fechamento = `${ano}-${mes}-${dia}`;
    diaFechamento = parseInt(dia);
  }
  
  // Padrão: "Vencimento 10/08/2026" ou "Vencimento: 10/08/2026" ou "Vencimento: 22/08/2026"
  const vencimentoMatch = texto.match(/Vencimento[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (vencimentoMatch) {
    const [, dia, mes, ano] = vencimentoMatch;
    vencimento = `${ano}-${mes}-${dia}`;
    diaVencimento = parseInt(dia);
  }
  
  return { fechamento, vencimento, diaFechamento, diaVencimento };
}

// ========== HOOK PRINCIPAL ==========
export function useImportarFatura() {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const [transacoes, setTransacoes] = useState<TransacaoParseada[]>([]);
  const [bancoDetectado, setBancoDetectado] = useState<BancoDetectado>("desconhecido");
  const [isAnalisando, setIsAnalisando] = useState(false);
  const [isExtraindoPDF, setIsExtraindoPDF] = useState(false);
  
  const cartoesQuery = useQuery({
    queryKey: ["contas-cartoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_usuario")
        .select("*")
        .eq("tipo", "cartao_credito");
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });
  
  const categoriasQuery = useQuery({
    queryKey: ["categorias-despesa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorias")
        .select("*")
        .eq("tipo", "despesa");
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });
  
  const extrairPDF = useCallback(async (file: File): Promise<string> => {
    setIsExtraindoPDF(true);
    try {
      const texto = await extrairTextoDoPDF(file);
      return texto;
    } catch (err) {
      toast({ title: "Erro ao ler PDF", description: "Não foi possível extrair o texto do PDF.", variant: "destructive" });
      throw err;
    } finally {
      setIsExtraindoPDF(false);
    }
  }, [toast]);
  
  const analisar = useCallback(async (texto: string, contaId: string, mesReferencia: string, vencimento: string, ignorarDuplicatas = false) => {
    setIsAnalisando(true);
    try {
      // Extrair e atualizar datas de fechamento / vencimento no cartão
      const { fechamento: fechamentoExtraido, vencimento: vencimentoExtraido, diaFechamento, diaVencimento } = extrairDatasDaFatura(texto);
      
      if (contaId) {
        const updateData: Record<string, any> = {};
        if (fechamentoExtraido) updateData.data_fechamento = fechamentoExtraido;
        if (diaFechamento) updateData.dia_fechamento = diaFechamento;
        
        if (vencimentoExtraido || vencimento) updateData.data_vencimento = vencimentoExtraido || vencimento;
        if (diaVencimento) updateData.dia_vencimento = diaVencimento;
        
        if (Object.keys(updateData).length > 0) {
          await supabase.from("contas_usuario").update(updateData).eq("id", contaId);
          await qc.invalidateQueries({ queryKey: ["contas_usuario"] });
          await qc.invalidateQueries({ queryKey: ["contas-cartoes"] });
          await qc.invalidateQueries({ queryKey: ["contas"] });
        }
      }

      const anoFatura = parseInt(mesReferencia.split("-")[0]);
      const { banco, transacoes: parseadas } = parsearFatura(texto, anoFatura);
      setBancoDetectado(banco);
      
      if (parseadas.length === 0) {
        toast({
          title: "Nenhuma transação encontrada",
          description: "Não foi possível extrair automaticamente. Tente:\n1. Copiar e colar o texto manualmente (Ctrl+A, Ctrl+C no PDF, Ctrl+V aqui)\n2. Verificar se o PDF não está protegido contra cópia\n3. Verificar se o banco está na lista suportada (Sicoob, Nubank, Itaú)",
          variant: "default",
        });
        setTransacoes([]);
        return;
      }
      
      const categoriasMap = new Map<string, string>();
      for (const cat of (categoriasQuery.data || [])) {
        categoriasMap.set(cat.nome.toUpperCase(), cat.id);
      }
      
      const parseadasComCat = parseadas.map(t => {
        if (t.categoria_sugerida) {
          const catId = categoriasMap.get(t.categoria_sugerida.toUpperCase());
          if (catId) {
            return { ...t, categoria_id: catId, categoria_nome: t.categoria_sugerida };
          }
        }
        return t;
      });
      
      let comStatus = [];

      if (ignorarDuplicatas) {
        comStatus = parseadasComCat.map(t => ({ ...t, isDuplicada: false, selecionada: true }));
      } else {
        const { data: existentes } = await supabase
          .from("transacoes")
          .select("descricao, valor, data, parcela_atual, total_parcelas")
          .eq("tipo", "despesa")
          .or(`cartao_id.eq.${contaId},conta_id.eq.${contaId}`)
          .gte("data", `${anoFatura}-01-01`)
          .lte("data", `${anoFatura}-12-31`);
        
        comStatus = parseadasComCat.map(t => {
          const duplicada = existentes?.some(e => {
            const mesmaDesc = e.descricao?.toLowerCase().includes(t.descricao.toLowerCase()) || 
                             t.descricao.toLowerCase().includes(e.descricao?.toLowerCase() || "");
            const mesmoValor = Math.abs(e.valor - t.valor) < 0.01;
            const mesmaData = e.data === t.data;
            const mesmaParcela = (e.parcela_atual || 0) === (t.parcela_atual || 0);
            return mesmaDesc && mesmoValor && mesmaData && mesmaParcela;
          });
          
          return { ...t, isDuplicada: !!duplicada, selecionada: !duplicada };
        });
      }
      
      setTransacoes(comStatus);
      toast({ 
        title: `${parseadas.length} transações encontradas`, 
        description: `Banco: ${banco.toUpperCase()}. ${comStatus.filter(t => t.isDuplicada).length} já existem.` 
      });
    } catch (err) {
      toast({ title: "Erro ao analisar", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setIsAnalisando(false);
    }
  }, [toast, categoriasQuery.data]);
  
  const importar = useCallback(async (contaId: string, mesReferencia: string, vencimento: string, transacoesSelecionadas: TransacaoParseada[]) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Não autenticado");
      
      let criadas = 0;
      
      for (const t of transacoesSelecionadas) {
        if (!t.selecionada) continue;
        
        const { error } = await supabase.from("transacoes").insert({
          user_id: user.id,
          workspace_id: activeWorkspace?.id || null,
          tipo: "despesa",
          descricao: t.total_parcelas && t.total_parcelas > 1 
            ? `${t.descricao} (${t.parcela_atual}/${t.total_parcelas})`
            : t.descricao,
          valor: t.valor,
          data: t.data,
          mes_referencia: mesReferencia,
          categoria_id: t.categoria_id || null,
          cartao_id: contaId,
          conta_id: contaId,
          metodo_pagamento: "cartao_credito",
          parcela_atual: t.parcela_atual,
          total_parcelas: t.total_parcelas,
        });
        
        if (error) throw error;
        criadas++;
      }
      
      const hash = hashTransacoes(transacoes);
      await supabase.from("fatura_cartao_importacoes").insert({
        user_id: user.id,
        workspace_id: activeWorkspace?.id || null,
        conta_id: contaId,
        mes_referencia: mesReferencia,
        vencimento: vencimento || null,
        hash_transacoes: hash,
        transacoes_criadas: criadas,
      });
      
      await qc.invalidateQueries({ queryKey: ["transacoes"] });
      await qc.invalidateQueries({ queryKey: ["despesas"] });
      
      toast({ title: "Importação concluída!", description: `${criadas} transações criadas.` });
      setTransacoes([]);
      setBancoDetectado("desconhecido");
      return criadas;
    } catch (err) {
      toast({ title: "Erro ao importar", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
      throw err;
    }
  }, [toast, activeWorkspace, qc, transacoes]);
  
  const toggleSelecao = useCallback((id: string) => {
    setTransacoes(prev => prev.map(t => t.id === id ? { ...t, selecionada: !t.selecionada } : t));
  }, []);
  
  const setCategoria = useCallback((id: string, categoriaId: string, categoriaNome: string) => {
    setTransacoes(prev => prev.map(t => t.id === id ? { ...t, categoria_id: categoriaId, categoria_nome: categoriaNome } : t));
  }, []);
  
  const selecionarTodas = useCallback(() => {
    setTransacoes(prev => prev.map(t => ({ ...t, selecionada: true })));
  }, []);
  
  const desselecionarDuplicadas = useCallback(() => {
    setTransacoes(prev => prev.map(t => t.isDuplicada ? { ...t, selecionada: false } : t));
  }, []);
  
  return {
    transacoes,
    valorTotalFatura: transacoes.reduce((acc, t) => acc + t.valor, 0),
    bancoDetectado,
    isAnalisando,
    isExtraindoPDF,
    cartoes: cartoesQuery.data || [],
    categorias: categoriasQuery.data || [],
    isLoadingCartoes: cartoesQuery.isLoading,
    isLoadingCategorias: categoriasQuery.isLoading,
    analisar,
    importar,
    extrairPDF,
    toggleSelecao,
    setCategoria,
    selecionarTodas,
    desselecionarDuplicadas,
    limpar: () => { setTransacoes([]); setBancoDetectado("desconhecido"); },
  };
}
