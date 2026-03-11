import { supabase } from "@/integrations/supabase/client";
import { addMonths, differenceInDays } from "date-fns";
import { logger } from "@/core/logging/LoggerService";

/**
 * Service para cálculos relacionados a manutenções de veículos
 * Camada de serviço - sem dependências do React
 */
export class ManutencaoService {
  /**
   * Calcula a média de quilômetros rodados por mês baseado no histórico de manutenções
   * @param veiculoId - ID do veículo
   * @param kmAtual - Quilometragem atual do veículo
   * @returns Média de km/mês ou valor padrão de 1000 km/mês
   */
  static async calcularMediaKmMes(
    veiculoId: string,
    kmAtual: number
  ): Promise<number> {
    try {
      // Buscar histórico de manutenções realizadas
      const { data: historico, error } = await supabase
        .from('manutencoes')
        .select('data_realizada, quilometragem_realizada')
        .eq('veiculo_id', veiculoId)
        .eq('status', 'realizada')
        .order('data_realizada', { ascending: false })
        .limit(1);

      if (error) {
        logger.error('ManutencaoService', 'Erro ao buscar histórico de manutenções', { veiculoId, error: error.message });
        return 1000; // Retornar padrão em caso de erro
      }

      // Se não houver histórico, retornar padrão
      if (!historico || historico.length === 0) {
        return 1000;
      }

      const ultimaManutencao = historico[0];
      
      // Calcular dias desde a última manutenção
      const diasDesdeUltima = differenceInDays(
        new Date(),
        new Date(ultimaManutencao.data_realizada)
      );

      // Se passou menos de 1 dia, retornar padrão
      if (diasDesdeUltima <= 0) {
        return 1000;
      }

      // Calcular km rodados desde a última manutenção
      const kmRodados = kmAtual - ultimaManutencao.quilometragem_realizada;

      // Se km rodados for negativo ou zero, retornar padrão
      if (kmRodados <= 0) {
        return 1000;
      }

      // Calcular média de km por dia e converter para mês
      const mediaKmDia = kmRodados / diasDesdeUltima;
      const mediaKmMes = mediaKmDia * 30;

      // Garantir que a média seja razoável (entre 100 e 10000 km/mês)
      if (mediaKmMes < 100) return 100;
      if (mediaKmMes > 10000) return 10000;

      return Math.round(mediaKmMes);
    } catch (error) {
      logger.error('ManutencaoService', 'Erro ao calcular média de km/mês', { veiculoId, error: error instanceof Error ? error.message : String(error) });
      return 1000; // Retornar padrão em caso de erro
    }
  }

  /**
   * Calcula a data prevista para uma manutenção baseada no intervalo em km
   * @param veiculoId - ID do veículo
   * @param intervaloKm - Intervalo em quilômetros para a manutenção
   * @returns Data prevista ou null em caso de erro
   */
  static async calcularDataPrevista(
    veiculoId: string,
    intervaloKm: number
  ): Promise<Date | null> {
    try {
      // 1. Buscar veículo para obter quilometragem atual
      const { data: veiculo, error: veiculoError } = await supabase
        .from('veiculos')
        .select('quilometragem')
        .eq('id', veiculoId)
        .single();

      if (veiculoError || !veiculo) {
        logger.error('ManutencaoService', 'Erro ao buscar veículo para data prevista', { veiculoId, error: veiculoError?.message });
        return null;
      }

      // 2. Calcular média de km por mês
      const mediaKmMes = await this.calcularMediaKmMes(
        veiculoId,
        veiculo.quilometragem
      );

      // 3. Calcular KM faltante até próxima manutenção
      const kmFaltante = intervaloKm;

      // 4. Estimar meses até próxima manutenção
      const mesesAteProxima = kmFaltante / mediaKmMes;

      // 5. Calcular data prevista
      const dataPrevista = addMonths(new Date(), mesesAteProxima);

      return dataPrevista;
    } catch (error) {
      logger.error('ManutencaoService', 'Erro ao calcular data prevista', { veiculoId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Calcula a próxima manutenção baseada na última realizada
   * @param veiculoId - ID do veículo
   * @param tipoManutencaoId - ID do tipo de manutenção
   * @param intervaloKm - Intervalo em quilômetros
   * @returns Objeto com informações da próxima manutenção
   */
  static async calcularProximaManutencao(
    veiculoId: string,
    tipoManutencaoId: string,
    intervaloKm: number
  ): Promise<{
    kmProxima: number;
    dataPrevista: Date | null;
    kmRestante: number;
    status: 'atrasada' | 'pendente' | 'em_dia';
  } | null> {
    try {
      // 1. Buscar veículo
      const { data: veiculo, error: veiculoError } = await supabase
        .from('veiculos')
        .select('quilometragem')
        .eq('id', veiculoId)
        .single();

      if (veiculoError || !veiculo) {
        logger.error('ManutencaoService', 'Erro ao buscar veículo para próxima manutenção', { veiculoId, error: veiculoError?.message });
        return null;
      }

      // 2. Buscar última manutenção deste tipo para este veículo
      const { data: ultimaManutencao, error: manutencaoError } = await supabase
        .from('manutencoes')
        .select('quilometragem_realizada')
        .eq('veiculo_id', veiculoId)
        .eq('tipo_manutencao_id', tipoManutencaoId)
        .eq('status', 'realizada')
        .order('data_realizada', { ascending: false })
        .limit(1)
        .single();

      let kmProxima: number;
      let kmRestante: number;

      if (manutencaoError || !ultimaManutencao) {
        // Se nunca foi feita, calcular baseado na quilometragem atual
        kmProxima = Math.ceil(veiculo.quilometragem / intervaloKm) * intervaloKm;
        kmRestante = kmProxima - veiculo.quilometragem;
      } else {
        // Se já foi feita, calcular baseado na última
        kmProxima = ultimaManutencao.quilometragem_realizada + intervaloKm;
        kmRestante = kmProxima - veiculo.quilometragem;
      }

      // 3. Calcular data prevista
      const dataPrevista = await this.calcularDataPrevista(
        veiculoId,
        Math.max(kmRestante, 0)
      );

      // 4. Determinar status
      let status: 'atrasada' | 'pendente' | 'em_dia';
      
      if (kmRestante <= 0) {
        status = 'atrasada';
      } else if (kmRestante <= intervaloKm * 0.1) {
        // Menos de 10% do intervalo restante
        status = 'pendente';
      } else {
        status = 'em_dia';
      }

      return {
        kmProxima,
        dataPrevista,
        kmRestante,
        status
      };
    } catch (error) {
      logger.error('ManutencaoService', 'Erro ao calcular próxima manutenção', { veiculoId, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Calcula informações de múltiplas manutenções para um veículo
   * @param veiculoId - ID do veículo
   * @param manutencoes - Array de manutenções com tipo_manutencao_id e intervalo_km
   * @returns Array com informações de cada manutenção
   */
  static async calcularProximasManutencoes(
    veiculoId: string,
    manutencoes: Array<{ tipo_manutencao_id: string; intervalo_km: number }>
  ): Promise<Array<{
    tipo_manutencao_id: string;
    kmProxima: number;
    dataPrevista: Date | null;
    kmRestante: number;
    status: 'atrasada' | 'pendente' | 'em_dia';
  }>> {
    const resultados = await Promise.all(
      manutencoes.map(async (manutencao) => {
        const resultado = await this.calcularProximaManutencao(
          veiculoId,
          manutencao.tipo_manutencao_id,
          manutencao.intervalo_km
        );

        if (!resultado) {
          return null;
        }

        return {
          tipo_manutencao_id: manutencao.tipo_manutencao_id,
          ...resultado
        };
      })
    );

    // Filtrar resultados nulos
    return resultados.filter((r): r is NonNullable<typeof r> => r !== null);
  }
}
