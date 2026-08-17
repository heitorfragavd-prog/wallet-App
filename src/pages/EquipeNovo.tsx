import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useToast } from "@/shared/hooks/use-toast";
import { buildColaboradorPayload, createEquipeFormValues, EquipeForm, type EquipeFormValues, validateEquipeForm } from "@/domains/finance/components/equipe/EquipeForm";

export default function EquipeNovoPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeWorkspace } = useWorkspace();
  const [values, setValues] = useState(createEquipeFormValues);
  const [errors, setErrors] = useState<Partial<Record<keyof EquipeFormValues, string>>>({});
  const [loading, setLoading] = useState(false);

  const save = async () => {
    const nextErrors = validateEquipeForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !activeWorkspace?.id) {
      toast({ title: "Revise o cadastro", description: activeWorkspace ? "Corrija os campos destacados." : "Selecione uma carteira.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("colaboradores").insert({ workspace_id: activeWorkspace.id, ...buildColaboradorPayload(values) } as never);
    setLoading(false);
    if (error) return void toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
    await queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    toast({ title: "Colaborador cadastrado", description: "O perfil já está disponível no painel da equipe." });
    navigate("/equipe");
  };

  return <DashboardLayout><main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => navigate("/equipe")} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Button><div><h1 className="text-2xl font-bold">Novo colaborador</h1><p className="text-sm text-muted-foreground">Cadastre somente os dados necessários para pagamentos e gestão.</p></div></header>
    <Card className="border-border/60 bg-card/70 shadow-xl shadow-black/5"><CardHeader><CardTitle>Perfil profissional e financeiro</CardTitle></CardHeader><CardContent><EquipeForm values={values} onChange={setValues} errors={errors} /><div className="mt-8 flex justify-end gap-3 border-t border-border/50 pt-6"><Button variant="outline" onClick={() => navigate("/equipe")}>Cancelar</Button><Button onClick={save} disabled={loading}><Save className="mr-2 h-4 w-4" />{loading ? "Salvando..." : "Salvar colaborador"}</Button></div></CardContent></Card>
  </main></DashboardLayout>;
}
