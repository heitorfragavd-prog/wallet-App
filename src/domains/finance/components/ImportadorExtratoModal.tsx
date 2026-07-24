import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Trash2,
  Sparkles,
} from "lucide-react";
import { parseExtratoBancario, ParsedTransaction } from "../services/ofxCsvParser";
import { useContasUsuario } from "../hooks/useContasUsuario";
import { useDespesas } from "../hooks/useDespesas";
import { useReceitas } from "../hooks/useReceitas";
import { useToast } from "@/shared/hooks/use-toast";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";

interface ImportadorExtratoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ImportadorExtratoModal: React.FC<ImportadorExtratoModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { toast } = useToast();
  const { contas } = useContasUsuario();
  const { createDespesa } = useDespesas();
  const { createReceita } = useReceitas();

  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [contaIdSelecionada, setContaIdSelecionada] = useState<string>("");
  const [itens, setItens] = useState<ParsedTransaction[]>([]);
  const [itensSelecionados, setItensSelecionados] = useState<Set<number>>(new Set());
  const [carregando, setCarregando] = useState(false);

  // Inicializa conta selecionada quando a lista carrega
  React.useEffect(() => {
    if (contas.length > 0 && !contaIdSelecionada) {
      setContaIdSelecionada(contas[0].id);
    }
  }, [contas, contaIdSelecionada]);

  // Handler de Leitura de Arquivo
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArquivoNome(file.name);
    setCarregando(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseExtratoBancario(content, file.name);
        setItens(parsed);
        // Por padrão seleciona todos os itens válidos
        setItensSelecionados(new Set(parsed.map((_, idx) => idx)));
        toast({
          title: "Extrato processado",
          description: `${parsed.length} transações identificadas no arquivo ${file.name}.`,
        });
      } catch (err) {
        toast({
          title: "Erro ao ler extrato",
          description: "Não foi possível interpretar a estrutura do arquivo selecionado.",
          variant: "destructive",
        });
      } finally {
        setCarregando(false);
      }
    };

    reader.readAsText(file, "ISO-8859-1");
  };

  const toggleItem = (idx: number) => {
    const next = new Set(itensSelecionados);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setItensSelecionados(next);
  };

  const toggleTodos = () => {
    if (itensSelecionados.size === itens.length) {
      setItensSelecionados(new Set());
    } else {
      setItensSelecionados(new Set(itens.map((_, idx) => idx)));
    }
  };

  const handleSalvarImportacao = async () => {
    if (itensSelecionados.size === 0) {
      toast({ title: "Atenção", description: "Selecione ao menos um lançamento para importar.", variant: "destructive" });
      return;
    }

    setCarregando(true);
    let salvas = 0;

    try {
      const contaAlvo = contas.find((c) => c.id === contaIdSelecionada);

      for (const idx of itensSelecionados) {
        const item = itens[idx];
        if (item.tipo === "despesa") {
          await createDespesa.mutateAsync({
            despesa: {
              descricao: item.descricao,
              valor: item.valor,
              data: item.data,
              conta_id: contaIdSelecionada,
              metodo_pagamento: contaAlvo?.tipo === "cartao_credito" ? "cartao_credito" : "pix",
            },
          });
        } else {
          await createReceita.mutateAsync({
            receita: {
              descricao: item.descricao,
              valor: item.valor,
              data: item.data,
              conta_id: contaIdSelecionada,
              metodo_pagamento: "pix",
            },
          });
        }
        salvas++;
      }

      toast({
        title: "Importação concluída! 🎉",
        description: `${salvas} lançamentos importados com sucesso para a conta selecionada.`,
      });

      // Reseta modal
      setItens([]);
      setArquivoNome("");
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erro durante importação",
        description: err instanceof Error ? err.message : "Erro ao salvar lançamentos no banco de dados.",
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto p-6 border border-border/60 bg-card space-y-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-orange-500" />
            Importar Extrato Bancário (OFX / CSV)
          </DialogTitle>
          <DialogDescription>
            Faça upload do extrato fornecido pelo seu banco (.ofx, .qfx ou .csv). O sistema detectará automaticamente as receitas e despesas.
          </DialogDescription>
        </DialogHeader>

        {/* Zona de Drop & Upload */}
        <div className="border-2 border-dashed border-border/80 hover:border-orange-500/80 transition-colors rounded-2xl p-6 text-center bg-muted/20 space-y-3 relative">
          <Input
            type="file"
            accept=".ofx,.qfx,.csv,.txt"
            onChange={handleFileUpload}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <FileText className="w-10 h-10 mx-auto text-orange-500 opacity-80" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {arquivoNome ? `Arquivo carregado: ${arquivoNome}` : "Clique ou arraste o arquivo OFX ou CSV aqui"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suporta Nubank, Itaú, Bradesco, Caixa, Banco do Brasil, Inter, Santander, C6, etc.
            </p>
          </div>
        </div>

        {/* Seleção da Conta de Destino */}
        {contas.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="contaDestino" className="text-xs text-muted-foreground">Conta / Cartão de Destino</Label>
            <select
              id="contaDestino"
              value={contaIdSelecionada}
              onChange={(e) => setContaIdSelecionada(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.tipo.replace("_", " ")})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tabela de Pré-visualização dos Lançamentos */}
        {itens.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                Lançamentos Identificados ({itensSelecionados.size} de {itens.length} selecionados)
              </span>
              <Button size="sm" variant="ghost" onClick={toggleTodos} className="text-xs text-orange-500 hover:text-orange-600">
                {itensSelecionados.size === itens.length ? "Desmarcar Todos" : "Selecionar Todos"}
              </Button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {itens.map((item, idx) => {
                const selecionado = itensSelecionados.has(idx);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleItem(idx)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors cursor-pointer ${
                      selecionado ? "bg-muted/40 border-orange-500/60" : "bg-card border-border/40 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox checked={selecionado} onCheckedChange={() => toggleItem(idx)} />
                      <div>
                        <p className="font-semibold text-sm text-foreground flex items-center gap-2">
                          {item.descricao}
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-border">
                            {item.categoriaSugerida}
                          </Badge>
                        </p>
                        <p className="text-[11px] text-muted-foreground">{item.data}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 font-bold text-sm">
                      {item.tipo === "receita" ? (
                        <span className="text-emerald-500 flex items-center gap-1">
                          <ArrowUpRight className="w-4 h-4" />+ R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-rose-500 flex items-center gap-1">
                          <ArrowDownRight className="w-4 h-4" />- R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="pt-4 border-t border-border/40">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvarImportacao}
            disabled={carregando || itensSelecionados.size === 0}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
          >
            {carregando ? "Importando..." : `Importar ${itensSelecionados.size} Lançamento(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
