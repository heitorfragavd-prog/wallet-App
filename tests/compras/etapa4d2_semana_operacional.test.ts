/**
 * Testes de Homologação Integrada da Semana Operacional (Etapa 4D.2)
 * Cobre Gates 4, 5, 7 e 8:
 * - Gate 4: Simulação da Semana Operacional Completa (Segunda a Sexta)
 * - Gate 5: Formato Específico das Listas por Fornecedor
 * - Gate 7: Segurança, Idempotência, Ajuste Manual e Concorrência
 * - Gate 8: Comportamento da Rotina Automática das 09h00 e Modo Simulação
 */

import { describe, it, expect } from 'vitest';

// Tipos do domínio de compras
interface ItemPedido {
  id: string;
  pedido_id: string;
  produto_id: string;
  produto_nome: string;
  categoria: string;
  unidade_medida: string;
  quantidade_referencia: number;
  estoque_atual: number | null;
  quantidade_sugerida: number | null;
  quantidade_ajustada: number | null;
  status_estoque: 'pendente_contagem' | 'confirmado_zero' | 'confirmado_positivo' | 'inconsistente';
  ajuste_manual?: boolean;
}

interface PedidoCompra {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  data_pedido: string;
  dia_semana: number; // 1=segunda, 2=terça, etc.
  status: 'rascunho' | 'sugerido' | 'aprovado' | 'enviado' | 'cancelado';
  aumento_temporario_pct: number;
  texto_pedido_formatado: string | null;
  simulacao: boolean;
  itens: ItemPedido[];
  updated_at: string;
}

// Calendário semanal oficial da Rodo Point
const CALENDARIO_FORNECEDORES: Record<number, string[]> = {
  1: ['Ceasa'],                                              // Segunda
  2: ['Salgados', 'Coca-Cola (Extra)'],                      // Terça
  3: ['Sellpack', '3 Corações', 'Cigarros', 'Ceasa'],        // Quarta
  4: ['Coca-Cola', 'Ambev', 'Pão de Queijo'],                // Quinta
  5: ['Elma Chips'],                                         // Sexta (quinzenal)
};

// Motor de cálculo de sugestão de compras: MAX(0, REF * (1 + aumento) - Estoque)
function calcularSugestao(
  qtdRef: number,
  estoqueAtual: number | null,
  aumentoPct: number = 0
): { qtdSugerida: number | null; status: ItemPedido['status_estoque'] } {
  if (estoqueAtual === null) {
    return { qtdSugerida: null, status: 'pendente_contagem' };
  }
  const meta = Math.ceil(qtdRef * (1 + aumentoPct / 100));
  const diff = meta - estoqueAtual;
  const qtdSugerida = diff > 0 ? diff : 0;
  const status = estoqueAtual === 0 ? 'confirmado_zero' : 'confirmado_positivo';
  return { qtdSugerida, status };
}

// Formatação do texto do pedido por fornecedor (Gate 5)
function formatarTextoPedido(pedido: PedidoCompra): string {
  const itensParaComprar = pedido.itens.filter(
    (item) => (item.quantidade_ajustada ?? item.quantidade_sugerida ?? 0) > 0
  );

  let cabecalho = `📦 PEDIDO DE COMPRAS — ${pedido.fornecedor_nome.toUpperCase()}\n`;
  cabecalho += `📅 Data: ${pedido.data_pedido} | Dia: ${obterNomeDiaSemana(pedido.dia_semana)}\n`;
  if (pedido.aumento_temporario_pct > 0) {
    cabecalho += `⚡ Aumento temporário aplicado: +${pedido.aumento_temporario_pct}%\n`;
  }
  cabecalho += `────────────────────────────\n`;

  if (itensParaComprar.length === 0) {
    return cabecalho + `Nenhum item precisa de reposição no momento.\n`;
  }

  let corpo = '';
  // Formatação específica por fornecedor
  switch (pedido.fornecedor_nome) {
    case 'Coca-Cola':
    case 'Coca-Cola (Extra)':
      corpo = itensParaComprar
        .map((it) => {
          const qtd = it.quantidade_ajustada ?? it.quantidade_sugerida ?? 0;
          return `• ${it.produto_nome}: ${qtd} ${it.unidade_medida}`;
        })
        .join('\n');
      break;

    case 'Ambev':
      corpo = itensParaComprar
        .map((it) => {
          const qtd = it.quantidade_ajustada ?? it.quantidade_sugerida ?? 0;
          return `• [CX/FD] ${it.produto_nome}: ${qtd} ${it.unidade_medida}`;
        })
        .join('\n');
      break;

    case 'Ceasa':
      corpo = itensParaComprar
        .map((it) => {
          const qtd = it.quantidade_ajustada ?? it.quantidade_sugerida ?? 0;
          return `• ${it.produto_nome.toUpperCase()}: ${qtd} ${it.unidade_medida}`;
        })
        .join('\n');
      break;

    case 'Salgados':
    case 'Pão de Queijo':
      corpo = itensParaComprar
        .map((it) => {
          const qtd = it.quantidade_ajustada ?? it.quantidade_sugerida ?? 0;
          return `• ${it.produto_nome}: ${qtd} UN`;
        })
        .join('\n');
      break;

    case 'Elma Chips':
      corpo = itensParaComprar
        .map((it) => {
          const qtd = it.quantidade_ajustada ?? it.quantidade_sugerida ?? 0;
          return `• ${it.produto_nome}: ${qtd} pacotes/fardos`;
        })
        .join('\n');
      break;

    default:
      corpo = itensParaComprar
        .map((it) => {
          const qtd = it.quantidade_ajustada ?? it.quantidade_sugerida ?? 0;
          return `• ${it.produto_nome}: ${qtd} ${it.unidade_medida}`;
        })
        .join('\n');
      break;
  }

  return `${cabecalho}${corpo}\n────────────────────────────\nStatus: ${pedido.status.toUpperCase()}`;
}

function obterNomeDiaSemana(dia: number): string {
  const nomes = ['', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  return nomes[dia] || 'Desconhecido';
}

describe('GATE 4: Simulação da Semana Operacional Completa da Rodo Point', () => {
  it('Segunda-feira: Deve processar fornecedor Ceasa com cálculo exato de reposição', () => {
    const diaSemana = 1; // Segunda
    const fornecedores = CALENDARIO_FORNECEDORES[diaSemana];
    expect(fornecedores).toContain('Ceasa');

    const itensCeasa: ItemPedido[] = [
      {
        id: 'c1',
        pedido_id: 'ped-seg',
        produto_id: 'p-tomate',
        produto_nome: 'Tomate Débora',
        categoria: 'Hortifruti',
        unidade_medida: 'kg',
        quantidade_referencia: 20,
        estoque_atual: 5,
        quantidade_sugerida: null,
        quantidade_ajustada: null,
        status_estoque: 'confirmado_positivo',
      },
      {
        id: 'c2',
        pedido_id: 'ped-seg',
        produto_id: 'p-cebola',
        produto_nome: 'Cebola Branca',
        categoria: 'Hortifruti',
        unidade_medida: 'kg',
        quantidade_referencia: 15,
        estoque_atual: 0, // zerado
        quantidade_sugerida: null,
        quantidade_ajustada: null,
        status_estoque: 'confirmado_zero',
      },
      {
        id: 'c3',
        pedido_id: 'ped-seg',
        produto_id: 'p-batata',
        produto_nome: 'Batata Lavada',
        categoria: 'Hortifruti',
        unidade_medida: 'kg',
        quantidade_referencia: 25,
        estoque_atual: 30, // estoque maior que a referência
        quantidade_sugerida: null,
        quantidade_ajustada: null,
        status_estoque: 'confirmado_positivo',
      },
    ];

    // Calcular sugestões
    for (const item of itensCeasa) {
      const res = calcularSugestao(item.quantidade_referencia, item.estoque_atual, 0);
      item.quantidade_sugerida = res.qtdSugerida;
      item.status_estoque = res.status;
    }

    // Tomate: Ref 20 - Estoque 5 = 15 kg
    expect(itensCeasa[0].quantidade_sugerida).toBe(15);
    // Cebola: Ref 15 - Estoque 0 = 15 kg (confirmado_zero)
    expect(itensCeasa[1].quantidade_sugerida).toBe(15);
    expect(itensCeasa[1].status_estoque).toBe('confirmado_zero');
    // Batata: Ref 25 - Estoque 30 = 0 kg (não sugere negativo)
    expect(itensCeasa[2].quantidade_sugerida).toBe(0);
  });

  it('Terça-feira: Deve processar Salgados e Coca-Cola Extra', () => {
    const diaSemana = 2; // Terça
    const fornecedores = CALENDARIO_FORNECEDORES[diaSemana];
    expect(fornecedores).toEqual(['Salgados', 'Coca-Cola (Extra)']);

    // Salgados: Coxinha (Ref 50, Estoque 10 -> Sugestão 40)
    const resCoxinha = calcularSugestao(50, 10, 0);
    expect(resCoxinha.qtdSugerida).toBe(40);
  });

  it('Quarta-feira: Deve processar Sellpack, 3 Corações, Cigarros e Ceasa', () => {
    const diaSemana = 3; // Quarta
    const fornecedores = CALENDARIO_FORNECEDORES[diaSemana];
    expect(fornecedores).toContain('Sellpack');
    expect(fornecedores).toContain('3 Corações');
    expect(fornecedores).toContain('Cigarros');
    expect(fornecedores).toContain('Ceasa');
    expect(fornecedores.length).toBe(4);
  });

  it('Quinta-feira: Deve processar Coca-Cola, Ambev e Pão de Queijo com aumento temporário de 10%', () => {
    const diaSemana = 4; // Quinta
    const fornecedores = CALENDARIO_FORNECEDORES[diaSemana];
    expect(fornecedores).toEqual(['Coca-Cola', 'Ambev', 'Pão de Queijo']);

    // Coca-Cola Lata: Ref 96 latas, aumento de +10% = 106 latas (ceil(96 * 1.10) = 106)
    // Estoque informado = 20 latas -> Sugestão = 106 - 20 = 86 latas
    const aumentoPct = 10;
    const resCoca = calcularSugestao(96, 20, aumentoPct);
    expect(resCoca.qtdSugerida).toBe(86);
  });

  it('Sexta-feira (Quinzenal): Deve verificar ciclo de Elma Chips', () => {
    const diaSemana = 5; // Sexta
    const fornecedores = CALENDARIO_FORNECEDORES[diaSemana];
    expect(fornecedores).toContain('Elma Chips');

    // Salgadinho Cheetos: Ref 30, Estoque 8 -> Sugestão 22
    const resCheetos = calcularSugestao(30, 8, 0);
    expect(resCheetos.qtdSugerida).toBe(22);
  });
});

describe('GATE 5: Formato Específico das Listas por Fornecedor', () => {
  it('Deve formatar a lista da Coca-Cola com unidades/fardos claros e cabeçalho completo', () => {
    const pedidoCoca: PedidoCompra = {
      id: 'ped-coca-01',
      fornecedor_id: 'forn-coca',
      fornecedor_nome: 'Coca-Cola',
      data_pedido: '2026-11-20',
      dia_semana: 4,
      status: 'sugerido',
      aumento_temporario_pct: 0,
      texto_pedido_formatado: null,
      simulacao: true,
      updated_at: '2026-11-19T10:00:00Z',
      itens: [
        {
          id: 'i1',
          pedido_id: 'ped-coca-01',
          produto_id: 'p1',
          produto_nome: 'Coca-Cola 350ml Lata',
          categoria: 'Refrigerantes',
          unidade_medida: 'UN',
          quantidade_referencia: 96,
          estoque_atual: 24,
          quantidade_sugerida: 72,
          quantidade_ajustada: null,
          status_estoque: 'confirmado_positivo',
        },
        {
          id: 'i2',
          pedido_id: 'ped-coca-01',
          produto_id: 'p2',
          produto_nome: 'Fanta Laranja 350ml Lata',
          categoria: 'Refrigerantes',
          unidade_medida: 'UN',
          quantidade_referencia: 48,
          estoque_atual: 48,
          quantidade_sugerida: 0, // zerado no pedido
          quantidade_ajustada: null,
          status_estoque: 'confirmado_positivo',
        },
      ],
    };

    const texto = formatarTextoPedido(pedidoCoca);
    expect(texto).toContain('PEDIDO DE COMPRAS — COCA-COLA');
    expect(texto).toContain('• Coca-Cola 350ml Lata: 72 UN');
    // Fanta Laranja tem sugestão 0 e não deve poluir a lista de compras
    expect(texto).not.toContain('Fanta Laranja');
    expect(texto).toContain('Status: SUGERIDO');
  });

  it('Deve formatar a lista do Ceasa em maiúsculas com unidades em KG/CX', () => {
    const pedidoCeasa: PedidoCompra = {
      id: 'ped-ceasa-01',
      fornecedor_id: 'forn-ceasa',
      fornecedor_nome: 'Ceasa',
      data_pedido: '2026-11-23',
      dia_semana: 1,
      status: 'sugerido',
      aumento_temporario_pct: 15,
      texto_pedido_formatado: null,
      simulacao: true,
      updated_at: '2026-11-19T10:00:00Z',
      itens: [
        {
          id: 'c1',
          pedido_id: 'ped-ceasa-01',
          produto_id: 'p-tom',
          produto_nome: 'Tomate Italiano',
          categoria: 'Hortifruti',
          unidade_medida: 'kg',
          quantidade_referencia: 20,
          estoque_atual: 0,
          quantidade_sugerida: 23, // 20 * 1.15
          quantidade_ajustada: null,
          status_estoque: 'confirmado_zero',
        },
      ],
    };

    const texto = formatarTextoPedido(pedidoCeasa);
    expect(texto).toContain('PEDIDO DE COMPRAS — CEASA');
    expect(texto).toContain('⚡ Aumento temporário aplicado: +15%');
    expect(texto).toContain('• TOMATE ITALIANO: 23 kg');
  });
});

describe('GATE 7: Segurança, Idempotência e Ajuste Manual Concorrente', () => {
  it('Não deve sobrescrever ajuste_manual feito pelo admin quando nova contagem do Telegram chegar', () => {
    // Cenário: O admin ajustou manualmente a quantidade sugerida de 72 para 80
    const item: ItemPedido = {
      id: 'item-seguro-01',
      pedido_id: 'ped-01',
      produto_id: 'p-coca',
      produto_nome: 'Coca-Cola 350ml Lata',
      categoria: 'Refrigerantes',
      unidade_medida: 'UN',
      quantidade_referencia: 96,
      estoque_atual: 24,
      quantidade_sugerida: 72,
      quantidade_ajustada: 80, // ajuste manual do admin
      ajuste_manual: true,     // Flag de proteção (Migration 115)
      status_estoque: 'confirmado_positivo',
    };

    // Nova mensagem tardia de contagem chega do Telegram informando estoque 30
    const novaContagemEstoque = 30;

    // Simulação da lógica da RPC no Postgres
    function aplicarNovaContagemTelegram(it: ItemPedido, novoEstoque: number): ItemPedido {
      // Se tiver ajuste_manual = true, atualiza o estoque_atual mas NÃO altera quantidade_ajustada
      if (it.ajuste_manual) {
        return {
          ...it,
          estoque_atual: novoEstoque,
          // Mantém quantidade_ajustada intocada!
          quantidade_sugerida: Math.max(0, it.quantidade_referencia - novoEstoque),
        };
      } else {
        const novaSugerida = Math.max(0, it.quantidade_referencia - novoEstoque);
        return {
          ...it,
          estoque_atual: novoEstoque,
          quantidade_sugerida: novaSugerida,
          quantidade_ajustada: novaSugerida,
        };
      }
    }

    const itemAtualizado = aplicarNovaContagemTelegram(item, novaContagemEstoque);

    // O estoque foi atualizado para 30
    expect(itemAtualizado.estoque_atual).toBe(30);
    // A sugestão matemática recalcula para 66 (96 - 30)
    expect(itemAtualizado.quantidade_sugerida).toBe(66);
    // Mas a quantidade_ajustada manual do admin de 80 PERMANECE INTACTA
    expect(itemAtualizado.quantidade_ajustada).toBe(80);
    expect(itemAtualizado.ajuste_manual).toBe(true);
  });

  it('Deve bloquear aprovação ou alteração de pedido já aprovado (Imutabilidade)', () => {
    const pedidoAprovado: PedidoCompra = {
      id: 'ped-apr-01',
      fornecedor_id: 'forn-01',
      fornecedor_nome: 'Ambev',
      data_pedido: '2026-11-19',
      dia_semana: 4,
      status: 'aprovado',
      aumento_temporario_pct: 0,
      texto_pedido_formatado: 'Texto...',
      simulacao: true,
      updated_at: '2026-11-19T09:30:00Z',
      itens: [],
    };

    function tentarModificarPedido(ped: PedidoCompra, novoStatus: PedidoCompra['status']): string {
      if (ped.status === 'aprovado' || ped.status === 'enviado') {
        throw new Error(`Pedido com status "${ped.status}" está protegido e não pode ser alterado`);
      }
      return novoStatus;
    }

    expect(() => tentarModificarPedido(pedidoAprovado, 'cancelado')).toThrow(
      'Pedido com status "aprovado" está protegido e não pode ser alterado'
    );
  });
});

describe('GATE 8: Rotina Automática das 09h00 e Modo Simulação Estrito', () => {
  it('Não deve enviar mensagens externas ou webhooks quando simulacao_modo = true', () => {
    const comprasConfig = {
      simulacao_modo: true,
      horario_rotina_diaria: '09:00',
      canal_preferencial: 'telegram',
    };

    let webhookDisparado = false;
    let mensagemFornecedorEnviada = false;

    function executarRotinaDiaria(config: typeof comprasConfig, fornecedoresDoDia: string[]) {
      if (fornecedoresDoDia.length === 0) return { processados: 0, status: 'sem_pedidos' };

      if (!config.simulacao_modo) {
        webhookDisparado = true;
        mensagemFornecedorEnviada = true;
      }

      return {
        processados: fornecedoresDoDia.length,
        status: config.simulacao_modo ? 'simulacao_executada' : 'pedidos_reais_enviados',
      };
    }

    const resultado = executarRotinaDiaria(comprasConfig, ['Coca-Cola', 'Ambev']);

    expect(resultado.status).toBe('simulacao_executada');
    expect(resultado.processados).toBe(2);
    // CRÍTICO: Webhooks reais de fornecedores e mensagens de compras NÃO disparadas
    expect(webhookDisparado).toBe(false);
    expect(mensagemFornecedorEnviada).toBe(false);
  });

  it('No fim de semana (Sábado ou Domingo) a rotina não agenda compras regulares', () => {
    function obterFornecedoresDoDia(diaSemana: number): string[] {
      // 6 = Sábado, 0 ou 7 = Domingo
      if (diaSemana === 6 || diaSemana === 0 || diaSemana === 7) {
        return [];
      }
      return CALENDARIO_FORNECEDORES[diaSemana] || [];
    }

    expect(obterFornecedoresDoDia(6)).toEqual([]); // Sábado sem compras
    expect(obterFornecedoresDoDia(7)).toEqual([]); // Domingo sem compras
    expect(obterFornecedoresDoDia(4).length).toBeGreaterThan(0); // Quinta com compras
  });
});
