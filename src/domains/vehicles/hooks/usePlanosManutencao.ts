import { logger } from "@/core/logging/LoggerService";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { PlanoManutencaoVeiculo } from "../types";
import { ManutencaoService } from "../services/ManutencaoService";

interface AdicionarPlanoInput {
  veiculo_id: string;
  tipo_manutencao_id: string;
  intervalo_km: number;
  ativo?: boolean;
  criar_lembrete?: boolean;
  dias_antecedencia?: number;
}

interface AtualizarPlanoInput {
  id: string;
  intervalo_km?: number;
  ativo?: boolean;
}

export const usePlanosManutencao = (veiculoId?: string) => {
  const [planos, setPlanos] = useState<PlanoManutencaoVeiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPlanos = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('planos_manutencao_veiculo')
        .select(`
          *,
          tipo_manutencao:tipos_manutencao(*)
        `)
        .order('created_at', { ascending: false });

      // Se veiculoId for fornecido, filtrar por veículo
      if (veiculoId) {
        query = query.eq('veiculo_id', veiculoId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro ao buscar planos de manutenção:', error) });
        toast({
          title: "Erro",
          description: "Erro ao carregar planos de manutenção",
          variant: "destructive"
        });
        return;
      }

      setPlanos(data || []);
    } catch (error) {
      logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro:', error) });
      toast({
        title: "Erro",
        description: "Erro ao carregar planos de manutenção",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calcularDataPrevista = async (
    veiculoId: string,
    intervaloKm: number
  ): Promise<Date | null> => {
    return ManutencaoService.calcularDataPrevista(veiculoId, intervaloKm);
  };

  const adicionarPlano = async (input: AdicionarPlanoInput) => {
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

      // 1. Criar plano de manutenção
      const { data: plano, error: planoError } = await supabase
        .from('planos_manutencao_veiculo')
        .insert([{
          user_id: user.id,
          veiculo_id: input.veiculo_id,
          tipo_manutencao_id: input.tipo_manutencao_id,
          intervalo_km: input.intervalo_km,
          ativo: input.ativo ?? true
        }])
        .select(`
          *,
          tipo_manutencao:tipos_manutencao(*)
        `)
        .single();

      if (planoError) {
        logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro ao adicionar plano:', planoError) });
        
        // Verificar se é erro de duplicação
        if (planoError.code === '23505') {
          toast({
            title: "Erro",
            description: "Este tipo de manutenção já está adicionado ao veículo",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Erro",
            description: "Erro ao adicionar plano de manutenção",
            variant: "destructive"
          });
        }
        return;
      }

      // 2. Se criar_lembrete for true, calcular data prevista e criar lembrete
      if (input.criar_lembrete && plano) {
        const dataPrevista = await calcularDataPrevista(
          input.veiculo_id,
          input.intervalo_km
        );

        if (dataPrevista) {
          const { error: lembreteError } = await supabase
            .from('lembretes_manutencao')
            .insert([{
              user_id: user.id,
              veiculo_id: input.veiculo_id,
              manutencao_id: plano.id,
              tipo_manutencao: 'plano',
              data_prevista: dataPrevista.toISOString().split('T')[0],
              dias_antecedencia: input.dias_antecedencia ?? 7,
              status: 'pendente'
            }]);

          if (lembreteError) {
            logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro ao criar lembrete:', lembreteError) });
            // Não falhar a operação se o lembrete não for criado
            toast({
              title: "Aviso",
              description: "Plano criado, mas não foi possível criar o lembrete",
              variant: "default"
            });
          }
        }
      }

      setPlanos(prev => [plano, ...prev]);
      toast({
        title: "Sucesso",
        description: "Plano de manutenção adicionado com sucesso!"
      });

      return plano;
    } catch (error) {
      logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro:', error) });
      toast({
        title: "Erro",
        description: "Erro ao adicionar plano de manutenção",
        variant: "destructive"
      });
    }
  };

  const atualizarPlano = async (input: AtualizarPlanoInput) => {
    try {
      const updateData: any = {};
      
      if (input.intervalo_km !== undefined) {
        updateData.intervalo_km = input.intervalo_km;
      }
      
      if (input.ativo !== undefined) {
        updateData.ativo = input.ativo;
      }

      const { data, error } = await supabase
        .from('planos_manutencao_veiculo')
        .update(updateData)
        .eq('id', input.id)
        .select(`
          *,
          tipo_manutencao:tipos_manutencao(*)
        `)
        .single();

      if (error) {
        logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro ao atualizar plano:', error) });
        toast({
          title: "Erro",
          description: "Erro ao atualizar plano de manutenção",
          variant: "destructive"
        });
        return;
      }

      setPlanos(prev => prev.map(p => p.id === input.id ? data : p));
      toast({
        title: "Sucesso",
        description: "Plano de manutenção atualizado com sucesso!"
      });

      return data;
    } catch (error) {
      logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro:', error) });
      toast({
        title: "Erro",
        description: "Erro ao atualizar plano de manutenção",
        variant: "destructive"
      });
    }
  };

  const removerPlano = async (id: string) => {
    try {
      // 1. Cancelar lembretes associados
      const { error: lembreteError } = await supabase
        .from('lembretes_manutencao')
        .update({ status: 'cancelado' })
        .eq('manutencao_id', id)
        .eq('tipo_manutencao', 'plano')
        .eq('status', 'pendente');

      if (lembreteError) {
        logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro ao cancelar lembretes:', lembreteError) });
        // Continuar mesmo se houver erro ao cancelar lembretes
      }

      // 2. Remover plano
      const { error } = await supabase
        .from('planos_manutencao_veiculo')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro ao remover plano:', error) });
        toast({
          title: "Erro",
          description: "Erro ao remover plano de manutenção",
          variant: "destructive"
        });
        return;
      }

      setPlanos(prev => prev.filter(p => p.id !== id));
      toast({
        title: "Sucesso",
        description: "Plano de manutenção removido com sucesso!"
      });
    } catch (error) {
      logger.error('usePlanosManutencao', 'Erro', { detail: String('Erro:', error) });
      toast({
        title: "Erro",
        description: "Erro ao remover plano de manutenção",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchPlanos();
  }, [veiculoId]);

  return {
    planos,
    loading,
    fetchPlanos,
    adicionarPlano,
    atualizarPlano,
    removerPlano,
    refetch: fetchPlanos
  };
};
