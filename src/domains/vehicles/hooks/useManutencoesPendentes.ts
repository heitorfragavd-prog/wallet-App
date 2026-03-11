import { logger } from "@/core/logging/LoggerService";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { Veiculo } from "./useVeiculos";
import { TipoManutencao } from "./useTiposManutencao";
import { ManutencaoService } from "../services/ManutencaoService";

export interface ManutencaoPendente {
  id: string;
  veiculo_id: string;
  tipo_manutencao_id: string;
  tipo: string;
  sistema: string;
  status: "Atrasada" | "Em dia" | "Pendente";
  proximaEm: string;
  realizada?: boolean;
  veiculo?: Veiculo;
  tipoManutencao?: TipoManutencao;
}

interface ManutencaoRealizada {
  id: string;
  veiculo_id: string;
  tipo_manutencao_id: string;
  data_realizada: string;
  quilometragem: number;
  status: string;
}

export const useManutencoesPendentes = (veiculos: Veiculo[], tiposManutencao: TipoManutencao[]) => {
  const [manutencoesPendentes, setManutencoesPendentes] = useState<ManutencaoPendente[]>([]);
  const [manutencaoRealizada, setManutencaoRealizada] = useState<ManutencaoRealizada[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchManutencaoRealizada = async () => {
    try {
      const { data, error } = await supabase
        .from('manutencoes')
        .select('*')
        .eq('status', 'realizada')
        .order('data_realizada', { ascending: false });

      if (error) {
        logger.error('useManutencoesPendentes', 'Erro', { detail: 'Erro ao buscar manutenções realizadas:', error });
        return;
      }

      setManutencaoRealizada(data || []);
    } catch (error) {
      logger.error('useManutencoesPendentes', 'Erro', { detail: 'Erro:', error });
    }
  };

  const calcularManutencoesPendentes = async () => {
    const pendentes: ManutencaoPendente[] = [];

    // Processar cada veículo
    for (const veiculo of veiculos) {
      // 1. Buscar planos de manutenção configurados para este veículo
      const { data: planos } = await supabase
        .from('planos_manutencao_veiculo')
        .select(`
          *,
          tipo_manutencao:tipos_manutencao(*)
        `)
        .eq('veiculo_id', veiculo.id)
        .eq('ativo', true);

      // 2. Buscar manutenções customizadas para este veículo
      const { data: customizadas } = await supabase
        .from('manutencoes_customizadas')
        .select('*')
        .eq('veiculo_id', veiculo.id)
        .eq('ativo', true);

      // 3. Processar planos de manutenção
      if (planos) {
        for (const plano of planos) {
          const resultado = await ManutencaoService.calcularProximaManutencao(
            veiculo.id,
            plano.tipo_manutencao_id,
            plano.intervalo_km
          );

          if (resultado) {
            let status: "Atrasada" | "Em dia" | "Pendente";
            let proximaEm: string;

            if (resultado.status === 'atrasada') {
              status = "Atrasada";
              proximaEm = `Atrasada em ${Math.abs(resultado.kmRestante).toLocaleString()} km`;
            } else if (resultado.status === 'pendente') {
              status = "Pendente";
              proximaEm = `Em ${resultado.kmRestante.toLocaleString()} km`;
            } else {
              status = "Em dia";
              proximaEm = `Em ${resultado.kmRestante.toLocaleString()} km`;
            }

            pendentes.push({
              id: `plano-${plano.id}`,
              veiculo_id: veiculo.id,
              tipo_manutencao_id: plano.tipo_manutencao_id,
              tipo: plano.tipo_manutencao?.nome || 'Desconhecido',
              sistema: plano.tipo_manutencao?.sistema || 'N/A',
              status,
              proximaEm,
              veiculo,
              tipoManutencao: plano.tipo_manutencao
            });
          }
        }
      }

      // 4. Processar manutenções customizadas (apenas as que têm intervalo_km)
      if (customizadas) {
        for (const customizada of customizadas) {
          if (customizada.intervalo_km) {
            // Buscar última manutenção realizada desta customizada
            const ultimaManutencao = manutencaoRealizada.find(m => 
              m.veiculo_id === veiculo.id && 
              m.tipo_manutencao_id === customizada.id
            );

            let kmRestante: number;
            let kmProxima: number;

            if (ultimaManutencao) {
              kmProxima = ultimaManutencao.quilometragem_realizada + customizada.intervalo_km;
              kmRestante = kmProxima - veiculo.quilometragem;
            } else {
              kmProxima = Math.ceil(veiculo.quilometragem / customizada.intervalo_km) * customizada.intervalo_km;
              kmRestante = kmProxima - veiculo.quilometragem;
            }

            let status: "Atrasada" | "Em dia" | "Pendente";
            let proximaEm: string;

            if (kmRestante <= 0) {
              status = "Atrasada";
              proximaEm = `Atrasada em ${Math.abs(kmRestante).toLocaleString()} km`;
            } else if (kmRestante <= customizada.intervalo_km * 0.1) {
              status = "Pendente";
              proximaEm = `Em ${kmRestante.toLocaleString()} km`;
            } else {
              status = "Em dia";
              proximaEm = `Em ${kmRestante.toLocaleString()} km`;
            }

            pendentes.push({
              id: `custom-${customizada.id}`,
              veiculo_id: veiculo.id,
              tipo_manutencao_id: customizada.id,
              tipo: customizada.nome,
              sistema: customizada.sistema || 'Customizada',
              status,
              proximaEm,
              veiculo
            });
          }
        }
      }
    }

    // Ordenar por prioridade: Atrasada -> Pendente -> Em dia
    pendentes.sort((a, b) => {
      const statusOrder = { "Atrasada": 0, "Pendente": 1, "Em dia": 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });

    setManutencoesPendentes(pendentes);
    setLoading(false);
  };

  const realizarManutencao = async (manutencaoPendente: ManutencaoPendente) => {
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

      const veiculo = manutencaoPendente.veiculo;
      if (!veiculo) return;

      // Criar registro de manutenção realizada
      const { error } = await supabase
        .from('manutencoes')
        .insert([{
          user_id: user.id,
          veiculo_id: manutencaoPendente.veiculo_id,
          tipo_manutencao_id: manutencaoPendente.tipo_manutencao_id,
          quilometragem_realizada: veiculo.quilometragem,
          data_realizada: new Date().toISOString().split('T')[0],
          status: 'realizada'
        }]);

      if (error) {
        logger.error('useManutencoesPendentes', 'Erro', { detail: 'Erro ao realizar manutenção:', error });
        toast({
          title: "Erro",
          description: "Erro ao realizar manutenção",
          variant: "destructive"
        });
        return;
      }

      // Atualizar dados após inserção
      await fetchManutencaoRealizada();
      
      toast({
        title: "Sucesso",
        description: "Manutenção realizada com sucesso!"
      });
    } catch (error) {
      logger.error('useManutencoesPendentes', 'Erro', { detail: 'Erro:', error });
      toast({
        title: "Erro",
        description: "Erro ao realizar manutenção",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (veiculos.length > 0) {
        await fetchManutencaoRealizada();
      } else {
        setLoading(false);
      }
    };
    
    loadData();
  }, [veiculos]);

  // Recalcular quando as manutenções realizadas mudarem
  useEffect(() => {
    if (veiculos.length > 0) {
      calcularManutencoesPendentes();
    }
  }, [veiculos, manutencaoRealizada]);

  return {
    manutencoesPendentes,
    loading,
    realizarManutencao,
    refetch: () => {
      fetchManutencaoRealizada();
      calcularManutencoesPendentes();
    }
  };
};