import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/shared/components/ui/alert-dialog";
import { Upload, Key, Brain, FileText, Settings, Check, AlertCircle, X, FileUp, Trash2, MessageSquare, Send, ChevronDown, ChevronUp, Paperclip, Loader2 } from "lucide-react";
import { EditarResultadoIAModal } from "@/components/EditarResultadoIAModal";
import { ConversasSidebar } from "@/components/ia/ConversasSidebar";
import { useToast } from "@/shared/hooks/use-toast";
import { useIAConfiguracoes } from "@/hooks/useIAConfiguracoes";
import { useIAAnalysis, type AnalysisResult } from "@/hooks/useIAAnalysis";
import { useChatFinanceiro } from "@/hooks/useChatFinanceiro";
import { useConversas } from "@/domains/ia/hooks/useConversas";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";

interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  type: "image" | "pdf";
  size: string;
}

const CHAT_SUGGESTIONS = [
  "Quanto gastei este mês?",
  "Quais são minhas maiores despesas?",
  "Como estão minhas metas financeiras?",
  "Tenho alguma dívida vencendo em breve?",
];

const IA = () => {
  const { toast } = useToast();
  const { configuracao, isLoading: configLoading, salvarConfiguracao, isConfigured } = useIAConfiguracoes();
  const { results: analysisResults, atualizarStatus, atualizarCategoria, editarResultado, excluirResultado, salvarResultado } = useIAAnalysis();

  // Conversas
  const { conversas, isLoading: conversasLoading, criarConversa, renomearConversa, deletarConversa, atualizarUltimaMensagem } = useConversas();
  const [conversaAtiva, setConversaAtiva] = useState<string | null>(null);

  const { messages, isLoading: chatLoading, isLoadingHistory, systemPrompt, setSystemPrompt, sendMessage, clearChat } = useChatFinanceiro(conversaAtiva);

  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; base64: string; mimeType: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputChatRef = useRef<HTMLInputElement>(null);

  // Selecionar primeira conversa ou criar uma ao carregar
  useEffect(() => {
    if (conversasLoading) return;
    if (conversaAtiva) return;
    if (conversas.length > 0) {
      setConversaAtiva(conversas[0].id);
    }
    // Não cria automaticamente — deixa o usuário escolher
  }, [conversas, conversasLoading, conversaAtiva]);

  // Sincroniza campos de config
  useEffect(() => {
    if (configuracao) {
      setApiKey(configuracao.api_key);
      setSelectedModel(configuracao.modelo);
    }
  }, [configuracao]);

  // Auto-scroll ao fim do chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  // ─── Conversas ──────────────────────────────────────────────────────────────

  const handleNovaConversa = async () => {
    try {
      const nova = await criarConversa.mutateAsync("Nova Conversa");
      setConversaAtiva(nova.id);
      clearChat();
    } catch (err) {
      logger.error("IA", "Erro ao criar conversa", {
        error: err instanceof Error ? err.message : JSON.stringify(err),
      });
      toast({ title: "Erro ao criar conversa", variant: "destructive" });
    }
  };

  const handleSelectConversa = (id: string) => {
    if (id === conversaAtiva) return;
    setConversaAtiva(id);
  };

  const handleRenomear = (id: string, titulo: string) => {
    renomearConversa.mutate({ id, titulo });
  };

  const handleDeletarConversa = async (id: string) => {
    await deletarConversa.mutateAsync(id);
    if (conversaAtiva === id) {
      const restantes = conversas.filter((c) => c.id !== id);
      setConversaAtiva(restantes.length > 0 ? restantes[0].id : null);
    }
  };

  // Auto-renomear conversa pela 1ª mensagem do usuário
  const handleMessageSent = async (cId: string) => {
    await atualizarUltimaMensagem(cId);
    const conversa = conversas.find((c) => c.id === cId);
    if (conversa?.titulo === "Nova Conversa" && messages.length === 0 && chatInput.trim()) {
      const titulo = chatInput.trim().slice(0, 50);
      renomearConversa.mutate({ id: cId, titulo });
    }
  };

  // ─── Chat ────────────────────────────────────────────────────────────────────

  const handleSendChat = async () => {
    if ((!chatInput.trim() && !attachedImage) || chatLoading) return;
    if (!isConfigured) {
      toast({ title: "Configuração necessária", description: "Configure sua chave API OpenAI na aba Configurações.", variant: "destructive" });
      return;
    }
    if (!conversaAtiva) {
      // Cria conversa automaticamente se não existir
      let novaId: string;
      try {
        const nova = await criarConversa.mutateAsync(chatInput.trim().slice(0, 50) || "Nova Conversa");
        novaId = nova.id;
        setConversaAtiva(novaId);
      } catch (err) {
        logger.error("IA", "Erro ao criar conversa automaticamente", {
          error: err instanceof Error ? err.message : JSON.stringify(err),
        });
        toast({ title: "Erro ao criar conversa", variant: "destructive" });
        return;
      }
      const text = chatInput;
      const img = attachedImage;
      setChatInput("");
      setAttachedImage(null);
      // Passa novaId diretamente para evitar closure stale (conversaAtiva ainda é null neste render)
      await sendMessage(text, selectedModel, img?.base64, img?.mimeType, img?.dataUrl, handleMessageSent, novaId);
      return;
    }
    const text = chatInput;
    const img = attachedImage;
    setChatInput("");
    setAttachedImage(null);
    await sendMessage(text, selectedModel, img?.base64, img?.mimeType, img?.dataUrl, handleMessageSent);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const handleImageAttach = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Formato inválido", description: "Envie apenas imagens (PNG, JPG, etc.).", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setAttachedImage({ dataUrl, base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  // ─── Upload / Análise ────────────────────────────────────────────────────────

  const openaiModels = [
    { value: "gpt-4o", label: "GPT-4o (Recomendado para visão)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Mais rápido)" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-4", label: "GPT-4" },
  ];

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleSaveConfig = async () => {
    if (!apiKey.trim()) {
      toast({ title: "Erro", description: "Por favor, insira uma chave API válida.", variant: "destructive" });
      return;
    }
    await salvarConfiguracao(apiKey, selectedModel);
  };

  const processFiles = (files: FileList) => {
    const maxSize = 10 * 1024 * 1024;
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "application/pdf"];
    Array.from(files).forEach((file) => {
      if (file.size > maxSize) {
        toast({ title: "Arquivo muito grande", description: `${file.name} excede o limite de 10MB.`, variant: "destructive" });
        return;
      }
      if (!allowedTypes.includes(file.type)) {
        toast({ title: "Tipo de arquivo não suportado", description: `${file.name} não é um tipo suportado.`, variant: "destructive" });
        return;
      }
      const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const fileType = file.type.startsWith("image/") ? "image" : "pdf";
      const uploadedFile: UploadedFile = { id: fileId, file, type: fileType, size: formatFileSize(file.size) };
      if (fileType === "image") {
        const reader = new FileReader();
        reader.onload = (e) => {
          setUploadedFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, preview: e.target?.result as string } : f));
        };
        reader.readAsDataURL(file);
      }
      setUploadedFiles((prev) => [...prev, uploadedFile]);
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    processFiles(files);
    event.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };
  const removeFile = (fileId: string) => setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));

  const convertFileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const analyzeWithOpenAI = async (file: File): Promise<void> => {
    try {
      const base64Image = await convertFileToBase64(file);
      const prompt = `Analise este comprovante financeiro e extraia as seguintes informações em formato JSON:

{
  "tipo": "receita" ou "despesa",
  "descricao": "descrição clara da transação",
  "valor": número (apenas o valor numérico, sem símbolos),
  "categoria": "categoria apropriada (ex: Alimentação, Transporte, Saúde, Salário, etc.)",
  "data": "data no formato YYYY-MM-DD",
  "confianca": número de 0 a 100 indicando a confiança na análise
}

Regras importantes:
- Se for uma nota fiscal de compra/pagamento = "despesa"
- Se for um comprovante de pagamento recebido/depósito = "receita"
- Para o valor, extraia apenas números (ex: se vê "R$ 150,50", retorne 150.5)
- Para categoria, use termos como: Alimentação, Transporte, Saúde, Educação, Lazer, Moradia, Salário, Freelance, Vendas
- Para data, tente extrair a data da transação
- Seja preciso na classificação entre receita e despesa

Responda APENAS com o JSON, sem explicações adicionais.`;

      const { data, error } = await supabase.functions.invoke("openai-proxy", {
        body: {
          model: selectedModel,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${file.type};base64,${base64Image}`, detail: "high" } },
            ],
          }],
          max_tokens: 500,
          temperature: 0.1,
        },
      });

      if (error) throw new Error(error.message);
      const content = data?.choices?.[0]?.message?.content as string;
      const cleanContent = content.replace(/```json\s*|\s*```/g, "").trim();
      const analysisData = JSON.parse(cleanContent);

      const resultado: Omit<AnalysisResult, "id"> = {
        file_name: file.name,
        tipo: analysisData.tipo,
        descricao: analysisData.descricao,
        valor: parseFloat(analysisData.valor),
        categoria: analysisData.categoria,
        data: analysisData.data,
        confianca: analysisData.confianca,
        status: "pending",
      };
      await salvarResultado(resultado);
    } catch (error) {
      logger.error("IA", "Erro na análise OpenAI", { fileName: file.name, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  const analyzeFiles = async () => {
    if (uploadedFiles.length === 0) {
      toast({ title: "Nenhum arquivo", description: "Adicione arquivos antes de analisar.", variant: "destructive" });
      return;
    }
    if (!isConfigured) {
      toast({ title: "Configuração necessária", description: "Configure sua chave API OpenAI primeiro.", variant: "destructive" });
      return;
    }
    setIsAnalyzing(true);
    try {
      let count = 0;
      for (const uploadedFile of uploadedFiles) {
        if (uploadedFile.type === "image") {
          try {
            await analyzeWithOpenAI(uploadedFile.file);
            count++;
          } catch (error) {
            logger.error("IA", "Erro na análise de arquivo", { error: error instanceof Error ? error.message : String(error) });
          }
        } else {
          toast({ title: "PDF não suportado", description: `${uploadedFile.file.name}: Análise de PDF será implementada em breve.`, variant: "destructive" });
        }
      }
      setUploadedFiles([]);
      toast({ title: "Análise concluída", description: `${count} arquivo(s) analisado(s) com sucesso!` });
    } catch (error) {
      logger.error("IA", "Erro na análise de arquivos", { error: error instanceof Error ? error.message : String(error) });
      toast({ title: "Erro na análise", description: "Verifique sua chave API e tente novamente.", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApproveResult = async (result: AnalysisResult) => {
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (result.tipo === "despesa") {
        const { error } = await supabase.from("despesas").insert({
          descricao: result.descricao, valor: result.valor, data: result.data,
          categoria_id: result.categoria_id, user_id: userId,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("receitas").insert({
          descricao: result.descricao, valor: result.valor, data: result.data,
          categoria_id: result.categoria_id, user_id: userId,
        });
        if (error) throw error;
      }
      await atualizarStatus(result.id, "approved");
      toast({ title: "Sucesso", description: `${result.tipo === "despesa" ? "Despesa" : "Receita"} criada com sucesso!` });
    } catch (error) {
      logger.error("IA", "Erro ao criar transação", { resultId: result.id, error: error instanceof Error ? error.message : String(error) });
      toast({ title: "Erro", description: "Erro ao criar transação. Verifique se uma categoria foi selecionada.", variant: "destructive" });
    }
  };

  const handleRejectResult = (id: string) => atualizarStatus(id, "rejected");
  const handleCategoryChange = (resultId: string, categoryId: string) => atualizarCategoria(resultId, categoryId);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-3 shadow-lg shadow-purple-500/20">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Inteligência Artificial</h1>
              <p className="text-muted-foreground">Analise comprovantes e converse com seus dados financeiros</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="chat" className="space-y-4">
          <TabsList className="grid grid-cols-4 bg-muted/50">
            <TabsTrigger value="chat" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              <MessageSquare className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Chat</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              <FileUp className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Upload</span>
            </TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              <Settings className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Config</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              <FileText className="w-4 h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Histórico</span>
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════ CHAT TAB ═══════════════════ */}
          <TabsContent value="chat" className="mt-0">
            <Card className="border-0 bg-card/50 overflow-hidden">
              <div className="flex h-[calc(100vh-280px)] min-h-[500px]">
                {/* Sidebar de conversas */}
                <ConversasSidebar
                  conversas={conversas}
                  conversaAtiva={conversaAtiva}
                  isLoading={conversasLoading}
                  onSelectConversa={handleSelectConversa}
                  onNovaConversa={handleNovaConversa}
                  onRenomear={handleRenomear}
                  onDeletar={handleDeletarConversa}
                />

                {/* Área principal do chat */}
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Sub-header do chat */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-gradient-to-r from-purple-500/5 to-transparent min-h-[52px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded-lg bg-purple-500/15">
                        <Brain className="w-4 h-4 text-purple-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {conversas.find((c) => c.id === conversaAtiva)?.titulo ?? "Assistente Financeiro"}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-[10px] text-muted-foreground">
                            Ferramentas financeiras ativas
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSystemPromptEditor((v) => !v)}
                      className="text-muted-foreground hover:text-foreground gap-1 shrink-0"
                    >
                      {showSystemPromptEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      <span className="text-xs hidden sm:inline">Prompt</span>
                    </Button>
                  </div>

                  {/* Editor de system prompt */}
                  {showSystemPromptEditor && (
                    <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
                      <Label className="text-xs text-muted-foreground mb-1.5 block">
                        Instrução do agente — aplicada nas próximas mensagens
                      </Label>
                      <Textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={4}
                        className="text-xs bg-background/50 border-border/50 font-mono resize-none"
                        placeholder="Instrução de sistema para o agente..."
                      />
                    </div>
                  )}

                  {/* Mensagens */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {!conversaAtiva ? (
                      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                        <div className="p-4 rounded-full bg-purple-500/10">
                          <MessageSquare className="w-8 h-8 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Nenhuma conversa selecionada</p>
                          <p className="text-sm text-muted-foreground mt-1">Crie uma nova conversa para começar.</p>
                        </div>
                        <Button
                          onClick={handleNovaConversa}
                          className="bg-purple-500 hover:bg-purple-600 text-white"
                          disabled={criarConversa.isPending}
                        >
                          {criarConversa.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Nova Conversa
                        </Button>
                      </div>
                    ) : isLoadingHistory ? (
                      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Carregando histórico...</span>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                        <div className="p-4 rounded-full bg-purple-500/10">
                          <MessageSquare className="w-8 h-8 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Converse com seus dados financeiros</p>
                          <p className="text-sm text-muted-foreground mt-1">Faça perguntas ou envie um comprovante para cadastro automático.</p>
                        </div>
                        {!isConfigured && (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 max-w-sm">
                            <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0" />
                            <span className="text-xs text-yellow-600 dark:text-yellow-400">Configure sua chave API OpenAI na aba Config para começar.</span>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 justify-center max-w-md">
                          {CHAT_SUGGESTIONS.map((s) => (
                            <button
                              key={s}
                              onClick={() => setChatInput(s)}
                              className="px-3 py-1.5 text-xs rounded-full border border-purple-500/30 bg-purple-500/5 text-purple-600 dark:text-purple-400 hover:bg-purple-500/15 transition-colors"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {messages.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                              msg.role === "user"
                                ? "bg-purple-500 text-white rounded-br-sm"
                                : "bg-muted text-foreground rounded-bl-sm"
                            }`}>
                              {msg.imageDataUrl && (
                                <img src={msg.imageDataUrl} alt="Comprovante enviado" className="w-full max-w-[200px] rounded-lg mb-2 object-cover border border-white/20" />
                              )}
                              {msg.content}
                              <div className={`text-[10px] mt-1 ${msg.role === "user" ? "text-purple-200" : "text-muted-foreground"}`}>
                                {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="flex justify-start">
                            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                              <div className="flex gap-1 items-center">
                                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>

                  {/* Imagem anexada */}
                  {attachedImage && (
                    <div className="px-4 pt-3 flex items-center gap-2 border-t border-border/30">
                      <div className="relative inline-block shrink-0">
                        <img src={attachedImage.dataUrl} alt="Anexo" className="h-14 w-14 object-cover rounded-lg border border-border/50" />
                        <button onClick={() => setAttachedImage(null)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground">Imagem pronta — adicione uma mensagem opcional</span>
                    </div>
                  )}

                  {/* Input */}
                  <div className="border-t border-border/50 p-3">
                    <div className="flex gap-2 items-end">
                      <button
                        onClick={() => fileInputChatRef.current?.click()}
                        disabled={chatLoading || !isConfigured || !conversaAtiva}
                        className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-purple-500 hover:bg-purple-500/10 transition-colors disabled:opacity-40"
                        title="Anexar comprovante (imagem)"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                      <input ref={fileInputChatRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageAttach(f); e.target.value = ""; }} />

                      <Textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={handleChatKeyDown}
                        placeholder={!conversaAtiva ? "Crie ou selecione uma conversa..." : attachedImage ? "Mensagem opcional..." : "Pergunte sobre suas finanças..."}
                        rows={2}
                        disabled={chatLoading || !isConfigured}
                        className="flex-1 bg-background/50 border-border/50 resize-none text-sm"
                      />

                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button
                          onClick={handleSendChat}
                          disabled={chatLoading || (!chatInput.trim() && !attachedImage) || !isConfigured}
                          size="sm"
                          className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white h-9 w-9 p-0"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                        {messages.length > 0 && (
                          <Button onClick={clearChat} variant="ghost" size="sm" className="text-muted-foreground hover:text-red-500 h-9 w-9 p-0" title="Limpar exibição">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Clipe para imagens · Enter para enviar · Shift+Enter para nova linha
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ═══════════════════ CONFIG TAB ═══════════════════ */}
          <TabsContent value="config" className="space-y-6">
            <Card className="border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-500/20">
                    <Settings className="w-5 h-5 text-blue-500" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Configurações OpenAI</h2>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="api-key" className="flex items-center gap-2 text-muted-foreground">
                      <Key className="w-4 h-4" />
                      <span>Chave API OpenAI</span>
                    </Label>
                    <Input id="api-key" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-2 bg-background/50 border-border/50" disabled={configLoading} />
                    <p className="text-sm text-muted-foreground mt-1">Sua chave API é armazenada com segurança e nunca exposta no navegador</p>
                  </div>
                  <div>
                    <Label htmlFor="model-select" className="text-muted-foreground">Modelo OpenAI</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger className="mt-2 bg-background/50 border-border/50">
                        <SelectValue placeholder="Selecione um modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {openaiModels.map((model) => (
                          <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleSaveConfig} className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white" disabled={configLoading}>
                    {isConfigured ? "Atualizar Configuração" : "Salvar Configuração"}
                  </Button>
                  {isConfigured && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-600 dark:text-green-400">API configurada e pronta para uso</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════════ UPLOAD TAB ═══════════════════ */}
          <TabsContent value="upload" className="space-y-6">
            <Card className="border-0 bg-gradient-to-br from-purple-500/10 to-violet-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-purple-500/20">
                    <FileUp className="w-5 h-5 text-purple-500" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Upload de Comprovantes</h2>
                </div>
              </CardHeader>
              <CardContent>
                {!isConfigured && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-yellow-600" />
                      <p className="text-yellow-600 dark:text-yellow-400">Configure sua chave API OpenAI na aba Config antes de fazer upload.</p>
                    </div>
                  </div>
                )}
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${dragOver ? "border-purple-400 bg-purple-500/10 scale-[1.02]" : "border-border/50 hover:border-purple-400/50 bg-background/50"}`}
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                >
                  <input type="file" multiple accept="image/*,.pdf" onChange={handleFileUpload} className="hidden" id="file-upload" disabled={isAnalyzing} />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="p-4 rounded-full bg-purple-500/10 w-fit mx-auto mb-4">
                      <Upload className="w-8 h-8 text-purple-500" />
                    </div>
                    <p className="text-lg font-medium text-foreground mb-2">Clique ou arraste arquivos aqui</p>
                    <p className="text-sm text-muted-foreground">Aceita imagens (PNG, JPG, GIF) e arquivos PDF até 10MB</p>
                  </label>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-4">Arquivos Carregados ({uploadedFiles.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className="border border-border/50 rounded-xl p-4 relative bg-background/50 hover:border-purple-500/30 transition-colors">
                          <button onClick={() => removeFile(file.id)} className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20">
                            <X className="w-4 h-4" />
                          </button>
                          {file.type === "image" && file.preview ? (
                            <img src={file.preview} alt={file.file.name} className="w-full h-32 object-cover rounded-lg mb-2" />
                          ) : (
                            <div className="w-full h-32 bg-muted/50 rounded-lg mb-2 flex items-center justify-center">
                              <FileText className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          <p className="text-sm font-medium truncate" title={file.file.name}>{file.file.name}</p>
                          <p className="text-xs text-muted-foreground">{file.size}</p>
                        </div>
                      ))}
                    </div>
                    <Button onClick={analyzeFiles} disabled={isAnalyzing || !isConfigured} className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white">
                      <Brain className="w-4 h-4 mr-2" />
                      {isAnalyzing ? "Analisando com OpenAI..." : `Analisar ${uploadedFiles.length} arquivo(s) com IA`}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {analysisResults.length > 0 && (
              <Card className="border-0 bg-gradient-to-br from-emerald-500/10 to-green-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-emerald-500/20">
                      <Brain className="w-5 h-5 text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">Resultados da Análise OpenAI</h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analysisResults.map((result) => (
                      <div key={result.id} className="border border-border/50 rounded-xl p-4 bg-background/50 hover:border-emerald-500/30 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${result.tipo === "receita" ? "bg-green-500/10" : "bg-red-500/10"}`}>
                              <FileText className={`w-4 h-4 ${result.tipo === "receita" ? "text-green-500" : "text-red-500"}`} />
                            </div>
                            <span className="font-medium text-foreground">{result.file_name}</span>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${result.tipo === "receita" ? "bg-green-500/20 text-green-600 dark:text-green-400" : "bg-red-500/20 text-red-600 dark:text-red-400"}`}>
                              {result.tipo}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">Confiança: {result.confianca}%</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                          <div><span className="text-muted-foreground">Descrição:</span><p className="font-medium">{result.descricao}</p></div>
                          <div><span className="text-muted-foreground">Valor:</span><p className="font-medium">R$ {result.valor.toFixed(2)}</p></div>
                          <div>
                            <span className="text-muted-foreground">Categoria:</span>
                            {result.status === "pending" ? (
                              <Select value={result.categoria_id || ""} onValueChange={(value) => handleCategoryChange(result.id, value)}>
                                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {(result.tipo === "despesa" ? categoriasDespesa : categoriasReceita).map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : <p className="font-medium">{result.categoria}</p>}
                          </div>
                          <div><span className="text-muted-foreground">Data:</span><p className="font-medium">{new Date(result.data).toLocaleDateString("pt-BR")}</p></div>
                        </div>
                        <div className="flex items-center justify-between">
                          {result.status === "pending" && (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleApproveResult(result)} className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white">
                                <Check className="w-4 h-4 mr-1" />Aprovar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleRejectResult(result.id)} className="hover:bg-red-500/10 hover:text-red-500">
                                <X className="w-4 h-4 mr-1" />Rejeitar
                              </Button>
                            </div>
                          )}
                          {result.status === "approved" && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                              <Check className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-green-600 dark:text-green-400">Aprovado e adicionado</span>
                            </div>
                          )}
                          {result.status === "rejected" && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                              <AlertCircle className="w-4 h-4 text-red-500" />
                              <span className="text-sm font-medium text-red-600 dark:text-red-400">Rejeitado</span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <EditarResultadoIAModal resultado={result} onSave={editarResultado} />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline" className="hover:bg-red-500/10 hover:text-red-500"><Trash2 className="w-4 h-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir resultado?</AlertDialogTitle>
                                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => excluirResultado(result.id)}>Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══════════════════ HISTORY TAB ═══════════════════ */}
          <TabsContent value="history" className="space-y-6">
            <Card className="border-0 bg-gradient-to-br from-slate-500/10 to-slate-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-slate-500/20">
                    <FileText className="w-5 h-5 text-slate-500" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Histórico de Análises</h2>
                </div>
              </CardHeader>
              <CardContent>
                {analysisResults.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="p-4 rounded-full bg-slate-500/10 w-fit mx-auto mb-4">
                      <FileText className="w-8 h-8 text-slate-500" />
                    </div>
                    <p className="text-muted-foreground">Nenhuma análise realizada ainda</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {analysisResults.map((result) => (
                      <div key={result.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50 hover:border-slate-500/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${result.status === "approved" ? "bg-green-500/10" : result.status === "rejected" ? "bg-red-500/10" : "bg-yellow-500/10"}`}>
                            <FileText className={`w-4 h-4 ${result.status === "approved" ? "text-green-500" : result.status === "rejected" ? "text-red-500" : "text-yellow-500"}`} />
                          </div>
                          <span className="text-sm font-medium">{result.file_name}</span>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${result.status === "approved" ? "bg-green-500/20 text-green-600 dark:text-green-400" : result.status === "rejected" ? "bg-red-500/20 text-red-600 dark:text-red-400" : "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"}`}>
                            {result.status === "approved" ? "Aprovado" : result.status === "rejected" ? "Rejeitado" : "Pendente"}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-foreground">R$ {result.valor.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default IA;
