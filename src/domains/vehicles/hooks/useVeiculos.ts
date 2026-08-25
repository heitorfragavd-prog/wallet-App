import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export interface Veiculo {
  id: string;
  marca: string;
  modelo: string;
  ano: string;
  placa?: string;
  cor?: string;
  combustivel?: string;
  data_aquisicao?: string;
  quilometragem: number;
  created_at?: string;
  updated_at?: string;
}

const fetchVeiculosData = async (workspaceId?: string) => {
  if (!workspaceId) return [];

  const { data, error } = await supabase
    .from('veiculos')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('useVeiculos', 'Erro ao buscar veículos', { error: error.message });
    throw error;
  }
  return (data || []) as Veiculo[];
};

export const useVeiculos = () => {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const qc = useQueryClient();

  const queryKey = ["veiculos", activeWorkspace?.id];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchVeiculosData(activeWorkspace?.id),
    enabled: !!activeWorkspace?.id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const adicionarVeiculo = async (novoVeiculo: Omit<Veiculo, 'id'>) => {
    try {
      if (!activeWorkspace?.id) {
        toast({
          title: "Erro",
          description: "Workspace não selecionado",
          variant: "destructive"
        });
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado",
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('veiculos')
        .insert([{
          ...novoVeiculo,
          user_id: user.id,
          workspace_id: activeWorkspace.id
        }]);

      if (error) {
        logger.error('useVeiculos', 'Erro ao adicionar veículo', { error: error.message });
        toast({
          title: "Erro",
          description: "Erro ao adicionar veículo",
          variant: "destructive"
        });
        return;
      }

      await qc.invalidateQueries({ queryKey: ["veiculos"] });
      toast({
        title: "Sucesso",
        description: "Veículo adicionado com sucesso!"
      });
    } catch (error) {
      logger.error('useVeiculos', 'Erro catch ao adicionar veículo', { error: error instanceof Error ? error.message : String(error) });
      toast({
        variant: "destructive"
      });
    }
  };

  const editarVeiculo = async (veiculoEditado: Veiculo) => {
    try {
      let q = supabase
        .from('veiculos')
        .update({
          marca: veiculoEditado.marca,
          modelo: veiculoEditado.modelo,
          ano: veiculoEditado.ano,
          placa: veiculoEditado.placa,
          cor: veiculoEditado.cor,
          combustivel: veiculoEditado.combustivel,
          data_aquisicao: veiculoEditado.data_aquisicao,
          quilometragem: veiculoEditado.quilometragem
        })
        .eq('id', veiculoEditado.id);
      if (activeWorkspace?.id) {
        q = q.eq('workspace_id', activeWorkspace.id);
      }

      const { error } = await q;

      if (error) {
        logger.error('useVeiculos', 'Erro ao editar veículo', { error: error.message });
        toast({
          title: "Erro",
          description: "Erro ao editar veículo",
          variant: "destructive"
        });
        return;
      }

      await qc.invalidateQueries({ queryKey: ["veiculos"] });
      toast({
        title: "Sucesso",
        description: "Veículo editado com sucesso!"
      });
    } catch (error) {
      logger.error('useVeiculos', 'Erro catch ao editar veículo', { error: error instanceof Error ? error.message : String(error) });
      toast({
        variant: "destructive"
      });
    }
  };

  const excluirVeiculo = async (id: string) => {
    try {
      let q = supabase
        .from('veiculos')
        .delete()
        .eq('id', id);
      if (activeWorkspace?.id) {
        q = q.eq('workspace_id', activeWorkspace.id);
      }

      const { error } = await q;

      if (error) {
        logger.error('useVeiculos', 'Erro ao excluir veículo', { error: error.message });
        toast({
          title: "Erro",
          description: "Erro ao excluir veículo",
          variant: "destructive"
        });
        return;
      }

      await qc.invalidateQueries({ queryKey: ["veiculos"] });
      toast({
        title: "Sucesso",
        description: "Veículo excluído com sucesso!"
      });
    } catch (error) {
      logger.error('useVeiculos', 'Erro catch ao excluir veículo', { error: error instanceof Error ? error.message : String(error) });
      toast({
        variant: "destructive"
      });
    }
  };

  const atualizarQuilometragem = async (id: string, novaQuilometragem: number) => {
    try {
      const { error } = await supabase
        .from('veiculos')
        .update({ quilometragem: novaQuilometragem })
        .eq('id', id);

      if (error) {
        logger.error('useVeiculos', 'Erro ao atualizar quilometragem', { id, error: error.message });
        toast({
          title: "Erro",
          description: "Erro ao atualizar quilometragem",
          variant: "destructive"
        });
        return;
      }

      await qc.invalidateQueries({ queryKey: ["veiculos"] });
      toast({
        title: "Sucesso",
        description: "Quilometragem atualizada com sucesso!"
      });
    } catch (error) {
      logger.error('useVeiculos', 'Erro catch ao atualizar quilometragem', { error: error instanceof Error ? error.message : String(error) });
      toast({
        variant: "destructive"
      });
    }
  };

  return {
    veiculos: query.data ?? [],
    loading: query.isLoading,
    adicionarVeiculo,
    editarVeiculo,
    excluirVeiculo,
    atualizarQuilometragem,
    refetch: () => qc.invalidateQueries({ queryKey: ["veiculos"] })
  };
};