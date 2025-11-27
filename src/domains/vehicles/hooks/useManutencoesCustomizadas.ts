import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { ManutencaoCustomizada } from "../types";

interface AdicionarCustomizadaInput {
  veiculo_id: string;
  nome: string;
  sistema?: string;
  intervalo_km?: number;
  data_prevista?: string;
  ativo?: boolean;
  criar_lembrete?: boolean;
  dias_antecedencia?: number;
}

interface AtualizarCustomizadaInput {
  id: string;
  nome?: string;
  sistema?: string;
  intervalo_km?: number;
  data_prevista?: string;
  ativo?: boolean;
}

export const useManutencoesCustomizadas = (veiculoId?: string) => {
  const [customizadas, setCustomizadas] = useState<ManutencaoCustomizada[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCustomizadas = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('manutencoes_customizadas')
        .select('*')
        .order('created_at', { ascending: false });

      // Se veiculoId for fornecido, filtrar por veículo
      if (veiculoId) {
        query = query.eq('veiculo_id', veiculoId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar manutenções customizadas:', error);
        toast({
          title: "Erro",
          description: "Erro ao carregar manutenções customizadas",
          variant: "destructive"
        });
        return;
      }

      setCustomizadas(data || []);
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar manutenções customizadas",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const adicionarCustomizada = async (input: AdicionarCustomizadaInput) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado",
          variant: "destructive"
        });
        return;
      }

      // 1. Criar manutenção customizada
      const { data: customizada, error: customizadaError } = await supabase
        .from('manutencoes_customizadas')
        .insert([{
          user_id: user.id,
          veiculo_id: input.veiculo_id,
          nome: input.nome,
          sistema: input.sistema,
          intervalo_km: input.intervalo_km,
          data_prevista: input.data_prevista,
          ativo: input.ativo ?? true
        }])
        .select()
        .single();

      if (customizadaError) {
        console.error('Erro ao adicionar manutenção customizada:', customizadaError);
        toast({
          title: "Erro",
          description: "Erro ao adicionar manutenção customizada",
          variant: "destructive"
        });
        return;
      }

      // 2. Se criar_lembrete for true e houver data_prevista, criar lembrete
      if (input.criar_lembrete && input.data_prevista && customizada) {
        const { error: lembreteError } = await supabase
          .from('lembretes_manutencao')
          .insert([{
            user_id: user.id,
            veiculo_id: input.veiculo_id,
            manutencao_id: customizada.id,
            tipo_manutencao: 'customizada',
            data_prevista: input.data_prevista,
            dias_antecedencia: input.dias_antecedencia ?? 7,
            status: 'pendente'
          }]);

        if (lembreteError) {
          console.error('Erro ao criar lembrete:', lembreteError);
          // Não falhar a operação se o lembrete não for criado
          toast({
            title: "Aviso",
            description: "Manutenção criada, mas não foi possível criar o lembrete",
            variant: "default"
          });
        }
      }

      setCustomizadas(prev => [customizada, ...prev]);
      toast({
        title: "Sucesso",
        description: "Manutenção customizada adicionada com sucesso!"
      });

      return customizada;
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao adicionar manutenção customizada",
        variant: "destructive"
      });
    }
  };

  const atualizarCustomizada = async (input: AtualizarCustomizadaInput) => {
    try {
      const updateData: any = {};
      
      if (input.nome !== undefined) {
        updateData.nome = input.nome;
      }
      
      if (input.sistema !== undefined) {
        updateData.sistema = input.sistema;
      }
      
      if (input.intervalo_km !== undefined) {
        updateData.intervalo_km = input.intervalo_km;
      }
      
      if (input.data_prevista !== undefined) {
        updateData.data_prevista = input.data_prevista;
      }
      
      if (input.ativo !== undefined) {
        updateData.ativo = input.ativo;
      }

      const { data, error } = await supabase
        .from('manutencoes_customizadas')
        .update(updateData)
        .eq('id', input.id)
        .select()
        .single();

      if (error) {
        console.error('Erro ao atualizar manutenção customizada:', error);
        toast({
          title: "Erro",
          description: "Erro ao atualizar manutenção customizada",
          variant: "destructive"
        });
        return;
      }

      setCustomizadas(prev => prev.map(c => c.id === input.id ? data : c));
      toast({
        title: "Sucesso",
        description: "Manutenção customizada atualizada com sucesso!"
      });

      return data;
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar manutenção customizada",
        variant: "destructive"
      });
    }
  };

  const removerCustomizada = async (id: string) => {
    try {
      // 1. Cancelar lembretes associados
      const { error: lembreteError } = await supabase
        .from('lembretes_manutencao')
        .update({ status: 'cancelado' })
        .eq('manutencao_id', id)
        .eq('tipo_manutencao', 'customizada')
        .eq('status', 'pendente');

      if (lembreteError) {
        console.error('Erro ao cancelar lembretes:', lembreteError);
        // Continuar mesmo se houver erro ao cancelar lembretes
      }

      // 2. Remover manutenção customizada
      const { error } = await supabase
        .from('manutencoes_customizadas')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Erro ao remover manutenção customizada:', error);
        toast({
          title: "Erro",
          description: "Erro ao remover manutenção customizada",
          variant: "destructive"
        });
        return;
      }

      setCustomizadas(prev => prev.filter(c => c.id !== id));
      toast({
        title: "Sucesso",
        description: "Manutenção customizada removida com sucesso!"
      });
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao remover manutenção customizada",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchCustomizadas();
  }, [veiculoId]);

  return {
    customizadas,
    loading,
    fetchCustomizadas,
    adicionarCustomizada,
    atualizarCustomizada,
    removerCustomizada,
    refetch: fetchCustomizadas
  };
};
