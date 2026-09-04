import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components/ui/tabs";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sparkles,
  UploadCloud,
  Loader2,
  Calendar as CalendarIcon,
  CheckCircle,
} from "lucide-react";
import { useDepositosInvestimento } from "../hooks/useDepositosInvestimento";
import { Investimento } from "../hooks/useInvestimentos";
import { supabase } from "@/integrations/supabase/client";

interface NovoDepositoIAModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investimentos: Investimento[];
  preSelectedInvestimentoId?: string;
  onSuccess: () => void;
}

export const NovoDepositoIAModal: React.FC<NovoDepositoIAModalProps> = ({
  open,
  onOpenChange,
  investimentos,
  preSelectedInvestimentoId,
  onSuccess,
}) => {
  const { createDeposito, uploadComprovante } = useDepositosInvestimento();
  const [investimentoId, setInvestimentoId] = useState(preSelectedInvestimentoId || "");
  const [loading, setLoading] = useState(false);

  // IA Texto State
  const [textoIA, setTextoIA] = useState("");

  // Comprovante File State
  const [file, setFile] = useState<File | null>(null);

  // Preview / Edit State
  const [previewMode, setPreviewMode] = useState(false);
  const [formData, setFormData] = useState({
    valor: "",
    quantidade: "1",
    precoUnitario: "",
    data: new Date().toISOString().split("T")[0],
    observacoes: "",
    comprovanteUrl: "",
  });

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!investimentoId || !formData.valor) return;

    setLoading(true);
    try {
      await createDeposito.mutateAsync({
        investimento_id: investimentoId,
        valor: Number(formData.valor),
        quantidade: Number(formData.quantidade || 1),
        preco_unitario: formData.precoUnitario ? Number(formData.precoUnitario) : undefined,
        data: formData.data,
        observacoes: formData.observacoes,
        comprovante_url: formData.comprovanteUrl || undefined,
      });
      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (_) {
      // Falha silenciosa no envio; UI permanece no estado atual
    } finally {
      setLoading(false);
    }
  };

  const handleAnaliseTexto = async () => {
    if (!textoIA) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ia-deposito", {
        body: { text: textoIA },
      });

      if (error) throw error;

      if (data) {
        // Encontrar investimento pelo nome sugerido se existir
        if (data.investimento_nome) {
          const matched = investimentos.find((inv) =>
            inv.nome.toLowerCase().includes(data.investimento_nome.toLowerCase())
          );
          if (matched) setInvestimentoId(matched.id);
        }

        setFormData((prev) => ({
          ...prev,
          valor: data.valor ? String(data.valor) : "",
          data: data.data || prev.data,
          observacoes: `Extraído via IA: "${textoIA}"`,
        }));
        setPreviewMode(true);
      }
    } catch (_) {
      // Falha na análise IA de texto tratada silenciosamente
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadAndAnalise = async () => {
    if (!file) return;
    setLoading(true);
    try {
      // 1. Upload to storage
      const fileUrl = await uploadComprovante(file);

      // 2. OCR IA analysis
      const { data, error } = await supabase.functions.invoke("ia-deposito", {
        body: { file_url: fileUrl },
      });

      if (error) throw error;

      if (data) {
        if (data.investimento_nome) {
          const matched = investimentos.find((inv) =>
            inv.nome.toLowerCase().includes(data.investimento_nome.toLowerCase())
          );
          if (matched) setInvestimentoId(matched.id);
        }

        setFormData((prev) => ({
          ...prev,
          valor: data.valor ? String(data.valor) : "",
          data: data.data || prev.data,
          comprovanteUrl: fileUrl,
          observacoes: `Comprovante processado por IA (${file.name})`,
        }));
        setPreviewMode(true);
      }
    } catch (_) {
      // Falha no upload e análise OCR tratada silenciosamente
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPreviewMode(false);
    setFile(null);
    setTextoIA("");
    setInvestimentoId(preSelectedInvestimentoId || "");
    setFormData({
      valor: "",
      quantidade: "1",
      precoUnitario: "",
      data: new Date().toISOString().split("T")[0],
      observacoes: "",
      comprovanteUrl: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) resetForm(); }}>
      <DialogContent className="sm:max-w-[480px] bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-foreground rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            Novo Aporte / Depósito
          </DialogTitle>
        </DialogHeader>

        {previewMode ? (
          // Revisão e Confirmação
          <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-2xl flex items-start gap-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-emerald-400">Sucesso na Extração</h4>
                <p className="text-xs text-slate-300">
                  Revise e ajuste as informações extraídas pela inteligência artificial antes de confirmar.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Selecione o Ativo</Label>
                <Select value={investimentoId} onValueChange={setInvestimentoId}>
                  <SelectTrigger className="bg-[#1C2541]/50 border-[#1E2942]">
                    <SelectValue placeholder="Selecione o ativo..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0B132B] border-[#1E2942]">
                    {investimentos.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id} className="text-foreground">
                        {inv.nome} ({inv.codigo_b3 || "Manual"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Valor total aportado</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={formData.valor}
                  onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Quantidade (se Ações/FII/Cripto)</Label>
                <Input
                  type="number"
                  step="0.000001"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={formData.quantidade}
                  onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Preço Unitário (opcional)</Label>
                <Input
                  type="number"
                  step="0.000001"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  placeholder="Se deixado em branco, calcula automatico"
                  value={formData.precoUnitario}
                  onChange={(e) => setFormData({ ...formData, precoUnitario: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Data do Aporte</Label>
                <Input
                  type="date"
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={formData.data}
                  onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                  required
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Observações</Label>
                <Input
                  className="bg-[#1C2541]/50 border-[#1E2942]"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-[#1E2942] hover:bg-slate-800"
                onClick={() => setPreviewMode(false)}
              >
                Voltar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                disabled={loading || !investimentoId}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Confirmar Aporte"}
              </Button>
            </div>
          </form>
        ) : (
          // Modo Abas de Entrada
          <Tabs defaultValue="ia-texto" className="w-full space-y-4">
            <TabsList className="bg-[#0B132B] border border-[#1E2942] p-1 rounded-xl w-full grid grid-cols-3">
              <TabsTrigger value="ia-texto" className="text-xs font-bold data-[state=active]:bg-emerald-600">
                Texto IA
              </TabsTrigger>
              <TabsTrigger value="comprovante" className="text-xs font-bold data-[state=active]:bg-emerald-600">
                Comprovante
              </TabsTrigger>
              <TabsTrigger value="manual" className="text-xs font-bold data-[state=active]:bg-emerald-600">
                Manual
              </TabsTrigger>
            </TabsList>

            {/* Texto IA */}
            <TabsContent value="ia-texto" className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-300">Descrição do Investimento</Label>
                <Textarea
                  placeholder='Ex: "Comprei 10 cotas de MXRF11 hoje a R$ 10,50 cada" ou "Fiz um aporte de R$ 200 no CDB Banco Inter"'
                  className="bg-[#1C2541]/50 border-[#1E2942] min-h-[100px] rounded-2xl resize-none focus-visible:ring-emerald-500/20"
                  value={textoIA}
                  onChange={(e) => setTextoIA(e.target.value)}
                />
              </div>

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold"
                onClick={handleAnaliseTexto}
                disabled={loading || !textoIA}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Analisando dados...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Analisar com IA
                  </>
                )}
              </Button>
            </TabsContent>

            {/* Comprovante File */}
            <TabsContent value="comprovante" className="space-y-4">
              <div className="border border-dashed border-[#1E2942] rounded-2xl p-6 flex flex-col items-center justify-center bg-[#1C2541]/20 hover:bg-[#1C2541]/35 cursor-pointer relative transition-all">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleFileChange}
                />
                <UploadCloud className="w-10 h-10 text-emerald-400 mb-2" />
                <span className="text-sm font-bold text-slate-200">
                  {file ? file.name : "Escolha ou arraste o comprovante"}
                </span>
                <span className="text-xs text-slate-400 mt-1">Suporta JPG, PNG ou PDF até 5MB</span>
              </div>

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold"
                onClick={handleUploadAndAnalise}
                disabled={loading || !file}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Realizando OCR e Leitura...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Enviar e Ler com IA
                  </>
                )}
              </Button>
            </TabsContent>

            {/* Manual Form */}
            <TabsContent value="manual" className="space-y-4">
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-300">Ativo Alvo</Label>
                  <Select value={investimentoId} onValueChange={setInvestimentoId}>
                    <SelectTrigger className="bg-[#1C2541]/50 border-[#1E2942]">
                      <SelectValue placeholder="Selecione o ativo..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0B132B] border-[#1E2942]">
                      {investimentos.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id} className="text-foreground">
                          {inv.nome} ({inv.codigo_b3 || "Manual"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-300">Valor Total</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="bg-[#1C2541]/50 border-[#1E2942]"
                      value={formData.valor}
                      onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-300">Quantidade</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      className="bg-[#1C2541]/50 border-[#1E2942]"
                      value={formData.quantidade}
                      onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-300">Preço Unitário</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      className="bg-[#1C2541]/50 border-[#1E2942]"
                      placeholder="Deixe em branco p/ auto-calcular"
                      value={formData.precoUnitario}
                      onChange={(e) => setFormData({ ...formData, precoUnitario: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-300">Data</Label>
                    <Input
                      type="date"
                      className="bg-[#1C2541]/50 border-[#1E2942]"
                      value={formData.data}
                      onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-300">Observações</Label>
                  <Input
                    className="bg-[#1C2541]/50 border-[#1E2942]"
                    placeholder="Notas ou detalhes do depósito"
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold mt-2"
                  disabled={loading || !investimentoId || !formData.valor}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Salvar Aporte"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
