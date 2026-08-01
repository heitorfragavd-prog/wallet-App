import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useProdutosCardapio } from "@/domains/finance/hooks/useProdutosCardapio";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ChefHat, ArrowLeft, Save } from "lucide-react";
import type { CategoriaCardapio } from "@/domains/finance/types/foodCost";

const CATEGORIAS_LABEL: Record<CategoriaCardapio, string> = {
  lanches: "Lanches",
  bebidas: "Bebidas",
  sobremesas: "Sobremesas",
  cafes: "Cafés",
  porcoes: "Porções",
  outros: "Outros",
};

const CardapioNovoPage: React.FC = () => {
  const navigate = useNavigate();
  const { createProduto } = useProdutosCardapio();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    preco_venda: "",
    categoria: "outros" as CategoriaCardapio,
    imagem_url: "",
    ativo: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.preco_venda) return;
    setSaving(true);
    try {
      const produto = await createProduto({
        nome: form.nome,
        descricao: form.descricao || undefined,
        preco_venda: parseFloat(form.preco_venda.replace(",", ".")),
        categoria: form.categoria,
        imagem_url: form.imagem_url || undefined,
        ativo: form.ativo,
      });
      navigate(`/cardapio/${(produto as any).id}`);
    } catch {
      /* toast já exibido pelo hook */
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cardapio")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/15">
              <ChefHat className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Novo Produto</h1>
              <p className="text-sm text-muted-foreground">Adicionar item ao cardápio</p>
            </div>
          </div>
        </div>

        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base">Dados do produto</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do produto *</Label>
                <Input
                  id="nome"
                  placeholder="Ex: X-Burguer Artesanal"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="preco_venda">Preço de venda (R$) *</Label>
                  <Input
                    id="preco_venda"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.preco_venda}
                    onChange={(e) => setForm((f) => ({ ...f, preco_venda: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoria *</Label>
                  <Select
                    value={form.categoria}
                    onValueChange={(v) => setForm((f) => ({ ...f, categoria: v as CategoriaCardapio }))}
                  >
                    <SelectTrigger id="categoria">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(CATEGORIAS_LABEL) as [CategoriaCardapio, string][]).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  placeholder="Descrição do produto para o cardápio..."
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="imagem_url">URL da imagem</Label>
                <Input
                  id="imagem_url"
                  type="url"
                  placeholder="https://..."
                  value={form.imagem_url}
                  onChange={(e) => setForm((f) => ({ ...f, imagem_url: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate("/cardapio")}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !form.nome || !form.preco_venda}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white gap-2"
                >
                  {saving ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar Produto
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CardapioNovoPage;
