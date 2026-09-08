import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useColaboradores } from "@/domains/finance/hooks/useColaboradores";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export default function EquipeCustoNovoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const { data: colaboradores } = useColaboradores();
  const colaborador = colaboradores?.find(c => c.id === id);

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tipo: "vale" as "vale" | "adiantamento" | "hora_extra" | "comissao" | "premio" | "folguista" | "desconto" | "outro",
    valor: "",
    data: new Date().toISOString().split("T")[0],
    descricao: "",
    lancarNaDespesa: true,
  });

  const handleSubmit = async () => {
    if (!id || !form.valor || !activeWorkspace?.id) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    setLoading(true);

    const valorNum = Number(form.valor);

    const { error: custoError } = await supabase.from("colaborador_custos").insert({
      colaborador_id: id,
      tipo: form.tipo,
      valor: valorNum,
      data: form.data,
      descricao: form.descricao || null,
      lancado_na_despesa: form.lancarNaDespesa,
    });

    if (!custoError && form.lancarNaDespesa) {
      await supabase.from("transacoes").insert({
        workspace_id: activeWorkspace.id,
        tipo: "despesa",
        valor: valorNum,
        data: form.data,
        descricao: `${form.tipo.toUpperCase()} - ${colaborador?.nome || "Colaborador"}: ${form.descricao || ""}`,
        categoria_id: null,
        centro_custo_id: null,
        conta_id: null,
        metodo_pagamento: "pix",
      });
    }

    setLoading(false);
    if (custoError) {
      toast({ title: "Erro", description: custoError.message, variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: `${form.tipo} de R$ ${valorNum.toFixed(2)} lançado!` });
      navigate(`/equipe/${id}`);
    }
  };

  if (!colaborador) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">Colaborador não encontrado.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/equipe/${id}`)}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lançar Custo</h1>
            <p className="text-sm text-muted-foreground">{colaborador.nome}</p>
          </div>
        </div>

        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label>Tipo de Custo</Label>
              <Select value={form.tipo} onValueChange={(v: string) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vale">Vale (empréstimo)</SelectItem>
                  <SelectItem value="adiantamento">Adiantamento de Salário</SelectItem>
                  <SelectItem value="hora_extra">Hora Extra</SelectItem>
                  <SelectItem value="comissao">Comissão</SelectItem>
                  <SelectItem value="premio">Prêmio/Bônus</SelectItem>
                  <SelectItem value="folguista">Folguista (custo extra)</SelectItem>
                  <SelectItem value="desconto">Desconto (consumo na loja, etc)</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="100,00" />
            </div>

            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Vale para transporte até dia 5" />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="lancarDespesa"
                checked={form.lancarNaDespesa}
                onChange={e => setForm({ ...form, lancarNaDespesa: e.target.checked })}
                className="h-4 w-4 rounded border-border bg-card accent-primary cursor-pointer"
              />
              <Label htmlFor="lancarDespesa" className="text-sm cursor-pointer">
                Lançar automaticamente como despesa no sistema
              </Label>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => navigate(`/equipe/${id}`)} className="flex-1">Cancelar</Button>
              <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                <Save className="h-4 w-4 mr-2" /> {loading ? "Salvando..." : "Lançar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
