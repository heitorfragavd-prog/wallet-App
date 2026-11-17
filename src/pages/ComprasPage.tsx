import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/shared/components/layouts/DashboardLayout';
import { Button } from '@/shared/components/ui/button';
import { useWorkspace } from '@/shared/contexts/WorkspaceContext';
import { useAuth } from '@/shared/contexts/AuthContext';
import { supabase } from '@/shared/lib/supabase';
import {
  PainelComprasAdmin,
  PedidoCompraAdmin,
  ItemPedidoAdmin,
} from '@/domains/compras/components/PainelComprasAdmin';

export default function ComprasPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoCompraAdmin[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExecutivo, setIsExecutivo] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  const carregarPedidosEPerfil = useCallback(async () => {
    if (!currentWorkspace?.id || !user?.id) return;
    setIsLoading(true);
    setErroMsg(null);

    try {
      // 1. Verificar se usuário é executivo do workspace
      const { data: isExec } = await supabase.rpc('is_workspace_executive', {
        ws_id: currentWorkspace.id,
        u_id: user.id,
      });
      setIsExecutivo(Boolean(isExec));

      // 2. Carregar pedidos recentes do workspace
      const { data: pedsData, error: pedsErr } = await supabase
        .from('compras_pedidos')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('data_pedido', { ascending: false })
        .limit(10);

      if (pedsErr) throw pedsErr;

      if (!pedsData || pedsData.length === 0) {
        setPedidos([]);
        return;
      }

      const pedidoIds = pedsData.map((p) => p.id);

      // 3. Carregar itens dos pedidos
      const { data: itensData, error: itensErr } = await supabase
        .from('compras_pedidos_itens')
        .select('*')
        .in('pedido_id', pedidoIds)
        .order('produto_nome', { ascending: true });

      if (itensErr) throw itensErr;

      // Agrupar itens por pedido
      const itensPorPedido = new Map<string, ItemPedidoAdmin[]>();
      for (const item of (itensData || [])) {
        if (!itensPorPedido.has(item.pedido_id)) {
          itensPorPedido.set(item.pedido_id, []);
        }
        itensPorPedido.get(item.pedido_id)!.push({
          id: item.id,
          produto_nome: item.produto_nome,
          categoria: item.categoria || 'Geral',
          unidade_medida: item.unidade_medida,
          quantidade_referencia: Number(item.quantidade_referencia || 0),
          estoque_atual: item.estoque_atual !== null ? Number(item.estoque_atual) : null,
          quantidade_sugerida: item.quantidade_sugerida !== null ? Number(item.quantidade_sugerida) : null,
          quantidade_ajustada: item.quantidade_ajustada !== null ? Number(item.quantidade_ajustada) : null,
          status_estoque: item.status_estoque,
          contagem_origem: item.contagem_origem,
          contagem_confirmada_em: item.contagem_confirmada_em,
        });
      }

      const pedidosFormatados: PedidoCompraAdmin[] = pedsData.map((p) => ({
        id: p.id,
        fornecedor_nome: p.fornecedor_nome,
        data_pedido: p.data_pedido,
        dia_semana: p.dia_semana,
        status: p.status,
        aumento_temporario_pct: Number(p.aumento_temporario_pct || 0),
        texto_pedido_formatado: p.texto_pedido_formatado,
        simulacao: p.simulacao,
        itens: itensPorPedido.get(p.id) || [],
      }));

      setPedidos(pedidosFormatados);
    } catch (err: unknown) {
      console.error('Erro ao carregar compras:', err);
      setErroMsg((err as Error)?.message || 'Erro ao carregar pedidos de compras');
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace?.id, user?.id]);

  useEffect(() => {
    carregarPedidosEPerfil();
  }, [carregarPedidosEPerfil]);

  const handleSalvarAjuste = async (_pedidoId: string, itemId: string, novaQtd: number) => {
    try {
      const { error } = await supabase
        .from('compras_pedidos_itens')
        .update({
          quantidade_ajustada: novaQtd,
        })
        .eq('id', itemId);

      if (error) throw error;
      await carregarPedidosEPerfil();
    } catch (err: unknown) {
      alert(`Erro ao salvar ajuste: ${(err as Error)?.message}`);
    }
  };

  const handleAprovar = async (pedidoId: string) => {
    if (!currentWorkspace?.id) return;
    try {
      const { error } = await supabase.rpc('aprovar_pedido_compras', {
        p_pedido_id: pedidoId,
        p_workspace_id: currentWorkspace.id,
      });

      if (error) throw error;
      await carregarPedidosEPerfil();
    } catch (err: unknown) {
      alert(`Falha na aprovação: ${(err as Error)?.message}`);
    }
  };

  const handleCancelar = async (pedidoId: string) => {
    try {
      const { error } = await supabase
        .from('compras_pedidos')
        .update({ status: 'cancelado' })
        .eq('id', pedidoId);

      if (error) throw error;
      await carregarPedidosEPerfil();
    } catch (err: unknown) {
      alert(`Falha ao cancelar: ${(err as Error)?.message}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-primary" />
              Painel de Compras Inteligentes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rodo Point — Conferência matinal de estoques, cálculo com IA e aprovação administrativa.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={carregarPedidosEPerfil}
            disabled={isLoading}
            className="flex items-center gap-2 self-start sm:self-auto"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {erroMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <p className="text-sm">{erroMsg}</p>
          </div>
        )}

        {!isExecutivo && !isLoading && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg flex items-center gap-2.5 text-xs">
            <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span>
              <b>Modo Somente Leitura Operacional:</b> Apenas administradores e executivos possuem autorização para aprovar pedidos ou modificar quantidades definitivas.
            </span>
          </div>
        )}

        <PainelComprasAdmin
          pedidos={pedidos}
          isExecutivo={isExecutivo}
          onSalvarAjusteItem={handleSalvarAjuste}
          onAprovarPedido={handleAprovar}
          onCancelarPedido={handleCancelar}
          isLoading={isLoading}
        />
      </div>
    </DashboardLayout>
  );
}
