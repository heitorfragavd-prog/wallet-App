import { useState, useEffect } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/shared/components/ui/alert-dialog";
import { Upload, Key, Brain, FileText, Settings, Check, AlertCircle, X, FileUp, Edit, Trash2 } from "lucide-react";
import { EditarResultadoIAModal } from "@/components/EditarResultadoIAModal";
import { useToast } from "@/shared/hooks/use-toast";
import { useIAConfiguracoes } from "@/hooks/useIAConfiguracoes";
import { useIAAnalysis, type AnalysisResult } from "@/hooks/useIAAnalysis";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { supabase } from "@/integrations/supabase/client";

interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'pdf';
  size: string;
}


const IA = () => {
  const { toast } = useToast();
  const { configuracao, isLoading: configLoading, salvarConfiguracao, isConfigured } = useIAConfiguracoes();
  const { results: analysisResults, atualizarStatus, atualizarCategoria, editarResultado, excluirResultado, salvarResultado } = useIAAnalysis();
  const { categoriasDespesa, categoriasReceita } = useCategorias();
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Atualizar campos quando configuração carrega
  useEffect(() => {
    if (configuracao) {
      setApiKey(configuracao.api_key);
      setSelectedModel(configuracao.modelo);
    }
  }, [configuracao]);

  const openaiModels = [
    { value: 'gpt-4o', label: 'GPT-4o (Recomendado para visão)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Mais rápido)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' }
  ];

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSaveConfig = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira uma chave API válida.",
        variant: "destructive",
      });
      return;
    }

    await salvarConfiguracao(apiKey, selectedModel);
  };

  const processFiles = (files: FileList) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    
    Array.from(files).forEach(file => {
      if (file.size > maxSize) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name} excede o limite de 10MB.`,
          variant: "destructive",
        });
        return;
      }

      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Tipo de arquivo não suportado",
          description: `${file.name} não é um tipo de arquivo suportado.`,
          variant: "destructive",
        });
        return;
      }

      const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const fileType = file.type.startsWith('image/') ? 'image' : 'pdf';
      
      const uploadedFile: UploadedFile = {
        id: fileId,
        file,
        type: fileType,
        size: formatFileSize(file.size)
      };

      // Create preview for images
      if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = (e) => {
          setUploadedFiles(prev => prev.map(f => 
            f.id === fileId ? { ...f, preview: e.target?.result as string } : f
          ));
        };
        reader.readAsDataURL(file);
      }

      setUploadedFiles(prev => [...prev, uploadedFile]);
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    processFiles(files);
    event.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get just the base64 data
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

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
- Para data, tente extrair a data da transação, não a data de emissão
- Seja preciso na classificação entre receita e despesa

Responda APENAS com o JSON, sem explicações adicionais.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${file.type};base64,${base64Image}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.1
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Remove markdown code blocks if present and parse JSON response
      const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();
      const analysisData = JSON.parse(cleanContent);
      
      const resultado: Omit<AnalysisResult, 'id'> = {
        file_name: file.name,
        tipo: analysisData.tipo,
        descricao: analysisData.descricao,
        valor: parseFloat(analysisData.valor),
        categoria: analysisData.categoria,
        data: analysisData.data,
        confianca: analysisData.confianca,
        status: 'pending'
      };
      
      await salvarResultado(resultado);
    } catch (error) {
      console.error('Erro na análise OpenAI:', error);
      throw error;
    }
  };

  const analyzeFiles = async () => {
    if (uploadedFiles.length === 0) {
      toast({
        title: "Nenhum arquivo",
        description: "Adicione arquivos antes de analisar.",
        variant: "destructive",
      });
      return;
    }

    if (!isConfigured) {
      toast({
        title: "Configuração necessária",
        description: "Configure sua chave API OpenAI primeiro.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const results = [];
      
      for (const uploadedFile of uploadedFiles) {
        if (uploadedFile.type === 'image') {
          try {
            await analyzeWithOpenAI(uploadedFile.file);
            results.push({} as Record<string, unknown>); // Placeholder para contagem
          } catch (error) {
            console.error('Erro na análise de arquivo:', error);
          }
        } else {
          // Para PDFs, mostrar mensagem que não é suportado ainda
          toast({
            title: "PDF não suportado",
            description: `${uploadedFile.file.name}: Análise de PDF será implementada em breve.`,
            variant: "destructive",
          });
        }
      }
      
      setUploadedFiles([]);
      
      toast({
        title: "Análise concluída",
        description: `${results.length} arquivo(s) analisado(s) com sucesso!`,
      });
    } catch (error) {
      console.error('Erro na análise:', error);
      toast({
        title: "Erro na análise",
        description: "Verifique sua chave API e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApproveResult = async (result: AnalysisResult) => {
    try {
      // Criar despesa ou receita baseado no tipo
      if (result.tipo === 'despesa') {
        const { error } = await supabase
          .from('despesas')
          .insert({
            descricao: result.descricao,
            valor: result.valor,
            data: result.data,
            categoria_id: result.categoria_id,
            user_id: (await supabase.auth.getUser()).data.user?.id
          });
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('receitas')
          .insert({
            descricao: result.descricao,
            valor: result.valor,
            data: result.data,
            categoria_id: result.categoria_id,
            user_id: (await supabase.auth.getUser()).data.user?.id
          });
        
        if (error) throw error;
      }
      
      // Atualizar status para aprovado
      await atualizarStatus(result.id, 'approved');
      
      toast({
        title: "Sucesso",
        description: `${result.tipo === 'despesa' ? 'Despesa' : 'Receita'} criada com sucesso!`,
      });
    } catch (error) {
      console.error('Erro ao criar transação:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar transação. Verifique se uma categoria foi selecionada.",
        variant: "destructive",
      });
    }
  };

  const handleRejectResult = (id: string) => {
    atualizarStatus(id, 'rejected');
  };

  const handleCategoryChange = (resultId: string, categoryId: string) => {
    atualizarCategoria(resultId, categoryId);
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
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
              <p className="text-muted-foreground">Analise automaticamente seus comprovantes e cupons fiscais</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid grid-cols-3 bg-muted/50">
            <TabsTrigger value="upload" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              <FileUp className="w-4 h-4 mr-2" />
              Upload & Análise
            </TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
              <FileText className="w-4 h-4 mr-2" />
              Histórico
            </TabsTrigger>
          </TabsList>

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
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="mt-2 bg-background/50 border-border/50"
                      disabled={configLoading}
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Sua chave API será armazenada com segurança no banco de dados
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="model-select" className="text-muted-foreground">Modelo OpenAI</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger className="mt-2 bg-background/50 border-border/50">
                        <SelectValue placeholder="Selecione um modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {openaiModels.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    onClick={handleSaveConfig} 
                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white" 
                    disabled={configLoading}
                  >
                    {isConfigured ? 'Atualizar Configuração' : 'Salvar Configuração'}
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
                      <p className="text-yellow-600 dark:text-yellow-400">
                        Configure sua chave API OpenAI na aba Configurações antes de fazer upload.
                      </p>
                    </div>
                  </div>
                )}

                <div 
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                    dragOver 
                      ? 'border-purple-400 bg-purple-500/10 scale-[1.02]' 
                      : 'border-border/50 hover:border-purple-400/50 bg-background/50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                    disabled={isAnalyzing}
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="p-4 rounded-full bg-purple-500/10 w-fit mx-auto mb-4">
                      <Upload className="w-8 h-8 text-purple-500" />
                    </div>
                    <p className="text-lg font-medium text-foreground mb-2">
                      Clique ou arraste arquivos aqui
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Aceita imagens (PNG, JPG, GIF) e arquivos PDF até 10MB
                    </p>
                  </label>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-4">Arquivos Carregados ({uploadedFiles.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className="border border-border/50 rounded-xl p-4 relative bg-background/50 hover:border-purple-500/30 transition-colors">
                          <button
                            onClick={() => removeFile(file.id)}
                            className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          
                          {file.type === 'image' && file.preview ? (
                            <img 
                              src={file.preview} 
                              alt={file.file.name}
                              className="w-full h-32 object-cover rounded-lg mb-2"
                            />
                          ) : (
                            <div className="w-full h-32 bg-muted/50 rounded-lg mb-2 flex items-center justify-center">
                              <FileText className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          
                          <p className="text-sm font-medium truncate" title={file.file.name}>
                            {file.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{file.size}</p>
                        </div>
                      ))}
                    </div>
                    
                    <Button 
                      onClick={analyzeFiles}
                      disabled={isAnalyzing || !isConfigured}
                      className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white"
                    >
                      <Brain className="w-4 h-4 mr-2" />
                      {isAnalyzing ? 'Analisando com OpenAI...' : `Analisar ${uploadedFiles.length} arquivo(s) com IA`}
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
                            <div className={`p-2 rounded-lg ${result.tipo === 'receita' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                              <FileText className={`w-4 h-4 ${result.tipo === 'receita' ? 'text-green-500' : 'text-red-500'}`} />
                            </div>
                            <span className="font-medium text-foreground">{result.file_name}</span>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              result.tipo === 'receita' 
                                ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
                                : 'bg-red-500/20 text-red-600 dark:text-red-400'
                            }`}>
                              {result.tipo}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            Confiança: {result.confianca}%
                          </span>
                        </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                        <div>
                          <span className="text-muted-foreground">Descrição:</span>
                          <p className="font-medium">{result.descricao}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Valor:</span>
                          <p className="font-medium">R$ {result.valor.toFixed(2)}</p>
                        </div>
                         <div>
                           <span className="text-muted-foreground">Categoria:</span>
                           {result.status === 'pending' ? (
                             <Select 
                               value={result.categoria_id || ''} 
                               onValueChange={(value) => handleCategoryChange(result.id, value)}
                             >
                               <SelectTrigger className="mt-1">
                                 <SelectValue placeholder="Selecione uma categoria" />
                               </SelectTrigger>
                               <SelectContent>
                                 {(result.tipo === 'despesa' ? categoriasDespesa : categoriasReceita).map((categoria) => (
                                   <SelectItem key={categoria.id} value={categoria.id}>
                                     {categoria.nome}
                                   </SelectItem>
                                 ))}
                               </SelectContent>
                             </Select>
                           ) : (
                             <p className="font-medium">{result.categoria}</p>
                           )}
                         </div>
                        <div>
                          <span className="text-muted-foreground">Data:</span>
                          <p className="font-medium">{new Date(result.data).toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>

                        <div className="flex items-center justify-between">
                          {result.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={() => handleApproveResult(result)}
                                className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Aprovar
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleRejectResult(result.id)}
                                className="hover:bg-red-500/10 hover:text-red-500"
                              >
                                <X className="w-4 h-4 mr-1" />
                                Rejeitar
                              </Button>
                            </div>
                          )}
                          
                          {result.status === 'approved' && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                              <Check className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-green-600 dark:text-green-400">Aprovado e adicionado</span>
                            </div>
                          )}

                          {result.status === 'rejected' && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                              <AlertCircle className="w-4 h-4 text-red-500" />
                              <span className="text-sm font-medium text-red-600 dark:text-red-400">Rejeitado</span>
                            </div>
                          )}
                          
                          <div className="flex gap-2">
                            <EditarResultadoIAModal 
                              resultado={result}
                              onSave={editarResultado}
                            />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline" className="hover:bg-red-500/10 hover:text-red-500">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir resultado?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. O resultado da análise será excluído permanentemente.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => excluirResultado(result.id)}>
                                    Excluir
                                  </AlertDialogAction>
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
                          <div className={`p-2 rounded-lg ${
                            result.status === 'approved' ? 'bg-green-500/10' :
                            result.status === 'rejected' ? 'bg-red-500/10' :
                            'bg-yellow-500/10'
                          }`}>
                            <FileText className={`w-4 h-4 ${
                              result.status === 'approved' ? 'text-green-500' :
                              result.status === 'rejected' ? 'text-red-500' :
                              'text-yellow-500'
                            }`} />
                          </div>
                          <span className="text-sm font-medium">{result.file_name}</span>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            result.status === 'approved' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                            result.status === 'rejected' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                            'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                          }`}>
                            {result.status === 'approved' ? 'Aprovado' : 
                             result.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          R$ {result.valor.toFixed(2)}
                        </span>
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
