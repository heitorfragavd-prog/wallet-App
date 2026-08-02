import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Receipt, FileText, Printer } from "lucide-react";

const Recibos = () => {
  const { toast } = useToast();
  const [form, setForm] = useState({
    valor: "",
    pagador: "",
    recebedor: "",
    descricao: "",
    data: new Date().toISOString().split("T")[0],
    cidade: "",
  });
  const [reciboHtml, setReciboHtml] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  const handleGerar = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = parseFloat(form.valor.replace(",", "."));
    if (!valor || valor <= 0 || !form.pagador.trim() || !form.recebedor.trim()) {
      toast({ title: "Preencha os campos obrigatórios", description: "Valor, pagador e recebedor são obrigatórios.", variant: "destructive" });
      return;
    }
    setGerando(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerar-recibo", {
        body: {
          valor,
          pagador: form.pagador.trim(),
          recebedor: form.recebedor.trim(),
          descricao: form.descricao.trim(),
          data: form.data,
          cidade: form.cidade.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReciboHtml(data.html);
      toast({ title: "Recibo gerado", description: "Confira o preview ao lado." });
    } catch (err) {
      toast({ title: "Erro ao gerar recibo", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };

  const handleImprimir = () => {
    if (!reciboHtml) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(reciboHtml);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Receipt className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Recibos</h1>
            <p className="text-sm text-muted-foreground">Gere recibos profissionais em segundos</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <form onSubmit={handleGerar} className="space-y-4">
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <Input inputMode="decimal" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Pagador (quem pagou) *</Label>
                  <Input value={form.pagador} onChange={(e) => setForm({ ...form, pagador: e.target.value })} placeholder="Nome ou razão social" required />
                </div>
                <div className="space-y-2">
                  <Label>Recebedor (quem recebeu) *</Label>
                  <Input value={form.recebedor} onChange={(e) => setForm({ ...form, recebedor: e.target.value })} placeholder="Nome ou razão social" required />
                </div>
                <div className="space-y-2">
                  <Label>Referente a</Label>
                  <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: venda de mercadorias, prestação de serviço..." rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Ex.: São Paulo - SP" />
                  </div>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={gerando}>
                  <FileText className="h-4 w-4" />
                  {gerando ? "Gerando..." : "Gerar Recibo"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Preview</h3>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleImprimir} disabled={!reciboHtml}>
                  <Printer className="h-4 w-4" /> Baixar PDF / Imprimir
                </Button>
              </div>
              {reciboHtml ? (
                <iframe
                  title="Preview do recibo"
                  srcDoc={reciboHtml}
                  className="w-full h-[500px] rounded-lg border border-border bg-white"
                />
              ) : (
                <div className="h-[500px] rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground text-sm">
                  Preencha o formulário e clique em "Gerar Recibo"
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Recibos;
