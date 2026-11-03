import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
  CheckCircle2,
  FilePlus2,
  EyeOff,
  GitMerge,
  Copy,
  Building2,
  Users,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useDivipayConciliacao,
  useDivipayConciliacoes,
} from "@/domains/divipay/hooks/useDivipayConciliacao";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { useContatos } from "@/domains/finance/hooks/useContatos";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useColaboradores } from "@/domains/finance/hooks/useColaboradores";
import { useToast } from "@/shared/hooks/use-toast";
import type { DivipayConciliacao } from "@/domains/divipay/services/ConciliacaoDivipayService";

const formatarData = (iso: string | null) => {
  if (!iso) return "---";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
};

export function ConciliacoesPendentesCard() {
  const { toast } = useToast();
  const { data: pendentes = [], isLoading } = useDivipayConciliacoes("pendente");
  const { dividas } = useDividas();
  const { contatos } = useContatos();
  const { categorias } = useCategorias();
  const { data: colaboradores = [] } = useColaboradores();
  const {
    confirmar,
    importarAvulsa,
    ignorar,
    vincularFornecedor,
    vincularColaborador,
    isConfirmando,
    isVinculandoFornecedor,
    isVinculandoColaborador,
  } = useDivipayConciliacao();

  const [modalFornecedorOpen, setModalFornecedorOpen] = useState(false);
  const [modalColaboradorOpen, setModalColaboradorOpen] = useState(false);
  const [conciliacaoSelecionada, setConciliacaoSelecionada] = useState<DivipayConciliacao | null>(null);

  const [fornecedorId, setFornecedorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");

  const fornecedores = contatos.filter((c) => c.tipo === "fornecedor" && c.ativo !== false);
  const categoriasDespesa = categorias.filter((c) => c.tipo === "despesa");

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (pendentes.length === 0) return null;

  const descricaoDivida = (id: string | null) => {
    if (!id) return null;
    const d = dividas.find((x) => x.id === id);
    return d ? `${d.descricao} (${d.credor})` : null;
  };

  const copiarTexto = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast({ title: "Copiado", description: "Identificador copiado para a área de transferência." });
  };

  const abrirVincularFornecedor = (c: DivipayConciliacao) => {
    setConciliacaoSelecionada(c);
    setFornecedorId(c.contato_id || "");
    setCategoriaId(c.categoria_id || "");
    setModalFornecedorOpen(true);
  };

  const confirmarVinculoFornecedor = async () => {
    if (!conciliacaoSelecionada || !fornecedorId) return;
    await vincularFornecedor({
      conciliacao: conciliacaoSelecionada,
      contatoId: fornecedorId,
      categoriaId: categoriaId || null,
    });
    setModalFornecedorOpen(false);
  };

  const abrirVincularColaborador = (c: DivipayConciliacao) => {
    setConciliacaoSelecionada(c);
    setColaboradorId(c.colaborador_id || "");
    setModalColaboradorOpen(true);
  };

  const confirmarVinculoColaborador = async () => {
    if (!conciliacaoSelecionada || !colaboradorId) return;
    await vincularColaborador({
      conciliacao: conciliacaoSelecionada,
      colaboradorId,
    });
    setModalColaboradorOpen(false);
  };

  return (
    <>
      <Card className="rounded-2xl border-amber-500/40 bg-amber-500/5 shadow-sm overflow-hidden">
        <CardHeader className="p-4 border-b border-amber-500/20">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <GitMerge className="w-4 h-4" />
            Pagamentos a Identificar / Revisão ({pendentes.length})
            <span className="text-xs font-normal text-muted-foreground hidden sm:inline">
              — pagamentos reais do Divipay que necessitam de vinculação manual a fornecedor ou equipe.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-amber-500/10">
          {pendentes.map((c) => {
            const sugestao = descricaoDivida(c.divida_sugerida_id);
            const isBoleto = c.tipo === "BILLET" || String(c.descricao || "").toLowerCase().includes("boleto");

            return (
              <div key={c.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {c.favorecido_nome && c.favorecido_nome !== "---" ? c.favorecido_nome : "Beneficiário não identificado"}
                    </span>
                    <Badge variant="outline" className={`text-[10px] font-bold ${isBoleto ? "border-amber-500/40 text-amber-400 bg-amber-500/10" : "border-sky-500/40 text-sky-400 bg-sky-500/10"}`}>
                      {isBoleto ? "Boleto" : "Pix"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatarData(c.data_pagamento)}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>
                      Valor: <strong className="text-foreground">{formatCurrency(Number(c.valor))}</strong>
                    </span>
                    {Number(c.taxa) > 0 && <span>Taxa: {formatCurrency(Number(c.taxa))}</span>}
                    {c.favorecido_documento && c.favorecido_documento !== "---" && (
                      <span className="font-mono bg-muted/40 px-1.5 py-0.5 rounded text-[11px]">{c.favorecido_documento}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => copiarTexto(c.divipay_external_id)}
                      className="font-mono text-[10px] text-muted-foreground/80 hover:text-foreground flex items-center gap-1"
                      title="Copiar ID Divipay"
                    >
                      <Copy className="h-3 w-3" /> {c.divipay_external_id.slice(0, 8)}...
                    </button>
                  </div>

                  {c.motivo_revisao && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400/90 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> {c.motivo_revisao}
                    </p>
                  )}

                  {sugestao && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Sugestão de Dívida: <strong>{sugestao}</strong>
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {c.divida_sugerida_id && (
                    <Button
                      size="sm"
                      onClick={() => confirmar(c, c.divida_sugerida_id!)}
                      disabled={isConfirmando}
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Baixar Dívida
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrirVincularFornecedor(c)}
                    disabled={isVinculandoFornecedor}
                    className="h-8 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Vincular a Fornecedor
                  </Button>

                  {!isBoleto && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => abrirVincularColaborador(c)}
                      disabled={isVinculandoColaborador}
                      className="h-8 text-xs gap-1 border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Vincular a Equipe
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => importarAvulsa(c)}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    title="Registrar como despesa avulsa sem vínculo"
                  >
                    <FilePlus2 className="w-3.5 h-3.5 mr-1" />
                    Avulsa
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => ignorar(c.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Ignorar (não é despesa operacional)"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* MODAL VINCULAR A FORNECEDOR */}
      <Dialog open={modalFornecedorOpen} onOpenChange={setModalFornecedorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Vincular Pagamento a Fornecedor
            </DialogTitle>
          </DialogHeader>

          {conciliacaoSelecionada && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/30 border space-y-1">
                <p><strong>Valor:</strong> {formatCurrency(Number(conciliacaoSelecionada.valor))}</p>
                <p><strong>Data:</strong> {formatarData(conciliacaoSelecionada.data_pagamento)}</p>
                <p><strong>Beneficiário informado:</strong> {conciliacaoSelecionada.favorecido_nome || "---"}</p>
                {conciliacaoSelecionada.favorecido_documento && (
                  <p><strong>Documento:</strong> {conciliacaoSelecionada.favorecido_documento}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="sel_forn" className="text-xs">Selecione o Fornecedor *</Label>
                <select
                  id="sel_forn"
                  value={fornecedorId}
                  onChange={(e) => {
                    setFornecedorId(e.target.value);
                    const forn = fornecedores.find((f) => f.id === e.target.value);
                    if (forn?.categoria_padrao_id) setCategoriaId(forn.categoria_padrao_id);
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
                >
                  <option value="">Selecione um fornecedor cadastrado...</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome} {f.cnpj_cpf ? `(${f.cnpj_cpf})` : ""}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="sel_cat" className="text-xs">Categoria Financeira</Label>
                <select
                  id="sel_cat"
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
                >
                  <option value="">Categoria Padrão do Fornecedor</option>
                  {categoriasDespesa.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setModalFornecedorOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmarVinculoFornecedor} disabled={!fornecedorId}>
              Confirmar Vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL VINCULAR A COLABORADOR */}
      <Dialog open={modalColaboradorOpen} onOpenChange={setModalColaboradorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-sky-400" /> Vincular Pagamento a Membro da Equipe
            </DialogTitle>
          </DialogHeader>

          {conciliacaoSelecionada && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-2.5 rounded-lg bg-muted/30 border space-y-1">
                <p><strong>Valor:</strong> {formatCurrency(Number(conciliacaoSelecionada.valor))}</p>
                <p><strong>Data:</strong> {formatarData(conciliacaoSelecionada.data_pagamento)}</p>
                <p><strong>Favorecido:</strong> {conciliacaoSelecionada.favorecido_nome || "---"}</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="sel_colab" className="text-xs">Selecione o Integrante da Equipe *</Label>
                <select
                  id="sel_colab"
                  value={colaboradorId}
                  onChange={(e) => setColaboradorId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
                >
                  <option value="">Selecione um colaborador ou sócio...</option>
                  {colaboradores.map((colab) => (
                    <option key={colab.id} value={colab.id}>
                      {colab.nome} ({colab.cargo || colab.tipo})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setModalColaboradorOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmarVinculoColaborador} disabled={!colaboradorId}>
              Confirmar Vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
