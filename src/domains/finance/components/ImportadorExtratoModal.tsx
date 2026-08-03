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
  Sparkles,
  Link as LinkIcon,
  Plus,
} from "lucide-react";
import { parseExtratoBancario, ParsedTransaction } from "../services/ofxCsvParser";
import { useContasUsuario } from "../hooks/useContasUsuario";
import { useDespesas } from "../hooks/useDespesas";
import { useReceitas } from "../hooks/useReceitas";
import { useTransacoes, Transacao } from "../hooks/useTransacoes";
import { useToast } from "@/shared/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ItemExtratoComMatch extends ParsedTransaction {
  idItem: number;
  match?: Transacao | null;
  statusMatch: "conciliar" | "novo" | "conciliado";
}

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
  const { transacoes, refetch: refetchTransacoes } = useTransacoes();

  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [contaIdSelecionada, setContaIdSelecionada] = useState<string>("");
  const [itens, setItens] = useState<ItemExtratoComMatch[]>([]);
  const [itensSelecionados, setItensSelecionados] = useState<Set<number>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [alocarNoMesFatura, setAlocarNoMesFatura] = useState(true);
  const [mesFatura, setMesFatura] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Inicializa conta selecionada quando a lista carrega
  React.useEffect(() => {
    if (contas.length > 0 && !contaIdSelecionada) {
      setContaIdSelecionada(contas[0].id);
    }
  }, [contas, contaIdSelecionada]);

  // Função para calcular diferença de dias entre duas datas YYYY-MM-DD
  const diferencaDias = (d1: string, d2: string): number => {
    const t1 = new Date(d1 + "T00:00:00").getTime();
    const t2 = new Date(d2 + "T00:00:00").getTime();
    return Math.abs(t1 - t2) / (1000 * 3600 * 24);
  };

  // Handler de Leitura de Arquivo e cruzamento inteligente
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

        // Algoritmo de Match (+/- 2 dias e valor exato)
        const itensProcessados: ItemExtratoComMatch[] = parsed.map((item, idx) => {
          const matchEncontrado = transacoes.find((t) => {
            const mesmoTipo = t.tipo === item.tipo;
            const valorExato = Math.abs(Number(t.valor) - Number(item.valor)) < 0.01;
            const proximoEmDias = diferencaDias(t.data, item.data) <= 2;
            return mesmoTipo && valorExato && proximoEmDias;
          });

          return {
            ...item,
            idItem: idx,
            match: matchEncontrado || null,
            statusMatch: matchEncontrado ? "conciliar" : "novo",
          };
        });

        setItens(itensProcessados);
        setItensSelecionados(new Set(itensProcessados.map((_, idx) => idx)));

        const conciliaveis = itensProcessados.filter((i) => i.match).length;
        toast({
          title: "Extrato processado",
          description: `${parsed.length} lançamentos encontrados (${conciliaveis} prontos para conciliar).`,
        });
      } catch (err) {
        toast({
          title: "Erro ao ler extrato",
          description: "Não foi possível interpretar o arquivo.",
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

  // Conciliar um único item correspondente
  const handleConciliarItem = async (item: ItemExtratoComMatch) => {
    if (!item.match) return;

    try {
      // Atualiza o registro existente no Supabase marcando como conciliado
      const { error } = await supabase
        .from("transacoes")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", item.match.id);

      if (error) throw error;

      setItens((prev) =>
        prev.map((i) => (i.idItem === item.idItem ? { ...i, statusMatch: "conciliado" } : i))
      );

      toast({
        title: "Transação conciliada!",
        description: `Lançamento '${item.descricao}' conciliado com a transação existente.`,
      });
      refetchTransacoes();
    } catch (err) {
      toast({
        title: "Erro ao conciliar",
        description: "Não foi possível atualizar a transação.",
        variant: "destructive",
      });
    }
  };

  // Salvar/Importar novos lançamentos
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

        if (item.statusMatch === "conciliar" && item.match) {
          await handleConciliarItem(item);
          salvas++;
          continue;
        }

        const dataSegura = (() => {
          if (!item.data) return new Date().toISOString().split("T")[0];
          const parts = item.data.trim().split("-");
          if (parts.length === 3 && parts[0].length === 4) {
            let m = parseInt(parts[1], 10);
            let d = parseInt(parts[2], 10);
            if (m > 12 && d <= 12) {
              return `${parts[0]}-${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}`;
            }
          }
          return item.data;
        })();

        const dataFinal = (() => {
          let baseData = dataSegura;
          if (contaAlvo?.tipo === "cartao_credito" && alocarNoMesFatura && mesFatura) {
            const parts = baseData.split("-");
            const dia = parts[2] || "01";
            baseData = `${mesFatura}-${dia.padStart(2, "0")}`;
          }
          return baseData;
        })();

        if (item.tipo === "despesa") {
          await createDespesa({
            descricao: item.descricao,
            valor: item.valor,
            data: dataFinal,
            conta_id: contaIdSelecionada,
            metodo_pagamento: contaAlvo?.tipo === "cartao_credito" ? "cartao_credito" : "pix",
          });
        } else {
          await createReceita({
            descricao: item.descricao,
            valor: item.valor,
            data: dataFinal,
            conta_id: contaIdSelecionada,
            metodo_pagamento: "pix",
          });
        }
        salvas++;
      }

      toast({
        title: "Importação concluída! 🎉",
        description: `${salvas} lançamentos processados com sucesso.`,
      });

      setItens([]);
      setArquivoNome("");
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erro durante importação",
        description: err instanceof Error ? err.message : "Erro ao salvar lançamentos.",
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
            Conciliação Bancária Automática (OFX / CSV)
          </DialogTitle>
          <DialogDescription>
            Faça upload do extrato bancário. O sistema cruza os valores ($\pm 2$ dias) e sugere **Conciliar** ou **Adicionar Nova**.
          </DialogDescription>
        </DialogHeader>

        {/* Upload Zone */}
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

        {/* Opção para Cartões de Crédito: Alocar no Mês da Fatura */}
        {contas.find((c) => c.id === contaIdSelecionada)?.tipo === "cartao_credito" && (
          <div className="p-3.5 rounded-xl border border-orange-500/30 bg-orange-500/10 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="alocarMesFatura"
                checked={alocarNoMesFatura}
                onChange={(e) => setAlocarNoMesFatura(e.target.checked)}
                className="h-4 w-4 rounded border-orange-500 text-orange-500 focus:ring-orange-500 accent-orange-500"
              />
              <label htmlFor="alocarMesFatura" className="cursor-pointer text-xs font-semibold text-foreground">
                Alocar lançamentos na fatura deste mês (inclui parcelas/compras antigas na fatura vigente)
              </label>
            </div>

            {alocarNoMesFatura && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Mês da Fatura:</span>
                <input
                  type="month"
                  value={mesFatura}
                  onChange={(e) => setMesFatura(e.target.value)}
                  className="h-8 px-2 rounded-lg border border-border bg-background text-xs font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            )}
          </div>
        )}

        {/* Tabela de Lançamentos com Match */}
        {itens.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">
                Lançamentos ({itensSelecionados.size} de {itens.length} selecionados)
              </span>
              <Button size="sm" variant="ghost" onClick={toggleTodos} className="text-xs text-orange-500 hover:text-orange-600">
                {itensSelecionados.size === itens.length ? "Desmarcar Todos" : "Selecionar Todos"}
              </Button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {itens.map((item) => {
                const selecionado = itensSelecionados.has(item.idItem);
                const temMatch = !!item.match;
                const foiConciliado = item.statusMatch === "conciliado";

                return (
                  <div
                    key={item.idItem}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                      foiConciliado
                        ? "bg-emerald-500/10 border-emerald-500/40"
                        : temMatch
                        ? "bg-blue-500/10 border-blue-500/40"
                        : selecionado
                        ? "bg-muted/40 border-orange-500/60"
                        : "bg-card border-border/40 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox checked={selecionado} onCheckedChange={() => toggleItem(item.idItem)} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground">{item.descricao}</p>
                          {temMatch && !foiConciliado && (
                            <Badge className="bg-blue-500/20 text-blue-600 border-blue-300 text-[10px]">
                              Match Encontrado
                            </Badge>
                          )}
                          {foiConciliado && (
                            <Badge className="bg-emerald-500 text-white text-[10px]">
                              Conciliado ✓
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{item.data}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right font-bold text-sm">
                        {item.tipo === "receita" ? (
                          <span className="text-emerald-500 flex items-center justify-end gap-1">
                            <ArrowUpRight className="w-4 h-4" />+ R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-rose-500 flex items-center justify-end gap-1">
                            <ArrowDownRight className="w-4 h-4" />- R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>

                      {temMatch && !foiConciliado && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConciliarItem(item)}
                          className="h-8 text-xs border-blue-500 text-blue-600 hover:bg-blue-50 gap-1"
                        >
                          <LinkIcon className="h-3 w-3" />
                          Conciliar
                        </Button>
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
            {carregando ? "Processando..." : `Processar ${itensSelecionados.size} Lançamento(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
