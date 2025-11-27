
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useToast } from "@/shared/hooks/use-toast";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { AccountSelector } from "./AccountSelector";
import { TagsInput } from "./TagsInput";
import { AttachmentUploader } from "./AttachmentUploader";
import { useAttachments } from "../hooks/useAttachments";
import { PaymentMethod, AnexoTransacao } from "../types";

interface Receita {
  id: string;
  descricao: string;
  valor: number;
  categoria: string;
  data: string;
  tipo: 'fixa' | 'variavel';
  metodo_pagamento?: PaymentMethod | null;
  conta_id?: string | null;
  observacoes?: string | null;
  tags?: string[];
}

interface EditarReceitaModalProps {
  receita: Receita | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (receita: Receita, tags: string[]) => void;
}

export const EditarReceitaModal = ({ receita, isOpen, onClose, onSave }: EditarReceitaModalProps) => {
  const { toast } = useToast();
  const { categoriasReceita } = useCategorias();
  const { fetchAttachments } = useAttachments();
  
  const [formData, setFormData] = useState({
    descricao: '',
    valor: '',
    categoria: '',
    data: '',
    tipo: 'variavel' as 'fixa' | 'variavel',
    metodo_pagamento: null as PaymentMethod | null,
    conta_id: null as string | null,
    observacoes: '',
    tags: [] as string[]
  });

  const [attachments, setAttachments] = useState<AnexoTransacao[]>([]);

  useEffect(() => {
    if (receita) {
      setFormData({
        descricao: receita.descricao,
        valor: receita.valor.toString(),
        categoria: receita.categoria,
        data: receita.data,
        tipo: receita.tipo,
        metodo_pagamento: receita.metodo_pagamento || null,
        conta_id: receita.conta_id || null,
        observacoes: receita.observacoes || '',
        tags: receita.tags || []
      });
    }
  }, [receita]);

  // Fetch attachments when modal opens
  useEffect(() => {
    const loadAttachments = async () => {
      if (receita?.id && isOpen) {
        const anexos = await fetchAttachments('receita', receita.id);
        setAttachments(anexos);
      }
    };
    loadAttachments();
  }, [receita?.id, isOpen]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.descricao || !formData.valor || !formData.categoria || !formData.data) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive"
      });
      return;
    }

    if (!receita) return;

    const receitaAtualizada: Receita = {
      ...receita,
      descricao: formData.descricao,
      valor: parseFloat(formData.valor),
      categoria: formData.categoria,
      data: formData.data,
      tipo: formData.tipo,
      metodo_pagamento: formData.metodo_pagamento,
      conta_id: formData.conta_id,
      observacoes: formData.observacoes || null,
      tags: formData.tags
    };

    onSave(receitaAtualizada, formData.tags);
    onClose();
    
    toast({
      title: "Sucesso!",
      description: "Receita atualizada com sucesso",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Receita</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição *</Label>
            <Input
              id="descricao"
              value={formData.descricao}
              onChange={(e) => setFormData({...formData, descricao: e.target.value})}
              placeholder="Ex: Salário, Freelance, Aluguel..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Valor *</Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              value={formData.valor}
              onChange={(e) => setFormData({...formData, valor: e.target.value})}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="categoria">Categoria *</Label>
            <select
              id="categoria"
              value={formData.categoria}
              onChange={(e) => setFormData({...formData, categoria: e.target.value})}
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 [&>option]:bg-background [&>option]:text-foreground"
            >
              <option value="">Selecione uma categoria</option>
              {categoriasReceita.map(categoria => (
                <option key={categoria.id} value={categoria.nome}>
                  {categoria.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data">Data *</Label>
            <Input
              id="data"
              type="date"
              value={formData.data}
              onChange={(e) => setFormData({...formData, data: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo de Receita</Label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="tipo"
                  value="fixa"
                  checked={formData.tipo === 'fixa'}
                  onChange={(e) => setFormData({...formData, tipo: e.target.value as 'fixa' | 'variavel'})}
                  className="text-orange-600"
                />
                <span>Receita Fixa</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="tipo"
                  value="variavel"
                  checked={formData.tipo === 'variavel'}
                  onChange={(e) => setFormData({...formData, tipo: e.target.value as 'fixa' | 'variavel'})}
                  className="text-orange-600"
                />
                <span>Receita Variável</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="metodo_pagamento">Método de Pagamento</Label>
            <PaymentMethodSelector
              value={formData.metodo_pagamento}
              onChange={(method) => setFormData({...formData, metodo_pagamento: method})}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="conta">Conta</Label>
            <AccountSelector
              value={formData.conta_id}
              onChange={(accountId) => setFormData({...formData, conta_id: accountId})}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 500) {
                  setFormData({...formData, observacoes: value});
                }
              }}
              placeholder="Adicione observações sobre esta receita..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">
              {formData.observacoes.length}/500 caracteres
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <TagsInput
              value={formData.tags}
              onChange={(tags) => setFormData({...formData, tags})}
              placeholder="Digite uma tag e pressione Enter"
            />
          </div>

          <div className="space-y-2">
            <Label>Anexos</Label>
            <AttachmentUploader
              transacaoId={receita?.id}
              transacaoTipo="receita"
              attachments={attachments}
              onUploadSuccess={(anexo) => setAttachments(prev => [...prev, anexo])}
              onDeleteSuccess={(anexoId) => setAttachments(prev => prev.filter(a => a.id !== anexoId))}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
              Salvar Alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
