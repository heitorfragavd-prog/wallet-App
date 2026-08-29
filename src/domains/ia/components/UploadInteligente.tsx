import React, { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Upload, Camera, FileText, Check, Trash2, Loader2, Sparkles } from "lucide-react";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { logger } from "@/core/logging/LoggerService";

interface ExtracaoItem {
  codigo: string;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface ExtracaoDados {
  tipo_documento: "nota_fiscal" | "boleto" | "comprovante" | "desconhecido";
  confianca: number;
  dados: {
    fornecedor: string;
    cnpj_fornecedor: string;
    numero_nf: string;
    data_emissao: string;
    valor_total: number;
    itens: ExtracaoItem[];
    beneficiario: string;
    valor: number;
    vencimento: string;
    codigo_barras: string;
    linha_digitavel: string;
    pix_copia_cola: string;
    descricao: string;
  };
  acao_sugerida: "atualizar_custo" | "cadastrar_divida" | "cadastrar_despesa" | "apenas_informar";
  mensagem_usuario: string;
}

const RESPONSE_FORMAT_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "documento_extracao",
    strict: true,
    schema: {
      type: "object",
      properties: {
        tipo_documento: { type: "string", enum: ["nota_fiscal", "boleto", "comprovante", "desconhecido"] },
        confianca: { type: "number" },
        dados: {
          type: "object",
          properties: {
            fornecedor: { type: "string" },
            cnpj_fornecedor: { type: "string" },
            numero_nf: { type: "string" },
            data_emissao: { type: "string" },
            valor_total: { type: "number" },
            itens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  codigo: { type: "string" },
                  nome: { type: "string" },
                  quantidade: { type: "number" },
                  valor_unitario: { type: "number" },
                  valor_total: { type: "number" },
                },
                required: ["codigo", "nome", "quantidade", "valor_unitario", "valor_total"],
                additionalProperties: false,
              },
            },
            beneficiario: { type: "string" },
            valor: { type: "number" },
            vencimento: { type: "string" },
            codigo_barras: { type: "string" },
            linha_digitavel: { type: "string" },
            pix_copia_cola: { type: "string" },
            descricao: { type: "string" },
          },
          required: [
            "fornecedor", "cnpj_fornecedor", "numero_nf", "data_emissao", "valor_total", 
            "itens", "beneficiario", "valor", "vencimento", "codigo_barras", 
            "linha_digitavel", "pix_copia_cola", "descricao"
          ],
          additionalProperties: false,
        },
        acao_sugerida: { type: "string", enum: ["atualizar_custo", "cadastrar_divida", "cadastrar_despesa", "apenas_informar"] },
        mensagem_usuario: { type: "string" },
      },
      required: ["tipo_documento", "confianca", "dados", "acao_sugerida", "mensagem_usuario"],
      additionalProperties: false,
    },
  },
};

export const UploadInteligente = () => {
  const { toast } = useToast();
  const { categoriasDespesa } = useCategorias();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [extracao, setExtracao] = useState<ExtracaoDados | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Estados editáveis para Nota Fiscal
  const [nfFornecedor, setNfFornecedor] = useState("");
  const [nfValorTotal, setNfValorTotal] = useState(0);
  const [nfData, setNfData] = useState("");
  const [nfNumero, setNfNumero] = useState("");
  const [nfItens, setNfItens] = useState<{ item: ExtracaoItem; updateCusto: boolean; addEstoque: boolean }[]>([]);
  const [nfLancarDespesa, setNfLancarDespesa] = useState(true);

  // Estados editáveis para Boleto
  const [bolBeneficiario, setBolBeneficiario] = useState("");
  const [bolValor, setBolValor] = useState(0);
  const [bolVencimento, setBolVencimento] = useState("");
  const [bolCodigoBarras, setBolCodigoBarras] = useState("");
  const [bolLinhaDigitavel, setBolLinhaDigitavel] = useState("");
  const [bolPix, setBolPix] = useState("");
  const [bolCategoria, setBolCategoria] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    setIsConfirmed(false);
    setExtracao(null);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileChange(files[0]);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setExtracao(null);
    setIsConfirmed(false);
  };

  const processarDocumento = async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setExtracao(null);
    setIsConfirmed(false);

    try {
      // 1. Converter arquivo para Base64
      const base64 = await fileToBase64(selectedFile);
      const cleanedBase64 = base64.split(",")[1];

      // 2. Invocar Edge Function com GPT-4o Vision e Structured Outputs
      const prompt = `Analise este documento financeiro e extraia todas as informações necessárias.`;
      const { data, error } = await supabase.functions.invoke("openai-proxy", {
        body: {
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${selectedFile.type};base64,${cleanedBase64}`,
                    detail: "high"
                  }
                }
              ]
            }
          ],
          response_format: RESPONSE_FORMAT_SCHEMA,
          max_tokens: 3000,
          temperature: 0.2
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("Não foi possível extrair dados do documento.");

      const parseResult = JSON.parse(content) as ExtracaoDados;
      setExtracao(parseResult);

      // Preencher estados editáveis com base no tipo
      if (parseResult.tipo_documento === "nota_fiscal") {
        setNfFornecedor(parseResult.dados.fornecedor || "");
        setNfValorTotal(parseResult.dados.valor_total || 0);
        setNfData(parseResult.dados.data_emissao || new Date().toISOString().split("T")[0]);
        setNfNumero(parseResult.dados.numero_nf || "");
        setNfItens(
          (parseResult.dados.itens || []).map(item => ({
            item,
            updateCusto: true,
            addEstoque: true
          }))
        );
      } else {
        setBolBeneficiario(parseResult.dados.beneficiario || parseResult.dados.fornecedor || "");
        setBolValor(parseResult.dados.valor || parseResult.dados.valor_total || 0);
        setBolVencimento(parseResult.dados.vencimento || parseResult.dados.data_emissao || "");
        setBolCodigoBarras(parseResult.dados.codigo_barras || "");
        setBolLinhaDigitavel(parseResult.dados.linha_digitavel || "");
        setBolPix(parseResult.dados.pix_copia_cola || "");
        
        // Tentar sugerir categoria com base no beneficiário
        const nomeSugerido = (parseResult.dados.beneficiario || "").toLowerCase();
        const catMatched = categoriasDespesa.find(c => 
          nomeSugerido.includes(c.nome.toLowerCase()) || 
          c.nome.toLowerCase().includes(nomeSugerido)
        );
        setBolCategoria(catMatched?.id || "");
      }

      toast({ title: "Documento analisado!", description: "Revise e confirme os dados abaixo." });
    } catch (err) {
      logger.error("UploadInteligente", "Erro ao analisar documento", { error: String(err) });
      toast({
        title: "Erro ao analisar",
        description: err instanceof Error ? err.message : "Erro desconhecido durante o OCR.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Confirmação de Nota Fiscal
  const handleConfirmarNF = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Criar Despesa
      if (nfLancarDespesa) {
        const { data: defaultCat } = await supabase.from("categorias")
          .select("id")
          .eq("user_id", user.id)
          .eq("tipo", "despesa")
          .ilike("nome", "%compra%")
          .limit(1)
          .maybeSingle();

        const { error: despErr } = await supabase.from("despesas").insert({
          user_id: user.id,
          descricao: `Compra: ${nfFornecedor}`,
          valor: nfValorTotal,
          data: nfData,
          categoria_id: defaultCat?.id || null,
          observacoes: `NF nº ${nfNumero}. Fornecedor: ${nfFornecedor}.`
        });

        if (despErr) throw despErr;
      }

      // 2. Atualizar estoque/custos de produtos
      for (const iData of nfItens) {
        if (!iData.updateCusto && !iData.addEstoque) continue;

        // Buscar se produto existe
        let foundProd: any = null;
        if (iData.item.codigo) {
          const { data } = await supabase.from("eyemobile_produtos")
            .select("*")
            .eq("user_id", user.id)
            .eq("codigo_barras", iData.item.codigo)
            .maybeSingle();
          if (data) foundProd = data;
        }
        if (!foundProd) {
          const { data } = await supabase.from("eyemobile_produtos")
            .select("*")
            .eq("user_id", user.id)
            .ilike("nome", iData.item.nome)
            .maybeSingle();
          if (data) foundProd = data;
        }

        if (foundProd) {
          // Atualizar
          const updates: any = {};
          if (iData.updateCusto) updates.custo = iData.item.valor_unitario;
          if (iData.addEstoque) updates.estoque = Number(foundProd.estoque || 0) + Number(iData.item.quantidade || 0);

          await supabase.from("eyemobile_produtos")
            .update(updates)
            .eq("id", foundProd.id);
        } else {
          // Inserir como novo se não achar
          await supabase.from("eyemobile_produtos").insert({
            user_id: user.id,
            nome: iData.item.nome,
            codigo_barras: iData.item.codigo || null,
            custo: iData.updateCusto ? iData.item.valor_unitario : 0,
            estoque: iData.addEstoque ? iData.item.quantidade : 0
          });
        }
      }

      setIsConfirmed(true);
      toast({ title: "Nota Fiscal Processada!", description: "Dados adicionados com sucesso." });
    } catch (err) {
      toast({ title: "Erro ao confirmar", description: String(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirmação de Boleto
  const handleConfirmarBoleto = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const obsParts = [
        "Boleto cadastrado via IA.",
        bolLinhaDigitavel ? `Linha: ${bolLinhaDigitavel}` : null,
        bolCodigoBarras ? `Cód. Barras: ${bolCodigoBarras}` : null,
        bolPix ? `Pix: ${bolPix}` : null
      ].filter(Boolean);

      const { error } = await supabase.from("dividas").insert({
        user_id: user.id,
        descricao: `Boleto: ${bolBeneficiario}`,
        valor_total: bolValor,
        data_vencimento: bolVencimento || null,
        status: "pendente",
        categoria_id: bolCategoria || null,
        observacoes: obsParts.join(" | ")
      });

      if (error) throw error;

      setIsConfirmed(true);
      toast({ title: "Boleto Cadastrado!", description: "Dívida adicionada com sucesso." });
    } catch (err) {
      toast({ title: "Erro ao confirmar", description: String(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border border-border/50 bg-gradient-to-br from-purple-500/5 to-violet-600/5">
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Scanner de Documentos Inteligente
          </CardTitle>
          <CardDescription>
            Tire uma foto ou arraste comprovantes, notas fiscais ou boletos para atualizar seu estoque, custos e despesas instantaneamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* UPLOAD ZONE */}
          {!selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${dragOver ? "border-purple-500 bg-purple-500/10 scale-[0.99]" : "border-border/60 hover:border-purple-500/50 hover:bg-purple-500/5"}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
              <p className="font-medium text-foreground mb-1">Arraste seus documentos aqui</p>
              <p className="text-xs text-muted-foreground mb-4">PNG, JPG, JPEG ou PDF</p>
              
              <div className="flex justify-center gap-3">
                <Button size="sm" variant="outline" type="button">Selecionar Arquivo</Button>
                
                {/* Mobile Camera support */}
                <Button size="sm" className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white flex items-center gap-1.5" type="button" onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}>
                  <Camera className="w-4 h-4" />
                  Tirar Foto
                </Button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              />
              <input
                type="file"
                ref={cameraInputRef}
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl border border-border/80 bg-background/40 gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="p-3 bg-purple-500/10 rounded-xl">
                  <FileText className="w-6 h-6 text-purple-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm max-w-[200px] sm:max-w-[300px] truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <Button className="flex-1 sm:flex-none bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white" onClick={processarDocumento} disabled={isAnalyzing}>
                  {isAnalyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando...</> : "Analisar Documento"}
                </Button>
                <Button variant="outline" size="icon" onClick={clearFile} disabled={isAnalyzing}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          )}

          {/* FILE PREVIEW */}
          {previewUrl && !extracao && !isAnalyzing && (
            <div className="relative rounded-2xl overflow-hidden border border-border/50 max-h-[300px] w-full flex items-center justify-center bg-black/5">
              <img src={previewUrl} alt="Preview" className="max-h-[300px] object-contain rounded-2xl" />
            </div>
          )}

          {/* SKELETON LOADER DURING ANALYSIS */}
          {isAnalyzing && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="h-4 w-[150px]" />
              </div>
              <Skeleton className="h-[200px] w-full rounded-2xl" />
            </div>
          )}

          {/* RESULTS DISPLAY & EDITABLE FORMS */}
          {extracao && !isConfirmed && (
            <div className="space-y-6 pt-4 text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20 font-semibold px-3 py-1 text-xs uppercase">
                    {extracao.tipo_documento.replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">Confiança da extração: {extracao.confianca}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-500 font-medium text-sm">
                  <Check className="w-4 h-4" /> Pronto para revisão
                </div>
              </div>

              {extracao.tipo_documento === "nota_fiscal" ? (
                /* FORMS: NOTA FISCAL */
                <Card className="border border-border/50 bg-background/50">
                  <CardContent className="p-5 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="nf-fornecedor">Fornecedor</Label>
                        <Input id="nf-fornecedor" value={nfFornecedor} onChange={(e) => setNfFornecedor(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nf-total">Valor Total (R$)</Label>
                        <Input id="nf-total" type="number" step="0.01" value={nfValorTotal} onChange={(e) => setNfValorTotal(Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nf-data">Data de Emissão</Label>
                        <Input id="nf-data" type="date" value={nfData} onChange={(e) => setNfData(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nf-numero">Número NF</Label>
                        <Input id="nf-numero" value={nfNumero} onChange={(e) => setNfNumero(e.target.value)} />
                      </div>
                    </div>

                    <Separator className="bg-border/60" />

                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                        Itens da Nota Fiscal
                      </h4>
                      
                      <div className="border border-border/50 rounded-xl overflow-hidden bg-background/30">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                            <thead className="bg-background/80 text-muted-foreground text-xs uppercase font-semibold border-b border-border/50">
                              <tr>
                                <th className="px-4 py-3">Produto</th>
                                <th className="px-4 py-3 text-center">Quant.</th>
                                <th className="px-4 py-3 text-right">Valor Unit.</th>
                                <th className="px-4 py-3 text-right">Total</th>
                                <th className="px-4 py-3 text-center">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                              {nfItens.map((iData, idx) => (
                                <tr key={idx} className="hover:bg-background/20 transition-colors">
                                  <td className="px-4 py-3 font-medium text-foreground">{iData.item.nome}</td>
                                  <td className="px-4 py-3 text-center">{iData.item.quantidade}</td>
                                  <td className="px-4 py-3 text-right">R$ {iData.item.valor_unitario.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-right font-medium text-foreground">R$ {iData.item.valor_total.toFixed(2)}</td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center justify-center gap-4">
                                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                                        <Checkbox checked={iData.updateCusto} onCheckedChange={(val) => {
                                          const copy = [...nfItens];
                                          copy[idx].updateCusto = !!val;
                                          setNfItens(copy);
                                        }} />
                                        <span>Custo</span>
                                      </label>
                                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                                        <Checkbox checked={iData.addEstoque} onCheckedChange={(val) => {
                                          const copy = [...nfItens];
                                          copy[idx].addEstoque = !!val;
                                          setNfItens(copy);
                                        }} />
                                        <span>Estoque</span>
                                      </label>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-purple-500/5 rounded-xl border border-purple-500/10 gap-3">
                      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                        <Checkbox checked={nfLancarDespesa} onCheckedChange={(val) => setNfLancarDespesa(!!val)} />
                        <span>Lançar valor total como Despesa no fluxo de caixa</span>
                      </label>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setExtracao(null)}>Rejeitar</Button>
                        <Button size="sm" onClick={handleConfirmarNF} disabled={isSubmitting} className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white">
                          {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</> : "Confirmar e Lançar NF"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                /* FORMS: BOLETO / OUTROS */
                <Card className="border border-border/50 bg-background/50">
                  <CardContent className="p-5 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bol-beneficiario">Beneficiário / Favorecido</Label>
                        <Input id="bol-beneficiario" value={bolBeneficiario} onChange={(e) => setBolBeneficiario(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bol-valor">Valor do Boleto (R$)</Label>
                        <Input id="bol-valor" type="number" step="0.01" value={bolValor} onChange={(e) => setBolValor(Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bol-vencimento">Data de Vencimento</Label>
                        <Input id="bol-vencimento" type="date" value={bolVencimento} onChange={(e) => setBolVencimento(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bol-codigo">Linha Digitável ou Código de Barras</Label>
                        <Input id="bol-codigo" value={bolLinhaDigitavel || bolCodigoBarras} onChange={(e) => setBolLinhaDigitavel(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bol-categoria">Categoria da Dívida</Label>
                        <Select value={bolCategoria} onValueChange={setBolCategoria}>
                          <SelectTrigger id="bol-categoria">
                            <SelectValue placeholder="Selecione uma Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {categoriasDespesa.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {bolPix && (
                      <div className="space-y-2 bg-purple-500/5 p-3 rounded-lg border border-purple-500/10">
                        <Label className="text-xs text-purple-600 dark:text-purple-400 font-semibold">Copia e Cola Pix detectado</Label>
                        <p className="text-xs font-mono break-all text-muted-foreground select-all">{bolPix}</p>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setExtracao(null)}>Rejeitar</Button>
                      <Button onClick={handleConfirmarBoleto} disabled={isSubmitting} className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white">
                        {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cadastrando...</> : "Confirmar e Cadastrar Dívida"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* CONFIRMED STATE SCREEN */}
          {isConfirmed && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-500 border border-emerald-500/20">
                <Check className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Documento Processado com Sucesso!</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                  Os dados foram salvos no sistema e suas finanças e estoque foram atualizados.
                </p>
              </div>
              <Button onClick={clearFile} variant="outline" className="mt-2">
                Escanear Novo Documento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
