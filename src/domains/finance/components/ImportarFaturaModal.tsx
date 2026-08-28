import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useImportarFatura, extrairDatasDaFatura } from "@/domains/finance/hooks/useImportarFatura";
import { formatCurrency } from "@/lib/utils";
import { errorService } from "@/core/errors/ErrorService";
import { CreditCard, FileText, ArrowLeft, Download, Sparkles, Upload, Loader2 } from "lucide-react";

interface ImportarFaturaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportarFaturaModal: React.FC<ImportarFaturaModalProps> = ({ isOpen, onClose }) => {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [contaId, setContaId] = useState<string>("");
  const [mesReferencia, setMesReferencia] = useState<string>(defaultMonth);
  const [vencimento, setVencimento] = useState<string>("");
  const [textoFatura, setTextoFatura] = useState<string>("");
  const [step, setStep] = useState<"config" | "revisao">("config");
  const [isImporting, setIsImporting] = useState(false);
  const [showDebugText, setShowDebugText] = useState(false);

  const {
    transacoes,
    valorTotalFatura,
    bancoDetectado,
    isAnalisando,
    isExtraindoPDF,
    cartoes,
    categorias,
    analisar,
    importar,
    extrairPDF,
    toggleSelecao,
    setCategoria,
    selecionarTodas,
    desselecionarDuplicadas,
    limpar,
  } = useImportarFatura();

  const handleClose = () => {
    limpar();
    setStep("config");
    setTextoFatura("");
    onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const texto = await extrairPDF(file);
      setTextoFatura(texto);
      const { vencimento: vencExtraido } = extrairDatasDaFatura(texto);
      if (vencExtraido) {
        setVencimento(vencExtraido);
      }
    } catch (err) {
      errorService.handle(err, {
        source: "importador-fatura",
        operation: "extrairPDF",
      });
    }
  };

  const handleAnalisar = async () => {
    if (!contaId || !mesReferencia || !textoFatura.trim()) return;
    await analisar(textoFatura, contaId, mesReferencia, vencimento);
    setStep("revisao");
  };

  const handleImportar = async () => {
    const selecionadas = transacoes.filter((t) => t.selecionada && !t.isDuplicada);
    if (selecionadas.length === 0) return;

    setIsImporting(true);
    try {
      await importar(contaId, mesReferencia, vencimento, selecionadas);
      handleClose();
    } catch (err) {
      errorService.handle(err, {
        source: "importador-fatura",
        operation: "importarTransacoesFatura",
        context: { contaId, mesReferencia, vencimento, count: selecionadas.length },
      });
    } finally {
      setIsImporting(false);
    }
  };

  const selecionadasCount = transacoes.filter((t) => t.selecionada && !t.isDuplicada).length;
  const totalValorSelecionado = transacoes
    .filter((t) => t.selecionada && !t.isDuplicada)
    .reduce((acc, t) => acc + t.valor, 0);

  const getBancoBadgeColor = (banco: string) => {
    switch (banco) {
      case "sicoob":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30";
      case "nubank":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      case "itau":
        return "bg-orange-500/10 text-orange-400 border-orange-500/30";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? handleClose() : null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border-border/60 bg-card p-6 shadow-2xl">
        <DialogHeader className="border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Importar Fatura de Cartão 2.0</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Suporta faturas Sicoob, Nubank e Itaú via Upload de PDF ou Recorte de Texto.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === "config" ? (
          <div className="space-y-5 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-1">
                <Label className="text-xs font-semibold">Cartão de Crédito *</Label>
                <Select value={contaId} onValueChange={setContaId}>
                  <SelectTrigger className="h-10 text-xs rounded-xl bg-background border-border/60">
                    <SelectValue placeholder="Selecione o cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    {cartoes.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhum cartão cadastrado
                      </SelectItem>
                    ) : (
                      cartoes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Mês de Referência *</Label>
                <Input
                  type="month"
                  value={mesReferencia}
                  onChange={(e) => setMesReferencia(e.target.value)}
                  className="h-10 text-xs rounded-xl bg-background border-border/60"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Data de Vencimento</Label>
                <Input
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  className="h-10 text-xs rounded-xl bg-background border-border/60"
                />
              </div>
            </div>

            {/* Opções de Entrada: Upload PDF ou Cole o Texto */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <Label className="text-xs font-semibold">Conteúdo da Fatura (PDF ou Texto) *</Label>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="pdf-file-upload"
                  />
                  <Label
                    htmlFor="pdf-file-upload"
                    className="inline-flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg cursor-pointer transition-colors font-medium"
                  >
                    {isExtraindoPDF ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extraindo PDF...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" /> Upload de Arquivo PDF
                      </>
                    )}
                  </Label>
                </div>
              </div>

              <Textarea
                rows={9}
                value={textoFatura}
                onChange={(e) => setTextoFatura(e.target.value)}
                placeholder={`Cole o texto extraído do PDF da fatura ou faça upload do arquivo PDF acima.\n\nExemplos Suportados:\n- Sicoob: 04/06 | Shopee*KIMI PENG ELE 03/03 | 103,55\n- Nubank: 04 JUN Shopee*KIMI PENG ELE 03/03 R$ 103,55\n- Itaú: 04/06 SHOPEE*KIMI PENG ELE 03/03 103,55`}
                className="text-xs font-mono rounded-xl bg-background border-border/60 leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={handleClose} className="rounded-xl text-xs">
                Cancelar
              </Button>
              <Button
                onClick={handleAnalisar}
                disabled={!contaId || !mesReferencia || !textoFatura.trim() || isAnalisando || isExtraindoPDF}
                className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs rounded-xl gap-2 px-6"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isAnalisando ? "Analisando..." : "Analisar Fatura"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            {/* Barra de Ações Rápidas & Banco Detectado */}
            <div className="flex flex-col gap-2.5 bg-muted/40 p-3.5 rounded-xl border border-border/50 text-xs">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <Badge variant="outline" className={`capitalize font-bold text-[11px] px-2.5 py-0.5 ${getBancoBadgeColor(bancoDetectado)}`}>
                    Banco: {bancoDetectado}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDebugText(!showDebugText)}
                    className="text-[11px] h-7 gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <FileText className="w-3 h-3" /> {showDebugText ? "Ocultar Texto" : "Ver Texto Extraído"}
                  </Button>
                </div>
                <div className="text-amber-500 font-semibold bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg text-xs">
                  Valor Total da Fatura: <strong>{formatCurrency(valorTotalFatura)}</strong>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-border/30">
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{selecionadasCount}</strong> de <strong>{transacoes.length}</strong> selecionadas (Total Selecionado: <strong className="text-foreground">{formatCurrency(totalValorSelecionado)}</strong>)
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={selecionarTodas} className="text-xs h-8 rounded-lg">
                    Selecionar Todas
                  </Button>
                  <Button variant="outline" size="sm" onClick={desselecionarDuplicadas} className="text-xs h-8 rounded-lg">
                    Desselecionar Duplicadas
                  </Button>
                  {transacoes.some((t) => t.isDuplicada) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => analisar(textoFatura, contaId, mesReferencia, vencimento, true)}
                      className="text-xs h-8 rounded-lg border-amber-500/50 text-amber-500 hover:bg-amber-500/10 font-semibold gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Importar Mesmo Assim (Ignorar Duplicatas)
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {showDebugText && (
              <div className="space-y-1 bg-background/80 p-3 rounded-xl border border-border/60">
                <span className="text-[11px] font-semibold text-muted-foreground block">Texto Bruto Extraído:</span>
                <textarea
                  readOnly
                  rows={6}
                  value={textoFatura}
                  className="w-full text-[11px] font-mono bg-muted/30 p-2 rounded-lg border border-border/40 text-muted-foreground leading-relaxed"
                />
              </div>
            )}

            {/* Tabela de Transações Extraídas */}
            <div className="border border-border/60 rounded-xl overflow-hidden max-h-[450px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-muted/60 text-muted-foreground font-semibold sticky top-0 border-b border-border/60 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3 w-24">Data</th>
                    <th className="p-3">Descrição</th>
                    <th className="p-3 w-28 text-right">Valor</th>
                    <th className="p-3 w-20 text-center">Parcela</th>
                    <th className="p-3 w-48">Categoria</th>
                    <th className="p-3 w-24 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 bg-card">
                  {transacoes.map((t) => (
                    <tr
                      key={t.id}
                      className={`hover:bg-accent/40 transition-colors ${
                        t.isDuplicada ? "opacity-60 bg-destructive/5" : ""
                      }`}
                    >
                      <td className="p-3 text-center">
                        <Checkbox
                          checked={t.selecionada}
                          onCheckedChange={() => toggleSelecao(t.id)}
                          disabled={t.isDuplicada}
                        />
                      </td>
                      <td className="p-3 font-mono text-[11px] whitespace-nowrap">{t.data}</td>
                      <td className="p-3 font-medium text-foreground">{t.descricao}</td>
                      <td className="p-3 text-right font-semibold text-foreground whitespace-nowrap">
                        {formatCurrency(t.valor)}
                      </td>
                      <td className="p-3 text-center font-mono text-[11px]">
                        {t.total_parcelas ? `${t.parcela_atual}/${t.total_parcelas}` : "-"}
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <Select
                            value={t.categoria_id || "none"}
                            onValueChange={(val) => {
                              const cat = categorias.find((c) => c.id === val);
                              setCategoria(t.id, val === "none" ? "" : val, cat?.nome || "");
                            }}
                            disabled={t.isDuplicada}
                          >
                            <SelectTrigger className="h-7 text-[11px] rounded-lg bg-background border-border/50">
                              <SelectValue placeholder="Sem categoria" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem categoria</SelectItem>
                              {categorias.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {t.categoria_sugerida && (
                            <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> Sugestão: {t.categoria_sugerida}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {t.isDuplicada ? (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] px-2">
                            Duplicada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px] px-2">
                            Nova
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setStep("config")}
                className="text-xs rounded-xl gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar / Editar Entrada
              </Button>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleClose} className="rounded-xl text-xs">
                  Cancelar
                </Button>
                <Button
                  onClick={handleImportar}
                  disabled={selecionadasCount === 0 || isImporting}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs rounded-xl gap-2 px-6"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isImporting ? "Importando..." : `Importar ${selecionadasCount} Despesas`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
