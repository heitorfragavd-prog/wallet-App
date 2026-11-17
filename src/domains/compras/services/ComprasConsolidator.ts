/**
 * Consolidador de Estoque e Conferências em Tempo Real (Etapa 4C - Gates 6, 8, 9, 10, 12)
 * 
 * Regras:
 * - Ingestão atômica de respostas incrementais ao longo da manhã (Gate 10).
 * - Suporta múltiplas mensagens sucessivas para a mesma conferência sem duplicar sessões.
 * - Correções substituem valores anteriores sem somar indevidamente (Gate 10).
 * - Blindagem: Pedidos já 'aprovados' ou 'enviados' são imutáveis; mensagens atrasadas não alteram o pedido (Gate 12).
 */

import { ItemEstoqueInterpretado } from "./ComprasTelegramInterpreter";

export interface InfoMensagemTelegram {
  chatId: string;
  telegramUserId?: number;
  nomeUsuario?: string;
  origemTipo: "telegram_texto" | "telegram_foto" | "telegram_audio" | "manual";
  arquivoUrl?: string;
  transcricaoAudio?: string;
}

export interface ItemEstoqueConsolidado {
  produto_nome: string;
  quantidade_anterior: number | null;
  quantidade_atual: number | null;
  status_estoque: "pendente_contagem" | "confirmado_zero" | "confirmado_positivo" | "inconsistente";
  foi_corrigido: boolean;
  informado_por: string;
  origem: string;
}

export interface ResultadoConsolidacaoEstoque {
  conferencia_id: string;
  pedido_id: string;
  fornecedor_nome: string;
  data_operacional: string;
  status_pedido_anterior: string;
  status_pedido_novo: string;
  itens_consolidados: ItemEstoqueConsolidado[];
  total_itens_confirmados: number;
  total_itens_pendentes: number;
  pedido_protegido_imutavel: boolean;
  mensagem_status: string;
}

export interface RepositorioConferenciaSimulado {
  pedidos: Map<string, { id: string; status: string; fornecedor_nome: string; itens: Map<string, unknown> }>;
  conferencias: Map<string, { id: string; status: string; historico: unknown[] }>;
}

/**
 * Consolida itens interpretados na sessão do dia
 */
export function consolidarItensEmSessao(
  itensInterpretados: ItemEstoqueInterpretado[],
  estadoAtual: {
    pedidoId: string;
    pedidoStatus: string;
    itensExistentes: Map<string, { estoque_atual: number | null; status_estoque: string }>;
    fornecedorNome: string;
    dataOperacional: string;
  },
  infoMsg: InfoMensagemTelegram
): ResultadoConsolidacaoEstoque {
  const isImutavel = ["aprovado", "enviado", "recebido"].includes(estadoAtual.pedidoStatus);

  // GATE 12: Pedido aprovado não pode ser alterado silenciosamente por nova mensagem
  if (isImutavel) {
    return {
      conferencia_id: `conf-${estadoAtual.pedidoId}`,
      pedido_id: estadoAtual.pedidoId,
      fornecedor_nome: estadoAtual.fornecedorNome,
      data_operacional: estadoAtual.dataOperacional,
      status_pedido_anterior: estadoAtual.pedidoStatus,
      status_pedido_novo: estadoAtual.pedidoStatus,
      itens_consolidados: [],
      total_itens_confirmados: estadoAtual.itensExistentes.size,
      total_itens_pendentes: 0,
      pedido_protegido_imutavel: true,
      mensagem_status: `⚠️ O pedido de ${estadoAtual.fornecedorNome} já foi aprovado e permanece protegido contra alterações.`,
    };
  }

  const itensConsolidados: ItemEstoqueConsolidado[] = [];
  let confirmadosCount = 0;

  for (const item of itensInterpretados) {
    const anterior = estadoAtual.itensExistentes.get(item.produto_nome);
    const qtdAnterior = anterior ? anterior.estoque_atual : null;

    let novoStatus: "pendente_contagem" | "confirmado_zero" | "confirmado_positivo" | "inconsistente";
    let novaQtd: number | null = null;

    if (item.tipo_informacao === "confirmado_zero") {
      novoStatus = "confirmado_zero";
      novaQtd = 0;
      confirmadosCount++;
    } else if (item.tipo_informacao === "confirmado_positivo") {
      novoStatus = "confirmado_positivo";
      novaQtd = item.quantidade_informada;
      confirmadosCount++;
    } else if (item.tipo_informacao === "inconsistente") {
      novoStatus = "inconsistente";
      novaQtd = qtdAnterior; // Mantém valor anterior se já existia
      pendentesCount++;
    } else {
      novoStatus = "pendente_contagem";
      novaQtd = null;
      pendentesCount++;
    }

    // Gate 10: Se for correção, atualiza a quantidade para o novo valor, sem somar
    const foiCorrigido = item.is_correcao || (qtdAnterior !== null && novaQtd !== null && qtdAnterior !== novaQtd);

    itensConsolidados.push({
      produto_nome: item.produto_nome,
      quantidade_anterior: qtdAnterior,
      quantidade_atual: novaQtd,
      status_estoque: novoStatus,
      foi_corrigido: foiCorrigido,
      informado_por: infoMsg.nomeUsuario || "Colaborador",
      origem: infoMsg.origemTipo,
    });

    // Atualiza mapa de itens existentes
    estadoAtual.itensExistentes.set(item.produto_nome, {
      estoque_atual: novaQtd,
      status_estoque: novoStatus,
    });
  }

  // Verifica o status do pedido completo
  let statusNovo = estadoAtual.pedidoStatus;
  const todosItens = Array.from(estadoAtual.itensExistentes.values());
  const totalPendentesNoPedido = todosItens.filter((it) => it.status_estoque === "pendente_contagem" || it.status_estoque === "inconsistente").length;

  if (totalPendentesNoPedido === 0 && todosItens.length > 0) {
    statusNovo = "pedido_calculado";
  } else if (totalPendentesNoPedido === todosItens.length) {
    statusNovo = "aguardando_estoque";
  } else {
    statusNovo = "estoque_incompleto";
  }

  return {
    conferencia_id: `conf-${estadoAtual.pedidoId}`,
    pedido_id: estadoAtual.pedidoId,
    fornecedor_nome: estadoAtual.fornecedorNome,
    data_operacional: estadoAtual.dataOperacional,
    status_pedido_anterior: estadoAtual.pedidoStatus,
    status_pedido_novo: statusNovo,
    itens_consolidados: itensConsolidados,
    total_itens_confirmados: confirmadosCount,
    total_itens_pendentes: totalPendentesNoPedido,
    pedido_protegido_imutavel: false,
    mensagem_status: statusNovo === "pedido_calculado"
      ? `🎉 Todos os itens de ${estadoAtual.fornecedorNome} foram conferidos com sucesso!`
      : `📝 Conferência parcial registrada. Faltam ${totalPendentesNoPedido} itens a conferir.`,
  };
}
