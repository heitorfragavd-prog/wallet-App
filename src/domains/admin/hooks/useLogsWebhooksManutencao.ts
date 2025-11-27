import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";

export interface LogWebhookManutencao {
  id: string;
  webhook_id: string;
  lembrete_id: string;
  payload: any;
  status_code?: number;
  response?: string;
  erro?: string;
  tentativa: number;
  created_at: string;
}

interface FiltrosLogs {
  webhook_id?: string;
  status?: 'sucesso' | 'erro';
  data_inicio?: string;
  data_fim?: string;
  limit?: number;
}

export const useLogsWebhooksManutencao = (filtros?: FiltrosLogs) => {
  const [logs, setLogs] = useState<LogWebhookManutencao[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();

  const fetchLogs = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('logs_webhooks_manutencao')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (filtros?.webhook_id) {
        query = query.eq('webhook_id', filtros.webhook_id);
      }

      if (filtros?.status === 'sucesso') {
        query = query.gte('status_code', 200).lt('status_code', 300);
      } else if (filtros?.status === 'erro') {
        query = query.or('status_code.lt.200,status_code.gte.300');
      }

      if (filtros?.data_inicio) {
        query = query.gte('created_at', filtros.data_inicio);
      }

      if (filtros?.data_fim) {
        query = query.lte('created_at', filtros.data_fim);
      }

      if (filtros?.limit) {
        query = query.limit(filtros.limit);
      } else {
        query = query.limit(100); // Limite padrão
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Erro ao buscar logs:', error);
        toast({
          title: "Erro",
          description: "Erro ao carregar logs de webhooks",
          variant: "destructive"
        });
        return;
      }

      setLogs(data || []);
      setTotal(count || 0);
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar logs de webhooks",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getEstatisticas = async (webhookId?: string) => {
    try {
      let query = supabase
        .from('logs_webhooks_manutencao')
        .select('status_code, created_at');

      if (webhookId) {
        query = query.eq('webhook_id', webhookId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar estatísticas:', error);
        return null;
      }

      const total = data?.length || 0;
      const sucessos = data?.filter(log => 
        log.status_code && log.status_code >= 200 && log.status_code < 300
      ).length || 0;
      const erros = total - sucessos;
      const taxaSucesso = total > 0 ? (sucessos / total) * 100 : 0;

      // Últimos 7 dias
      const seteDiasAtras = new Date();
      seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
      const ultimosSete = data?.filter(log => 
        new Date(log.created_at) >= seteDiasAtras
      ).length || 0;

      return {
        total,
        sucessos,
        erros,
        taxaSucesso: Math.round(taxaSucesso),
        ultimosSete
      };
    } catch (error) {
      console.error('Erro ao calcular estatísticas:', error);
      return null;
    }
  };

  const limparLogsAntigos = async (diasParaManter: number = 30) => {
    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - diasParaManter);

      const { error } = await supabase
        .from('logs_webhooks_manutencao')
        .delete()
        .lt('created_at', dataLimite.toISOString());

      if (error) {
        console.error('Erro ao limpar logs:', error);
        toast({
          title: "Erro",
          description: "Erro ao limpar logs antigos",
          variant: "destructive"
        });
        return false;
      }

      toast({
        title: "Sucesso",
        description: `Logs com mais de ${diasParaManter} dias foram removidos`
      });

      await fetchLogs();
      return true;
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Erro ao limpar logs antigos",
        variant: "destructive"
      });
      return false;
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filtros?.webhook_id, filtros?.status, filtros?.data_inicio, filtros?.data_fim]);

  return {
    logs,
    loading,
    total,
    fetchLogs,
    getEstatisticas,
    limparLogsAntigos,
    refetch: fetchLogs
  };
};
