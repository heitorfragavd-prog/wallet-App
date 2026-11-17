import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  ShoppingCart,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Copy,
  Check,
  Eye,
  Calendar,
  Lock,
} from 'lucide-react';

export type StatusPedidoCompra =
  | 'sugerido'
  | 'aguardando_estoque'
  | 'estoque_incompleto'
  | 'pedido_calculado'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'enviado'
  | 'cancelado';

export interface ItemPedidoAdmin {
  id: string;
  produto_nome: string;
  categoria: string;
  unidade_medida: string;
  quantidade_referencia: number;
  estoque_atual: number | null;
  quantidade_sugerida: number | null;
  quantidade_ajustada: number | null;
  status_estoque: 'pendente_contagem' | 'confirmado_zero' | 'confirmado_positivo' | 'inconsistente';
  contagem_origem?: string;
  contagem_confirmada_em?: string;
}

export interface PedidoCompraAdmin {
  id: string;
  fornecedor_nome: string;
  data_pedido: string;
  dia_semana: number;
  status: StatusPedidoCompra;
  aumento_temporario_pct: number;
  texto_pedido_formatado: string | null;
  simulacao: boolean;
  itens: ItemPedidoAdmin[];
}

export interface PainelComprasAdminProps {
  pedidos: PedidoCompraAdmin[];
  isExecutivo: boolean;
  onSalvarAjusteItem?: (pedidoId: string, itemId: string, novaQtd: number) => Promise<void>;
  onAprovarPedido?: (pedidoId: string) => Promise<void>;
  onCancelarPedido?: (pedidoId: string) => Promise<void>;
  isLoading?: boolean;
}

export const PainelComprasAdmin: React.FC<PainelComprasAdminProps> = ({
  pedidos,
  isExecutivo,
  onSalvarAjusteItem,
  onAprovarPedido,
  onCancelarPedido,
  isLoading = false,
}) => {
  const [pedidoSelecionadoId, setPedidoSelecionadoId] = useState<string | null>(
    pedidos.length > 0 ? pedidos[0].id : null
  );
  const [ajustesLocais, setAjustesLocais] = useState<Record<string, number>>({});
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const pedidoAtivo = pedidos.find((p) => p.id === pedidoSelecionadoId) || pedidos[0];

  const handleMudarQtd = (itemId: string, valorStr: string) => {
    const val = Number(valorStr);
    if (!isNaN(val) && val >= 0) {
      setAjustesLocais((prev) => ({ ...prev, [itemId]: val }));
    }
  };

  const handleSalvarItem = async (pedidoId: string, itemId: string) => {
    const novaQtd = ajustesLocais[itemId];
    if (novaQtd !== undefined && onSalvarAjusteItem) {
      await onSalvarAjusteItem(pedidoId, itemId, novaQtd);
    }
  };

  const handleCopiarTexto = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2500);
  };

  const getStatusBadge = (status: StatusPedidoCompra) => {
    switch (status) {
      case 'aprovado':
        return <Badge className="bg-emerald-600 text-white">✅ Aprovado</Badge>;
      case 'enviado':
        return <Badge className="bg-sky-600 text-white">🚀 Enviado</Badge>;
      case 'pedido_calculado':
        return <Badge className="bg-blue-600 text-white">📊 Calculado</Badge>;
      case 'aguardando_aprovacao':
        return <Badge className="bg-purple-600 text-white">👑 Aguardando Aprovação</Badge>;
      case 'estoque_incompleto':
        return <Badge className="bg-amber-600 text-white">⚠️ Estoque Incompleto</Badge>;
      case 'aguardando_estoque':
        return <Badge className="bg-amber-500 text-white">⏳ Aguardando Contagem</Badge>;
      case 'cancelado':
        return <Badge className="bg-red-600 text-white">❌ Cancelado</Badge>;
      case 'sugerido':
      default:
        return <Badge variant="outline">📝 Rascunho</Badge>;
    }
  };

  if (pedidos.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mb-3 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">Nenhum pedido de compras programado</h3>
          <p className="text-sm mt-1">Os pedidos diários são identificados automaticamente às 09h00.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lista de Seleção de Fornecedores do Dia */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {pedidos.map((ped) => (
          <Button
            key={ped.id}
            variant={pedidoAtivo?.id === ped.id ? 'default' : 'outline'}
            className="flex items-center gap-2 whitespace-nowrap"
            onClick={() => setPedidoSelecionadoId(ped.id)}
          >
            <ShoppingCart className="h-4 w-4" />
            <span>{ped.fornecedor_nome}</span>
            {getStatusBadge(ped.status)}
          </Button>
        ))}
      </div>

      {pedidoAtivo && (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
            <div>
              <div className="flex items-center gap-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <span>{pedidoAtivo.fornecedor_nome}</span>
                  {getStatusBadge(pedidoAtivo.status)}
                </CardTitle>
                {pedidoAtivo.simulacao && (
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                    🧪 Modo Simulação
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" /> Data: {pedidoAtivo.data_pedido}
                </span>
                {pedidoAtivo.aumento_temporario_pct > 0 && (
                  <span className="text-emerald-600 font-medium">
                    📈 Aumento Temporário: +{pedidoAtivo.aumento_temporario_pct}%
                  </span>
                )}
              </div>
            </div>

            {/* Ações Administrativas de Aprovação */}
            <div className="flex items-center gap-2">
              {isExecutivo ? (
                <>
                  {pedidoAtivo.status !== 'aprovado' && pedidoAtivo.status !== 'enviado' && (
                    <Button
                      onClick={() => onAprovarPedido && onAprovarPedido(pedidoAtivo.id)}
                      disabled={isLoading || pedidoAtivo.status === 'cancelado'}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Aprovar Pedido
                    </Button>
                  )}
                  {pedidoAtivo.status !== 'cancelado' && pedidoAtivo.status !== 'enviado' && (
                    <Button
                      variant="outline"
                      onClick={() => onCancelarPedido && onCancelarPedido(pedidoAtivo.id)}
                      disabled={isLoading}
                      className="text-red-600 hover:bg-red-50"
                    >
                      Cancelar
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground flex items-center gap-1 bg-muted px-3 py-1.5 rounded-md">
                  <Lock className="h-3.5 w-3.5" /> Aprovação restrita à diretoria/gerência
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* Tabela de Produtos e Conferência de Estoque */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-left">
                    <th className="pb-3 font-medium">Produto</th>
                    <th className="pb-3 font-medium">Categoria</th>
                    <th className="pb-3 font-medium text-center">Ref. Base</th>
                    <th className="pb-3 font-medium text-center">Estoque Físico</th>
                    <th className="pb-3 font-medium text-center">Sugerido (IA)</th>
                    <th className="pb-3 font-medium text-center">Qtd. Ajustada</th>
                    <th className="pb-3 font-medium text-right">Origem Contagem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pedidoAtivo.itens.map((item) => {
                    const qtdAjustada =
                      ajustesLocais[item.id] !== undefined
                        ? ajustesLocais[item.id]
                        : item.quantidade_ajustada !== null
                        ? item.quantidade_ajustada
                        : item.quantidade_sugerida || 0;

                    const houveModificacao =
                      ajustesLocais[item.id] !== undefined &&
                      ajustesLocais[item.id] !== item.quantidade_ajustada;

                    return (
                      <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                        <td className="py-3 font-medium">{item.produto_nome}</td>
                        <td className="py-3 text-muted-foreground">{item.categoria}</td>
                        <td className="py-3 text-center font-mono">
                          {item.quantidade_referencia} {item.unidade_medida}
                        </td>
                        <td className="py-3 text-center">
                          {item.status_estoque === 'pendente_contagem' ? (
                            <span className="text-amber-600 flex items-center justify-center gap-1 text-xs">
                              <Clock className="h-3.5 w-3.5" /> Pendente
                            </span>
                          ) : item.status_estoque === 'inconsistente' ? (
                            <span className="text-red-500 flex items-center justify-center gap-1 text-xs">
                              <AlertTriangle className="h-3.5 w-3.5" /> Inconsistente
                            </span>
                          ) : item.status_estoque === 'confirmado_zero' ? (
                            <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">
                              0 (Zerado)
                            </Badge>
                          ) : (
                            <span className="font-mono text-emerald-700 font-semibold">
                              {item.estoque_atual}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-center font-mono font-medium">
                          {item.quantidade_sugerida !== null ? (
                            <span>{item.quantidade_sugerida}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          {isExecutivo && pedidoAtivo.status !== 'aprovado' && pedidoAtivo.status !== 'enviado' ? (
                            <div className="flex items-center justify-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                value={qtdAjustada}
                                onChange={(e) => handleMudarQtd(item.id, e.target.value)}
                                className="w-20 h-8 text-center font-mono"
                              />
                              {houveModificacao && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => handleSalvarItem(pedidoAtivo.id, item.id)}
                                >
                                  Salvar
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="font-mono font-semibold">{qtdAjustada}</span>
                          )}
                        </td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {item.contagem_origem ? (
                            <span className="capitalize">{item.contagem_origem.replace('_', ' ')}</span>
                          ) : (
                            <span>Automático</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Visualização da Lista Formatada Pronta para Envio */}
            {pedidoAtivo.texto_pedido_formatado && (
              <div className="bg-muted/40 p-4 rounded-lg border space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Eye className="h-4 w-4" /> Texto Formatado do Pedido (Padrão Rodo Point)
                  </h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopiarTexto(pedidoAtivo.texto_pedido_formatado || '', pedidoAtivo.id)}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    {copiadoId === pedidoAtivo.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" /> Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copiar Lista
                      </>
                    )}
                  </Button>
                </div>
                <pre className="font-mono text-xs bg-card p-3 rounded border overflow-x-auto whitespace-pre-wrap">
                  {pedidoAtivo.texto_pedido_formatado}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
