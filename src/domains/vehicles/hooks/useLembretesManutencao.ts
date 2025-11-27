import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { LembreteManutencao } from "../types";
import { ManutencaoService } from "../services/ManutencaoService";

interface CriarLembreteInput {
  veiculo_id: string;
  manutencao_id: string;
  tipo_manutencao: 'plano' | 'customizada';
  data_prevista?: string;
  dias_antecedencia?: number;
  intervalo_km?: number;
}

interface LembreteComDetalhes extends LembreteManutencao {
  veiculo?: {
    id: string;
    marca: string;
    modelo: string;
    placa: string;
    quilometragem: number;
  };
  plano_manutencao?: {
    id: string;
    tipo_manutencao: {
      nome: string;
      sistema: string;
    };
  };
  manutencao_customizada?: {
    id: string;
    nome: string;
    sistema?: string;
  };
}

export const useLembretesManutencao = (veiculoId?: string) => {
  const [lembretes, setLembretes] = useState<LembreteComDetalhes[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const calcularDataPrevista = async (
    veiculoId: string,
    intervaloKm: number
  ): Promise<Date | null> => {
    return ManutencaoService.calcularDataPrevista(veiculoId, intervaloKm);
  };

  const fetchLembretes = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('lembretes_manutencao')
        .select(`
          *,
          veiculo:veiculos(id, marca, modelo, placa, quilometragem)
        `)
        .order('data_prevista', { ascending: true });

      // Se veiculoId for fornecido, filtrar por veículo
      if (veiculoId) {
        query = query.eq('veiculo_id', veiculoId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar lembretes:', error);
        toast({
          title: "Erro",
          description: "Erro ao carregar lembretes de manutenção",
          variant: "destructive"
        });
        return;
      }

      // Buscar detalhes adicionais para cada lembrete
      const lembretesComDetalhes = await Promise.all(
        (data || []).map(async (lembrete) => {
          if (lembrete.tipo_manutencao === 'plano') {
            const { data: plano } = await supabase
              .from('planos_manutencao_veiculo')
              .select(`
                id,
                tipo_manutencao:tipos_manutencao(nome, sistema)
              `)
              .eq('id', lembrete.manutencao_id)
              .single();

            return {
              ...lembrete,
              plano_manutencao: plano
            };
          } else {
            const { data: customizada } = await supabase
              .from('manutencoes_customizadas')
              .select('id, nome, sistema')
              .eq('id', lembrete.manutencao_id)
              .single();

            return {
              ...lembrete,
              manutencao_customizada: customizada
            };
          }
        })
      );

      setLembretes(lembretesComDetalhes);
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar lembretes de manutenção",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const criarLembrete = async (input: CriarLembreteInput) => {
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

      let dataPrevista = input.data_prevista;

      // Se não foi fornecida data_prevista mas foi fornecido intervalo_km, calcular
      if (!dataPrevista && input.intervalo_km) {
        const dataCalculada = await calcularDataPrevista(
          input.veiculo_id,
          input.intervalo_km
        );
        
        if (dataCalculada) {
          dataPrevista = dataCalculada.toISOString().split('T')[0];
        } else {
          toast({
            title: "Erro",
            description: "Não foi possível calcular a data prevista",
            variant: "destructive"
          });
          return;
        }
      }

      if (!dataPrevista) {
        toast({
          title: "Erro",
          description: "É necessário fornecer uma data prevista ou intervalo em km",
          variant: "destructive"
        });
        return;
      }

      const { data: lembrete, error } = await supabase
        .from('lembretes_manutencao')
        .insert([{
          user_id: user.id,
          veiculo_id: input.veiculo_id,
          manutencao_id: input.manutencao_id,
          tipo_manutencao: input.tipo_manutencao,
          data_prevista: dataPrevista,
          dias_antecedencia: input.dias_antecedencia ?? 7,
          status: 'pendente'
        }])
        .select(`
          *,
          veiculo:veiculos(id, marca, modelo, placa, quilometragem)
        `)
        .single();

      if (error) {
        console.error('Erro ao criar lembrete:', error);
        toast({
          title: "Erro",
          description: "Erro ao criar lembrete de manutenção",
          variant: "destructive"
        });
        return;
      }

      // Buscar detalhes adicionais
      let lembreteComDetalhes = { ...lembrete };
      
      if (input.tipo_manutencao === 'plano') {
        const { data: plano } = await supabase
          .from('planos_manutencao_veiculo')
          .select(`
            id,
            tipo_manutencao:tipos_manutencao(nome, sistema)
          `)
          .eq('id', input.manutencao_id)
          .single();

        lembreteComDetalhes.plano_manutencao = plano;
      } else {
        const { data: customizada } = await supabase
          .from('manutencoes_customizadas')
          .select('id, nome, sistema')
          .eq('id', input.manutencao_id)
          .single();

        lembreteComDetalhes.manutencao_customizada = customizada;
      }

      setLembretes(prev => [lembreteComDetalhes, ...prev]);
      toast({
        title: "Sucesso",
        description: "Lembrete de manutenção criado com sucesso!"
      });

      return lembreteComDetalhes;
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar lembrete de manutenção",
        variant: "destructive"
      });
    }
  };

  const cancelarLembrete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('lembretes_manutencao')
        .update({ status: 'cancelado' })
        .eq('id', id);

      if (error) {
        console.error('Erro ao cancelar lembrete:', error);
        toast({
          title: "Erro",
          description: "Erro ao cancelar lembrete de manutenção",
          variant: "destructive"
        });
        return;
      }

      setLembretes(prev => prev.map(l => 
        l.id === id ? { ...l, status: 'cancelado' as const } : l
      ));
      
      toast({
        title: "Sucesso",
        description: "Lembrete de manutenção cancelado com sucesso!"
      });
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao cancelar lembrete de manutenção",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchLembretes();
  }, [veiculoId]);

  return {
    lembretes,
    loading,
    fetchLembretes,
    criarLembrete,
    cancelarLembrete,
    calcularDataPrevista,
    refetch: fetchLembretes
  };
};
