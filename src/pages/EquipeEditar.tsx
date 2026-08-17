import { useEffect, useState } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useColaboradores } from "@/domains/finance/hooks/useColaboradores";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useToast } from "@/shared/hooks/use-toast";
import { buildColaboradorPayload, createEquipeFormValues, EquipeForm, type EquipeFormValues, validateEquipeForm } from "@/domains/finance/components/equipe/EquipeForm";

export default function EquipeEditarPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: colaboradores, isLoading, refetch } = useColaboradores();
  const colaborador = colaboradores?.find((item) => item.id === id);
  const [values, setValues] = useState(createEquipeFormValues);
  const [errors, setErrors] = useState<Partial<Record<keyof EquipeFormValues, string>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!colaborador) return;
    const defaults = createEquipeFormValues();
    setValues(Object.fromEntries(Object.keys(defaults).map((key) => {
      const field = key as keyof EquipeFormValues;
      const stored = colaborador[field as keyof typeof colaborador];
      return [field, stored === null || stored === undefined ? defaults[field] : String(stored)];
    })) as unknown as EquipeFormValues);
  }, [colaborador]);

  const save = async () => {
    if (!id) return;
    const nextErrors = validateEquipeForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return void toast({ title: "Revise o cadastro", description: "Corrija os campos destacados.", variant: "destructive" });
    setLoading(true);
    const { error } = await supabase.from("colaboradores").update(buildColaboradorPayload(values) as never).eq("id", id);
    setLoading(false);
    if (error) return void toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
    await queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    await refetch();
    toast({ title: "Perfil atualizado" });
    navigate(`/equipe/${id}`);
  };

  const remove = async () => {
    if (!id || !window.confirm("Excluir este colaborador e o vínculo com os acertos?")) return;
    setLoading(true);
    const { error } = await supabase.from("colaboradores").delete().eq("id", id);
    setLoading(false);
    if (error) return void toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" });
    await queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    navigate("/equipe");
  };

  if (isLoading) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Carregando perfil...</div></DashboardLayout>;
  if (!colaborador) return <DashboardLayout><div className="p-8 text-center"><p>Colaborador não encontrado.</p><Button className="mt-4" onClick={() => navigate("/equipe")}>Voltar à equipe</Button></div></DashboardLayout>;

  return <DashboardLayout><main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => navigate(`/equipe/${id}`)} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Button><div><h1 className="text-2xl font-bold">Editar colaborador</h1><p className="text-sm text-muted-foreground">{colaborador.nome}</p></div></div><Button variant="destructive" size="sm" onClick={remove} disabled={loading}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button></header>
    <Card className="border-border/60 bg-card/70 shadow-xl shadow-black/5"><CardHeader><CardTitle>Perfil profissional e financeiro</CardTitle></CardHeader><CardContent><EquipeForm values={values} onChange={setValues} errors={errors} /><div className="mt-8 flex justify-end gap-3 border-t border-border/50 pt-6"><Button variant="outline" onClick={() => navigate(`/equipe/${id}`)}>Cancelar</Button><Button onClick={save} disabled={loading}><Save className="mr-2 h-4 w-4" />{loading ? "Salvando..." : "Salvar alterações"}</Button></div></CardContent></Card>
  </main></DashboardLayout>;
}
