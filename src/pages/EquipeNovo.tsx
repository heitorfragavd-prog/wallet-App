import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { ArrowLeft, Camera, Save } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";

export default function EquipeNovoPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    nome: "",
    tipo: "funcionario" as "funcionario" | "socio" | "folguista",
    cargo: "",
    salario_bruto: "",
    vale_transporte: "0",
    vale_transporte_diario: "0",
    vale_refeicao: "0",
    outros_beneficios: "0",
    data_admissao: new Date().toISOString().split("T")[0],
    carga_horaria_semanal: "44",
    status: "experiencia" as "ativo" | "experiencia",
  });

  const [fotoPosicao, setFotoPosicao] = useState<string>("50% 15%");

  const handleFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.nome || !activeWorkspace?.id) {
      toast({ title: "Erro", description: "Nome e workspace são obrigatórios", variant: "destructive" });
      return;
    }
    setLoading(true);

    let fotoUrl = null;
    if (fotoPreview) {
      const fileName = `colaboradores/${activeWorkspace.id}/${Date.now()}.jpg`;
      const { error: upError } = await supabase.storage.from("avatars").upload(fileName, await fetch(fotoPreview).then(r => r.blob()));
      if (!upError) {
        const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
        fotoUrl = publicUrl;
      }
    }

    const { error } = await supabase.from("colaboradores").insert({
      workspace_id: activeWorkspace.id,
      nome: form.nome,
      foto_url: fotoUrl,
      foto_posicao: fotoPosicao,
      tipo: form.tipo,
      cargo: form.cargo || null,
      salario_bruto: Number(form.salario_bruto) || 0,
      vale_transporte: Number(form.vale_transporte) || 0,
      vale_transporte_diario: Number(form.vale_transporte_diario) || 0,
      vale_refeicao: Number(form.vale_refeicao) || 0,
      outros_beneficios: Number(form.outros_beneficios) || 0,
      data_admissao: form.data_admissao || null,
      carga_horaria_semanal: Number(form.carga_horaria_semanal) || 44,
      status: form.tipo === "socio" ? "ativo" : form.status,
    });

    setLoading(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: `${form.tipo === "socio" ? "Sócio" : "Funcionário"} cadastrado!` });
      navigate("/equipe");
    }
  };

  const yVal = parseInt((fotoPosicao.split(" ")[1] || "15%").replace("%", ""), 10);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/equipe")}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-2xl font-bold text-foreground">Novo Colaborador</h1>
        </div>

        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-6 space-y-6">
            <div className="flex flex-col items-center gap-3">
              <Avatar className="h-28 w-28 border-2 border-primary/50 shadow-md shrink-0">
                <AvatarImage src={fotoPreview || undefined} className="object-cover" style={{ objectPosition: fotoPosicao }} />
                <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold"><Camera className="h-8 w-8" /></AvatarFallback>
              </Avatar>
              <Label htmlFor="foto" className="cursor-pointer text-sm text-primary hover:underline font-medium">Adicionar foto</Label>
              <Input id="foto" type="file" accept="image/*" className="hidden" onChange={handleFotoUpload} />

              {fotoPreview && (
                <div className="w-full max-w-sm bg-card/80 p-3 rounded-lg border border-border/40 space-y-2 mt-2">
                  <div className="flex justify-between items-center text-xs text-muted-foreground font-medium">
                    <span>Enquadramento da foto (Altura)</span>
                    <span className="text-primary font-bold">{yVal}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={yVal}
                    onChange={(e) => setFotoPosicao(`50% ${e.target.value}%`)}
                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex gap-1 justify-center pt-1">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setFotoPosicao("50% 10%")}>Topo</Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setFotoPosicao("50% 25%")}>Rosto</Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setFotoPosicao("50% 50%")}>Centro</Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setFotoPosicao("50% 85%")}>Base</Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v: "funcionario" | "socio" | "folguista") => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="funcionario">Funcionário</SelectItem>
                  <SelectItem value="folguista">Folguista (sem encargos)</SelectItem>
                  <SelectItem value="socio">Sócio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: João Silva" />
            </div>

            <div className="space-y-2">
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} placeholder="Ex: Atendente, Caixa, Gerente" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{form.tipo === "socio" ? "Pró-labore Mensal (R$)" : form.tipo === "folguista" ? "Valor Fixo Mensal (R$)" : "Salário Bruto (R$)"}</Label>
                <Input type="number" value={form.salario_bruto} onChange={e => setForm({ ...form, salario_bruto: e.target.value })} placeholder="1500,00" />
              </div>
              <div className="space-y-2">
                <Label>Carga Horária Semanal</Label>
                <Input type="number" value={form.carga_horaria_semanal} onChange={e => setForm({ ...form, carga_horaria_semanal: e.target.value })} placeholder="44" />
              </div>
            </div>

            {form.tipo !== "folguista" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>VT Mensal Fixo (R$)</Label>
                  <Input type="number" value={form.vale_transporte} onChange={e => setForm({ ...form, vale_transporte: e.target.value })} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>VT Diário (Uber/Ônibus)</Label>
                  <Input type="number" value={form.vale_transporte_diario} onChange={e => setForm({ ...form, vale_transporte_diario: e.target.value })} placeholder="12,00" />
                </div>
                <div className="space-y-2">
                  <Label>Vale Refeição</Label>
                  <Input type="number" value={form.vale_refeicao} onChange={e => setForm({ ...form, vale_refeicao: e.target.value })} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Outros Benefícios</Label>
                  <Input type="number" value={form.outros_beneficios} onChange={e => setForm({ ...form, outros_beneficios: e.target.value })} placeholder="0,00" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Admissão</Label>
                <Input type="date" value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} />
              </div>
              {form.tipo === "funcionario" && (
                <div className="space-y-2">
                  <Label>Status Inicial</Label>
                  <Select value={form.status} onValueChange={(v: "ativo" | "experiencia") => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="experiencia">Em experiência (90 dias)</SelectItem>
                      <SelectItem value="ativo">Efetivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => navigate("/equipe")} className="flex-1">Cancelar</Button>
              <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                <Save className="h-4 w-4 mr-2" /> {loading ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
