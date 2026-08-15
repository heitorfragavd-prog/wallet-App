import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { ArrowLeft, Camera, Save, UserCheck, CreditCard, Bus, PhoneCall, Home } from "lucide-react";

export default function EquipeNovoPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeWorkspace } = useWorkspace();
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
    // Ficha Cadastral
    cpf: "",
    rg: "",
    data_nascimento: "",
    telefone: "",
    email: "",
    endereco: "",
    contato_emergencia_1: "",
    contato_emergencia_2: "",
    // Dados Bancários / PIX
    pix_tipo: "cpf",
    pix_chave: "",
    banco_nome: "",
    banco_agencia: "",
    banco_conta: "",
    // Transporte / Passagem
    linha_onibus: "",
    valor_passagem: "6.25",
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
      // Ficha Cadastral
      cpf: form.cpf || null,
      rg: form.rg || null,
      data_nascimento: form.data_nascimento || null,
      telefone: form.telefone || null,
      email: form.email || null,
      endereco: form.endereco || null,
      contato_emergencia_1: form.contato_emergencia_1 || null,
      contato_emergencia_2: form.contato_emergencia_2 || null,
      pix_tipo: form.pix_tipo || null,
      pix_chave: form.pix_chave || null,
      banco_nome: form.banco_nome || null,
      banco_agencia: form.banco_agencia || null,
      banco_conta: form.banco_conta || null,
      linha_onibus: form.linha_onibus || null,
      valor_passagem: Number(form.valor_passagem) || 6.25,
    });

    setLoading(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      await queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
      toast({ title: "Sucesso", description: `${form.tipo === "socio" ? "Sócio" : form.tipo === "folguista" ? "Folguista" : "Funcionário"} cadastrado!` });
      navigate("/equipe");
    }
  };

  const yVal = parseInt((fotoPosicao.split(" ")[1] || "15%").replace("%", ""), 10);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
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

            {/* Informações Profissionais */}
            <div className="space-y-4 pt-2 border-t border-border/30">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <UserCheck className="h-4 w-4" /> Informações Profissionais
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Luiz Fellipe Santos De Assis" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cargo</Label>
                  <Input value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} placeholder="Ex: Atendente, Caixa, Gerente" />
                </div>
                <div className="space-y-2">
                  <Label>{form.tipo === "socio" ? "Pró-labore Mensal (R$)" : form.tipo === "folguista" ? "Valor Fixo Mensal (R$)" : "Salário Bruto (R$)"}</Label>
                  <Input type="number" value={form.salario_bruto} onChange={e => setForm({ ...form, salario_bruto: e.target.value })} placeholder="1621,00" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Carga Horária Semanal</Label>
                  <Input type="number" value={form.carga_horaria_semanal} onChange={e => setForm({ ...form, carga_horaria_semanal: e.target.value })} placeholder="44" />
                </div>
                <div className="space-y-2">
                  <Label>Data de Admissão</Label>
                  <Input type="date" value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} />
                </div>
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

            {/* Ficha Cadastral & Endereço */}
            <div className="space-y-4 pt-4 border-t border-border/30">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Home className="h-4 w-4" /> Dados Pessoais, Endereço & Contatos
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-2">
                  <Label>Identidade / RG</Label>
                  <Input value={form.rg} onChange={e => setForm({ ...form, rg: e.target.value })} placeholder="MG-00.000.000" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone / WhatsApp</Label>
                  <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="31988857414" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="exemplo@gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label>Endereço Completo</Label>
                  <Input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} placeholder="Rua, bairro, número..." />
                </div>
              </div>

              {/* Contatos de Emergência */}
              <div className="space-y-3 pt-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <PhoneCall className="h-3.5 w-3.5 text-amber-400" /> Telefones de Emergência
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Emergência 1 (Nome e Telefone)</Label>
                    <Input value={form.contato_emergencia_1} onChange={e => setForm({ ...form, contato_emergencia_1: e.target.value })} placeholder="Ex: Mãe Maria - (31) 99999-8888" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Emergência 2 (Nome e Telefone)</Label>
                    <Input value={form.contato_emergencia_2} onChange={e => setForm({ ...form, contato_emergencia_2: e.target.value })} placeholder="Ex: Pai João - (31) 97777-6666" />
                  </div>
                </div>
              </div>
            </div>

            {/* Pagamento (PIX) */}
            <div className="space-y-4 pt-4 border-t border-border/30">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Dados de Pagamento (PIX)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Chave PIX</Label>
                  <Select value={form.pix_tipo} onValueChange={(v) => setForm({ ...form, pix_tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="telefone">Telefone</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Chave PIX</Label>
                  <Input value={form.pix_chave} onChange={e => setForm({ ...form, pix_chave: e.target.value })} placeholder="Digite a chave PIX" />
                </div>
              </div>
            </div>

            {/* Transporte & Benefícios */}
            <div className="space-y-4 pt-4 border-t border-border/30">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Bus className="h-4 w-4" /> Transporte & Benefícios
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold text-sky-400">Linha de Ônibus (Texto)</Label>
                  <Input value={form.linha_onibus} onChange={e => setForm({ ...form, linha_onibus: e.target.value })} placeholder="Ex: 40, 50" />
                </div>
                <div className="space-y-2">
                  <Label>Preço da Passagem de Ônibus (R$)</Label>
                  <Input type="number" step="0.01" value={form.valor_passagem} onChange={e => setForm({ ...form, valor_passagem: e.target.value })} placeholder="6,25" />
                </div>
              </div>

              {form.tipo !== "folguista" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>VT Diário (Uber R$)</Label>
                    <Input type="number" step="0.01" value={form.vale_transporte_diario} onChange={e => setForm({ ...form, vale_transporte_diario: e.target.value })} placeholder="12,00" />
                  </div>
                  <div className="space-y-2">
                    <Label>VT Mensal Fixo (R$)</Label>
                    <Input type="number" value={form.vale_transporte} onChange={e => setForm({ ...form, vale_transporte: e.target.value })} placeholder="0,00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Vale Refeição (R$)</Label>
                    <Input type="number" value={form.vale_refeicao} onChange={e => setForm({ ...form, vale_refeicao: e.target.value })} placeholder="0,00" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => navigate("/equipe")} className="flex-1">Cancelar</Button>
              <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                <Save className="h-4 w-4 mr-2" /> {loading ? "Salvando..." : "Salvar Colaborador"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
