import { useRef, useState } from "react";
import { Bus, Camera, CreditCard, Home, Loader2, Trash2, Upload, UserCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";

export type ColaboradorTipo = "funcionario" | "socio" | "folguista";

export interface EquipeFormValues {
  nome: string;
  foto_url: string;
  foto_posicao: string;
  tipo: ColaboradorTipo;
  cargo: string;
  salario_bruto: string;
  valor_pro_labore: string;
  valor_diaria: string;
  dia_pagamento: string;
  vale_transporte: string;
  vale_transporte_diario: string;
  vale_refeicao: string;
  outros_beneficios: string;
  data_admissao: string;
  carga_horaria_semanal: string;
  status: "ativo" | "experiencia";
  cpf: string;
  rg: string;
  data_nascimento: string;
  telefone: string;
  email: string;
  endereco: string;
  contato_emergencia_1: string;
  contato_emergencia_2: string;
  pix_tipo: "cpf" | "cnpj" | "telefone" | "email" | "aleatoria";
  pix_chave: string;
  banco_nome: string;
  banco_agencia: string;
  banco_conta: string;
  linha_onibus: string;
  valor_passagem: string;
}

export const createEquipeFormValues = (): EquipeFormValues => ({
  nome: "", foto_url: "", foto_posicao: "50% 15%", tipo: "funcionario", cargo: "", salario_bruto: "", valor_pro_labore: "",
  valor_diaria: "", dia_pagamento: "16", vale_transporte: "0", vale_transporte_diario: "0",
  vale_refeicao: "0", outros_beneficios: "0", data_admissao: new Date().toISOString().slice(0, 10),
  carga_horaria_semanal: "44", status: "experiencia", cpf: "", rg: "", data_nascimento: "",
  telefone: "", email: "", endereco: "", contato_emergencia_1: "", contato_emergencia_2: "",
  pix_tipo: "cpf", pix_chave: "", banco_nome: "", banco_agencia: "", banco_conta: "",
  linha_onibus: "", valor_passagem: "6.25",
});

const numberValue = (value: string) => Number(String(value).replace(",", ".")) || 0;
const digits = (value: string) => value.replace(/\D/g, "");

export function normalizePixKey(tipo: EquipeFormValues["pix_tipo"], chave: string) {
  const value = chave.trim();
  if (tipo === "cpf" || tipo === "cnpj" || tipo === "telefone") return digits(value);
  if (tipo === "email") return value.toLowerCase();
  return value.replace(/\s/g, "").toLowerCase();
}

export function validateEquipeForm(values: EquipeFormValues) {
  const errors: Partial<Record<keyof EquipeFormValues, string>> = {};
  if (!values.nome.trim()) errors.nome = "Informe o nome completo.";

  const financialFields: Array<keyof EquipeFormValues> = [
    "salario_bruto", "valor_pro_labore", "valor_diaria", "vale_transporte",
    "vale_transporte_diario", "vale_refeicao", "outros_beneficios", "valor_passagem",
  ];
  financialFields.forEach((field) => {
    const raw = values[field];
    if (raw && (!Number.isFinite(numberValue(raw)) || numberValue(raw) < 0)) errors[field] = "O valor não pode ser negativo.";
  });

  const day = Number(values.dia_pagamento);
  if (!Number.isInteger(day) || day < 1 || day > 28) errors.dia_pagamento = "Escolha um dia entre 1 e 28.";

  const pix = normalizePixKey(values.pix_tipo, values.pix_chave);
  if (pix) {
    if (values.pix_tipo === "cpf" && pix.length !== 11) errors.pix_chave = "A chave CPF deve ter 11 dígitos.";
    if (values.pix_tipo === "cnpj" && pix.length !== 14) errors.pix_chave = "A chave CNPJ deve ter 14 dígitos.";
    if (values.pix_tipo === "telefone" && (pix.length < 10 || pix.length > 13)) errors.pix_chave = "Informe o telefone com DDD.";
    if (values.pix_tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pix)) errors.pix_chave = "Informe um e-mail válido.";
    if (values.pix_tipo === "aleatoria" && pix.length < 16) errors.pix_chave = "A chave aleatória parece incompleta.";
  }
  return errors;
}

export function buildColaboradorPayload(values: EquipeFormValues) {
  return {
    nome: values.nome.trim(),
    foto_url: values.foto_url ? values.foto_url.trim() || null : null,
    foto_posicao: values.foto_posicao || "50% 15%",
    tipo: values.tipo, cargo: values.cargo.trim() || null,
    salario_bruto: values.tipo === "funcionario" ? numberValue(values.salario_bruto) : 0,
    valor_diaria: values.tipo === "folguista" ? numberValue(values.valor_diaria) : 0,
    valor_pro_labore: values.tipo === "socio" ? numberValue(values.valor_pro_labore) : 0,
    dia_pagamento: Number(values.dia_pagamento) || 16,
    vale_transporte: numberValue(values.vale_transporte),
    vale_transporte_diario: numberValue(values.vale_transporte_diario),
    vale_refeicao: numberValue(values.vale_refeicao), outros_beneficios: numberValue(values.outros_beneficios),
    data_admissao: values.data_admissao || null, carga_horaria_semanal: numberValue(values.carga_horaria_semanal) || 44,
    status: values.tipo === "socio" ? "ativo" : values.status,
    cpf: values.cpf.trim() || null, rg: values.rg.trim() || null, data_nascimento: values.data_nascimento || null,
    telefone: values.telefone.trim() || null, email: values.email.trim().toLowerCase() || null,
    endereco: values.endereco.trim() || null, contato_emergencia_1: values.contato_emergencia_1.trim() || null,
    contato_emergencia_2: values.contato_emergencia_2.trim() || null, pix_tipo: values.pix_chave ? values.pix_tipo : null,
    pix_chave: values.pix_chave ? normalizePixKey(values.pix_tipo, values.pix_chave) : null,
    banco_nome: values.banco_nome.trim() || null, banco_agencia: values.banco_agencia.trim() || null,
    banco_conta: values.banco_conta.trim() || null, linha_onibus: values.linha_onibus.trim() || null,
    valor_passagem: numberValue(values.valor_passagem),
  };
}

interface Props {
  values: EquipeFormValues;
  onChange: (values: EquipeFormValues) => void;
  errors?: Partial<Record<keyof EquipeFormValues, string>>;
}

export function EquipeForm({ values, onChange, errors = {} }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof EquipeFormValues>(key: K, value: EquipeFormValues[K]) => onChange({ ...values, [key]: value });
  const field = (key: keyof EquipeFormValues, label: string, type = "text", placeholder?: string) => (
    <div className="space-y-2">
      <Label htmlFor={`equipe-${key}`}>{label}</Label>
      <Input id={`equipe-${key}`} type={type} step={type === "number" ? "0.01" : undefined} value={values[key]} onChange={(e) => set(key, e.target.value as never)} placeholder={placeholder} aria-invalid={!!errors[key]} />
      {errors[key] && <p className="text-xs text-destructive" role="alert">{errors[key]}</p>}
    </div>
  );

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Arquivo inválido",
        description: "Selecione uma imagem válida (JPG, PNG ou WEBP).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Imagem muito grande",
        description: "A foto deve ter no máximo 5MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || "public";
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `equipe-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const canonicalUrl = publicUrl.replace(/^http:\/\/[^/]+\/supabase-proxy/, "https://hdeguzxkdvebdrrutbnx.supabase.co");
      set("foto_url", canonicalUrl);
      toast({
        title: "Foto carregada",
        description: "A foto foi selecionada. Salve o formulário para confirmar.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      toast({
        title: "Erro no upload",
        description: `Não foi possível enviar a foto: ${message}`,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const initials = (values.nome || "Colaborador")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "CO";

  return <div className="space-y-8">
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 font-semibold"><Camera className="h-4 w-4 text-primary" /> Foto do colaborador</h2>
      <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-4 rounded-xl border border-border/60 bg-muted/20">
        <div className="relative group flex-shrink-0 self-center sm:self-auto">
          <Avatar className="h-24 w-24 border-2 border-border/80 shadow-md">
            <AvatarImage
              src={values.foto_url || undefined}
              className="object-cover"
              style={{ objectPosition: values.foto_posicao || "50% 15%" }}
            />
            <AvatarFallback className="bg-primary/15 text-2xl font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-background/80 flex items-center justify-center backdrop-blur-xs">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3 text-center sm:text-left">
          <div className="space-y-1">
            <p className="text-sm font-medium">Foto de perfil</p>
            <p className="text-xs text-muted-foreground">
              Formatos aceitos: JPG, PNG ou WEBP. Tamanho máximo: 5MB.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              className="hidden"
              onChange={handleUploadPhoto}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {values.foto_url ? "Alterar foto" : "Escolher foto"}
                </>
              )}
            </Button>

            {values.foto_url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={uploading}
                onClick={() => set("foto_url", "")}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover
              </Button>
            )}
          </div>

          {values.foto_url && (
            <div className="pt-2 flex items-center gap-2 justify-center sm:justify-start text-xs text-muted-foreground">
              <Label htmlFor="equipe-foto-posicao" className="text-xs">Enquadramento:</Label>
              <Select
                value={values.foto_posicao || "50% 15%"}
                onValueChange={(v) => set("foto_posicao", v)}
              >
                <SelectTrigger id="equipe-foto-posicao" className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50% 15%">Rosto / Superior (Padrão)</SelectItem>
                  <SelectItem value="50% 0%">Topo absoluto</SelectItem>
                  <SelectItem value="50% 50%">Centro</SelectItem>
                  <SelectItem value="50% 85%">Inferior</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    </section>

    <section className="space-y-4 border-t border-border/50 pt-6">
      <h2 className="flex items-center gap-2 font-semibold"><UserCheck className="h-4 w-4 text-primary" /> Informações profissionais</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Categoria</Label><Select value={values.tipo} onValueChange={(v: ColaboradorTipo) => set("tipo", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="funcionario">Funcionário fixo</SelectItem><SelectItem value="folguista">Folguista por diária</SelectItem><SelectItem value="socio">Sócio</SelectItem></SelectContent></Select></div>
        {field("nome", "Nome completo", "text", "Nome do colaborador")}
        {field("cargo", "Cargo", "text", "Atendente, caixa, gerente...")}
        {values.tipo === "funcionario" && field("salario_bruto", "Salário mensal (R$)", "number")}
        {values.tipo === "folguista" && field("valor_diaria", "Valor da diária (R$)", "number")}
        {values.tipo === "socio" && field("valor_pro_labore", "Pró-labore mensal (R$)", "number")}
        {field("dia_pagamento", values.tipo === "socio" ? "Dia do pró-labore" : values.tipo === "funcionario" ? "Dia do salário" : "Dia de referência", "number")}
        {field("data_admissao", values.tipo === "socio" ? "Data de entrada" : "Data de admissão", "date")}
        {values.tipo !== "socio" && field("carga_horaria_semanal", "Carga horária semanal", "number")}
        {values.tipo === "funcionario" && <div className="space-y-2"><Label>Status</Label><Select value={values.status} onValueChange={(v: "ativo" | "experiencia") => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="experiencia">Em experiência</SelectItem><SelectItem value="ativo">Efetivo</SelectItem></SelectContent></Select></div>}
      </div>
    </section>

    <section className="space-y-4 border-t border-border/50 pt-6">
      <h2 className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4 text-primary" /> Pagamento e Pix</h2>
      <p className="text-sm text-muted-foreground">A chave será usada para reconhecer automaticamente pagamentos sincronizados do Divipay.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Tipo da chave Pix</Label><Select value={values.pix_tipo} onValueChange={(v: EquipeFormValues["pix_tipo"]) => set("pix_tipo", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cpf">CPF</SelectItem><SelectItem value="cnpj">CNPJ</SelectItem><SelectItem value="telefone">Telefone</SelectItem><SelectItem value="email">E-mail</SelectItem><SelectItem value="aleatoria">Aleatória</SelectItem></SelectContent></Select></div>
        {field("pix_chave", "Chave Pix", "text", "Opcional, mas necessária para conciliação automática")}
        {field("banco_nome", "Banco")}{field("banco_agencia", "Agência")}{field("banco_conta", "Conta")}
      </div>
    </section>

    {values.tipo !== "socio" && <section className="space-y-4 border-t border-border/50 pt-6">
      <h2 className="flex items-center gap-2 font-semibold"><Bus className="h-4 w-4 text-primary" /> Transporte semanal e benefícios</h2>
      <p className="text-sm text-muted-foreground">Passagens e diferença de Uber serão consolidadas como Transporte; metas permanecem separadas nos relatórios.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field("linha_onibus", "Linha de ônibus")}{field("valor_passagem", "Passagem por trecho (R$)", "number")}{field("vale_transporte_diario", "Uber diário base (R$)", "number")}
        {field("vale_transporte", "Transporte fixo (R$)", "number")}{field("vale_refeicao", "Vale-refeição (R$)", "number")}{field("outros_beneficios", "Outros benefícios (R$)", "number")}
      </div>
    </section>}

    <section className="space-y-4 border-t border-border/50 pt-6">
      <h2 className="flex items-center gap-2 font-semibold"><Home className="h-4 w-4 text-primary" /> Dossiê pessoal</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field("cpf", "CPF")}{field("rg", "RG")}{field("data_nascimento", "Nascimento", "date")}{field("telefone", "Telefone")}{field("email", "E-mail", "email")}{field("endereco", "Endereço")}{field("contato_emergencia_1", "Contato de emergência 1")}{field("contato_emergencia_2", "Contato de emergência 2")}
      </div>
    </section>
  </div>;
}
