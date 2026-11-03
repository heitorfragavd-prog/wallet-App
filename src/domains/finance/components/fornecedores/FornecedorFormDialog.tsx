import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Switch } from "@/shared/components/ui/switch";
import { Plus, Trash2, Building2, QrCode, FileText, History } from "lucide-react";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useSubcategorias } from "@/domains/finance/hooks/useSubcategorias";
import type { Contato, ChavePixAdicional, IdentificadorBoleto } from "@/domains/finance/hooks/useContatos";

interface FornecedorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fornecedor: Contato | null;
  onSave: (payload: any) => Promise<void>;
}

export const FornecedorFormDialog: React.FC<FornecedorFormDialogProps> = ({
  open,
  onOpenChange,
  fornecedor,
  onSave,
}) => {
  const { categorias } = useCategorias();
  const { subcategorias } = useSubcategorias();
  const categoriasDespesa = categorias.filter((c) => c.tipo === "despesa");

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipo: "fornecedor" as "fornecedor" | "cliente",
    nome: "",
    nome_fantasia: "",
    cnpj_cpf: "",
    telefone: "",
    email: "",
    endereco: "",
    contato_nome: "",
    prazo_pagamento_dias: "30",
    observacoes: "",
    categoria_padrao_id: "",
    subcategoria_padrao_id: "",
    ativo: true,
    pix_chave: "",
    pix_tipo: "cnpj",
    beneficiario_documento: "",
    beneficiario_nome: "",
    chaves_pix_adicionais: [] as ChavePixAdicional[],
    identificadores_boletos: [] as IdentificadorBoleto[],
  });

  const [novaChaveExtra, setNovaChaveExtra] = useState({ chave: "", tipo: "cnpj", descricao: "" });
  const [novoBoletoId, setNovoBoletoId] = useState({ tipo: "codigo_beneficiario", valor: "", descricao: "" });

  useEffect(() => {
    if (fornecedor) {
      setForm({
        tipo: fornecedor.tipo,
        nome: fornecedor.nome,
        nome_fantasia: fornecedor.nome_fantasia || "",
        cnpj_cpf: fornecedor.cnpj_cpf || "",
        telefone: fornecedor.telefone || "",
        email: fornecedor.email || "",
        endereco: fornecedor.endereco || "",
        contato_nome: fornecedor.contato_nome || "",
        prazo_pagamento_dias: String(fornecedor.prazo_pagamento_dias ?? 30),
        observacoes: fornecedor.observacoes || "",
        categoria_padrao_id: fornecedor.categoria_padrao_id || "",
        subcategoria_padrao_id: fornecedor.subcategoria_padrao_id || "",
        ativo: fornecedor.ativo ?? true,
        pix_chave: fornecedor.pix_chave || "",
        pix_tipo: fornecedor.pix_tipo || "cnpj",
        beneficiario_documento: fornecedor.beneficiario_documento || "",
        beneficiario_nome: fornecedor.beneficiario_nome || "",
        chaves_pix_adicionais: fornecedor.chaves_pix_adicionais || [],
        identificadores_boletos: fornecedor.identificadores_boletos || [],
      });
    } else {
      setForm({
        tipo: "fornecedor",
        nome: "",
        nome_fantasia: "",
        cnpj_cpf: "",
        telefone: "",
        email: "",
        endereco: "",
        contato_nome: "",
        prazo_pagamento_dias: "30",
        observacoes: "",
        categoria_padrao_id: "",
        subcategoria_padrao_id: "",
        ativo: true,
        pix_chave: "",
        pix_tipo: "cnpj",
        beneficiario_documento: "",
        beneficiario_nome: "",
        chaves_pix_adicionais: [],
        identificadores_boletos: [],
      });
    }
  }, [fornecedor, open]);

  const subcategoriasFiltradas = subcategorias.filter(
    (s) => s.categoria_id === form.categoria_padrao_id
  );

  const adicionarChaveExtra = () => {
    if (!novaChaveExtra.chave.trim()) return;
    setForm((prev) => ({
      ...prev,
      chaves_pix_adicionais: [...prev.chaves_pix_adicionais, { ...novaChaveExtra }],
    }));
    setNovaChaveExtra({ chave: "", tipo: "cnpj", descricao: "" });
  };

  const removerChaveExtra = (index: number) => {
    setForm((prev) => ({
      ...prev,
      chaves_pix_adicionais: prev.chaves_pix_adicionais.filter((_, i) => i !== index),
    }));
  };

  const adicionarBoletoId = () => {
    if (!novoBoletoId.valor.trim()) return;
    setForm((prev) => ({
      ...prev,
      identificadores_boletos: [...prev.identificadores_boletos, { ...novoBoletoId }],
    }));
    setNovoBoletoId({ tipo: "codigo_beneficiario", valor: "", descricao: "" });
  };

  const removerBoletoId = (index: number) => {
    setForm((prev) => ({
      ...prev,
      identificadores_boletos: prev.identificadores_boletos.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const payload = {
        tipo: form.tipo,
        nome: form.nome.trim(),
        nome_fantasia: form.nome_fantasia.trim() || null,
        cnpj_cpf: form.cnpj_cpf.trim() || null,
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
        endereco: form.endereco.trim() || null,
        contato_nome: form.contato_nome.trim() || null,
        prazo_pagamento_dias: parseInt(form.prazo_pagamento_dias, 10) || 30,
        observacoes: form.observacoes.trim() || null,
        categoria_padrao_id: form.categoria_padrao_id || null,
        subcategoria_padrao_id: form.subcategoria_padrao_id || null,
        ativo: form.ativo,
        pix_chave: form.pix_chave.trim() || null,
        pix_tipo: form.pix_chave.trim() ? form.pix_tipo : null,
        beneficiario_documento: form.beneficiario_documento.trim() || null,
        beneficiario_nome: form.beneficiario_nome.trim() || null,
        chaves_pix_adicionais: form.chaves_pix_adicionais,
        identificadores_boletos: form.identificadores_boletos,
      };

      await onSave(payload);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {fornecedor ? `Editar ${fornecedor.tipo === "fornecedor" ? "Fornecedor" : "Cliente"}` : "Novo Cadastro"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="cadastral" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="cadastral" className="flex items-center gap-2 text-xs">
                <Building2 className="h-4 w-4" /> Dados Cadastrais & Financeiros
              </TabsTrigger>
              <TabsTrigger value="bancario" className="flex items-center gap-2 text-xs">
                <QrCode className="h-4 w-4" /> Identificação Bancária (Pix & Boletos)
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: DADOS CADASTRAIS */}
            <TabsContent value="cadastral" className="space-y-3 pt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="nome" className="text-xs">Razão Social / Nome Oficial *</Label>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    required
                    placeholder="Ex: Distribuidora ABC Ltda"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="nome_fantasia" className="text-xs">Nome Fantasia / Comercial</Label>
                  <Input
                    id="nome_fantasia"
                    value={form.nome_fantasia}
                    onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                    placeholder="Ex: Distribuidora ABC"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cnpj_cpf" className="text-xs">CNPJ ou CPF</Label>
                  <Input
                    id="cnpj_cpf"
                    value={form.cnpj_cpf}
                    onChange={(e) => setForm({ ...form, cnpj_cpf: e.target.value })}
                    placeholder="00.000.000/0000-00"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="telefone" className="text-xs">Telefone / WhatsApp</Label>
                  <Input
                    id="telefone"
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                    placeholder="(31) 99999-9999"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="contato@empresa.com"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="contato_nome" className="text-xs">Pessoa de Contato / Vendedor</Label>
                  <Input
                    id="contato_nome"
                    value={form.contato_nome}
                    onChange={(e) => setForm({ ...form, contato_nome: e.target.value })}
                    placeholder="Ex: João Silva"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="prazo" className="text-xs">Prazo de Pagamento Padrão (dias)</Label>
                  <Input
                    id="prazo"
                    type="number"
                    value={form.prazo_pagamento_dias}
                    onChange={(e) => setForm({ ...form, prazo_pagamento_dias: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="endereco" className="text-xs">Endereço Completo</Label>
                <Input
                  id="endereco"
                  value={form.endereco}
                  onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  placeholder="Rua, número, bairro, cidade - UF"
                  className="text-xs"
                />
              </div>

              {/* Categorização Financeira Padrão (ETAPA 6) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                <div className="space-y-1">
                  <Label htmlFor="cat_padrao" className="text-xs font-semibold">Categoria Financeira Padrão</Label>
                  <select
                    id="cat_padrao"
                    value={form.categoria_padrao_id}
                    onChange={(e) => setForm({ ...form, categoria_padrao_id: e.target.value, subcategoria_padrao_id: "" })}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Selecione uma categoria...</option>
                    {categoriasDespesa.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="subcat_padrao" className="text-xs font-semibold">Subcategoria (Opcional)</Label>
                  <select
                    id="subcat_padrao"
                    value={form.subcategoria_padrao_id}
                    onChange={(e) => setForm({ ...form, subcategoria_padrao_id: e.target.value })}
                    disabled={!form.categoria_padrao_id}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <option value="">Nenhuma subcategoria</option>
                    {subcategoriasFiltradas.map((s) => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="obs" className="text-xs">Observações Internas</Label>
                <Textarea
                  id="obs"
                  rows={2}
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  placeholder="Informações adicionais, histórico de negociação, etc."
                  className="text-xs"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/40">
                <div>
                  <Label htmlFor="ativo" className="text-xs font-semibold cursor-pointer">Cadastro Ativo</Label>
                  <p className="text-[11px] text-muted-foreground">Fornecedores inativos são ignorados na conciliação automática</p>
                </div>
                <Switch
                  id="ativo"
                  checked={form.ativo}
                  onCheckedChange={(checked) => setForm({ ...form, ativo: checked })}
                />
              </div>
            </TabsContent>

            {/* ABA 2: IDENTIFICAÇÃO BANCÁRIA (PIX E BOLETOS) */}
            <TabsContent value="bancario" className="space-y-4 pt-3">
              <div className="p-3 bg-muted/20 rounded-lg border border-border/40 space-y-3">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <QrCode className="h-4 w-4 text-primary" /> Chave Pix Principal do Fornecedor
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="pix_tipo" className="text-xs">Tipo da Chave</Label>
                    <select
                      id="pix_tipo"
                      value={form.pix_tipo}
                      onChange={(e) => setForm({ ...form, pix_tipo: e.target.value })}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
                    >
                      <option value="cnpj">CNPJ</option>
                      <option value="cpf">CPF</option>
                      <option value="telefone">Telefone</option>
                      <option value="email">E-mail</option>
                      <option value="aleatoria">Chave Aleatória (EVP)</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <Label htmlFor="pix_chave" className="text-xs">Chave Pix</Label>
                    <Input
                      id="pix_chave"
                      value={form.pix_chave}
                      onChange={(e) => setForm({ ...form, pix_chave: e.target.value })}
                      placeholder="Chave Pix para pagamentos e conciliação"
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="bene_doc" className="text-xs">CPF/CNPJ do Beneficiário Bancário</Label>
                    <Input
                      id="bene_doc"
                      value={form.beneficiario_documento}
                      onChange={(e) => setForm({ ...form, beneficiario_documento: e.target.value })}
                      placeholder="Caso diferente do CNPJ cadastral"
                      className="text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="bene_nome" className="text-xs">Nome do Beneficiário Bancário Confirmado</Label>
                    <Input
                      id="bene_nome"
                      value={form.beneficiario_nome}
                      onChange={(e) => setForm({ ...form, beneficiario_nome: e.target.value })}
                      placeholder="Nome oficial retornado pelo banco"
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Chaves Pix Adicionais Autorizadas */}
              <div className="p-3 bg-muted/20 rounded-lg border border-border/40 space-y-2">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-primary" /> Múltiplas Chaves Pix Autorizadas
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Se o fornecedor utiliza mais de uma chave Pix (ex: chave e-mail e chave CNPJ), cadastre aqui.
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <select
                    value={novaChaveExtra.tipo}
                    onChange={(e) => setNovaChaveExtra({ ...novaChaveExtra, tipo: e.target.value })}
                    className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="cnpj">CNPJ</option>
                    <option value="cpf">CPF</option>
                    <option value="telefone">Telefone</option>
                    <option value="email">E-mail</option>
                    <option value="aleatoria">Aleatória</option>
                  </select>

                  <Input
                    placeholder="Chave Pix adicional..."
                    value={novaChaveExtra.chave}
                    onChange={(e) => setNovaChaveExtra({ ...novaChaveExtra, chave: e.target.value })}
                    className="h-8 text-xs flex-1 min-w-[150px]"
                  />

                  <Input
                    placeholder="Descrição / Referência..."
                    value={novaChaveExtra.descricao}
                    onChange={(e) => setNovaChaveExtra({ ...novaChaveExtra, descricao: e.target.value })}
                    className="h-8 text-xs w-36"
                  />

                  <Button type="button" size="sm" variant="secondary" onClick={adicionarChaveExtra} className="h-8 text-xs">
                    Adicionar
                  </Button>
                </div>

                {form.chaves_pix_adicionais.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    {form.chaves_pix_adicionais.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded bg-background/50 border text-xs">
                        <span className="font-mono">{item.chave} ({item.tipo.toUpperCase()}) {item.descricao ? `- ${item.descricao}` : ""}</span>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removerChaveExtra(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Identificadores para Conciliação de Boletos (ETAPA 4) */}
              <div className="p-3 bg-muted/20 rounded-lg border border-border/40 space-y-2">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-primary" /> Identificadores para Conciliação de Boletos
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Cadastre códigos de cedente/beneficiário, convênios ou números recorrentes presentes nos boletos deste fornecedor.
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <select
                    value={novoBoletoId.tipo}
                    onChange={(e) => setNovoBoletoId({ ...novoBoletoId, tipo: e.target.value })}
                    className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="codigo_beneficiario">Código do Beneficiário</option>
                    <option value="cnpj_beneficiario">CNPJ do Beneficiário no Boleto</option>
                    <option value="convenio">Código do Convênio</option>
                    <option value="linha_digitavel">Linha Digitável Parcial</option>
                  </select>

                  <Input
                    placeholder="Valor do identificador..."
                    value={novoBoletoId.valor}
                    onChange={(e) => setNovoBoletoId({ ...novoBoletoId, valor: e.target.value })}
                    className="h-8 text-xs flex-1 min-w-[150px]"
                  />

                  <Button type="button" size="sm" variant="secondary" onClick={adicionarBoletoId} className="h-8 text-xs">
                    Adicionar
                  </Button>
                </div>

                {form.identificadores_boletos.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    {form.identificadores_boletos.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded bg-background/50 border text-xs">
                        <span className="font-mono">{item.tipo}: {item.valor}</span>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removerBoletoId(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Histórico de Alterações de Identificadores Bancários */}
              {fornecedor?.historico_identificadores && fornecedor.historico_identificadores.length > 0 && (
                <div className="p-3 bg-muted/10 rounded-lg border border-border/30 space-y-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <History className="h-3 w-3" /> Trilha de Auditoria Bancária
                  </span>
                  <div className="max-h-24 overflow-y-auto space-y-1 text-[10px] text-muted-foreground font-mono">
                    {fornecedor.historico_identificadores.map((h: any, i) => (
                      <div key={i} className="border-b border-border/20 pb-0.5">
                        {h.alterado_em?.slice(0, 16)}: Pix alterado de &quot;{h.pix_anterior || "vazio"}&quot; para &quot;{h.pix_novo || "vazio"}&quot;
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={saving || !form.nome.trim()}>
              {saving ? "Salvando..." : fornecedor ? "Salvar Alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
