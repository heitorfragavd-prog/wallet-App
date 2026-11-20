import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CeoProductProfitabilityTab } from './CeoProductProfitabilityTab';

// Mock do cliente Supabase para isolamento e testes determinísticos
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: (...args: unknown[]) => {
        mockSelect(table, ...args);
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(table, ...eqArgs);
            return {
              order: (...orderArgs: unknown[]) => {
                mockOrder(table, ...orderArgs);
                return Promise.resolve({ data: [], error: null });
              },
              then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
            };
          },
        };
      },
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    })),
  },
}));

describe('CeoProductProfitabilityTab — Painel de Rentabilidade e Lucro por Produto (Gate 6)', () => {
  const workspaceId = 'test-workspace-profitability-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renderiza o banner de conformidade, segurança e invariante de imutabilidade (Gate 6 - Read-Only)', async () => {
    await act(async () => {
      render(<CeoProductProfitabilityTab workspaceId={workspaceId} />);
    });

    expect(screen.getByText(/Painel de Rentabilidade e Lucro por Produto \(Gate 6\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Imutável • Read-Only/i)).toBeInTheDocument();
    expect(screen.getByText(/Os preços de venda e estoques nunca são alterados automaticamente/i)).toBeInTheDocument();
  });

  it('2. Apresenta o Resumo Executivo completo (Produtos no Catálogo, Com Custo, Sem Custo e Margem Ponderada)', async () => {
    await act(async () => {
      render(<CeoProductProfitabilityTab workspaceId={workspaceId} />);
    });

    // Verifica presença dos cards de KPIs do Resumo Executivo
    expect(screen.getByText(/Produtos no Catálogo/i)).toBeInTheDocument();
    expect(screen.getByText(/Com Custo Apurado/i)).toBeInTheDocument();
    expect(screen.getByText(/Sem Custo Cadastrado/i)).toBeInTheDocument();
    expect(screen.getByText(/Margem Bruta Ponderada/i)).toBeInTheDocument();

    // Base auditada inicial possui 27 produtos com cobertura de custos
    expect(screen.getByText(/Base auditada por NF ou Ficha Técnica/i)).toBeInTheDocument();
  });

  it('3. Exibe rankings de Produtos Mais Lucrativos (Top Lucro Bruto R$) e Menor Margem / Crítica', async () => {
    await act(async () => {
      render(<CeoProductProfitabilityTab workspaceId={workspaceId} />);
    });

    // Ranking de maior lucro bruto unitário
    expect(screen.getByText(/Top Lucrativos \(Maior Lucro Bruto Unitário\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Menor Margem • Margem Crítica/i)).toBeInTheDocument();

    // Produtos de alta margem monetária (ex: Monster Energy ou Red Bull) devem estar visíveis
    expect(screen.getAllByText(/Monster Energy/i).length).toBeGreaterThan(0);
  });

  it('4. Permite filtrar produtos pelo campo de busca interativo', async () => {
    await act(async () => {
      render(<CeoProductProfitabilityTab workspaceId={workspaceId} />);
    });

    const searchInput = screen.getByPlaceholderText(/Buscar por produto, código ou categoria/i);
    expect(searchInput).toBeInTheDocument();

    // Busca por "Pão de Queijo"
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Pão de Queijo' } });
    });

    expect(screen.getAllByText(/Pão de Queijo/i).length).toBeGreaterThan(0);
    // Produto não relacionado não deve aparecer na tabela filtrada
    expect(screen.queryByText(/Cerveja Heineken/i)).not.toBeInTheDocument();
  });

  it('5. Aba "Sem Custo": Lista produtos sem custo cadastrado com alerta de auditoria fiscal e princípio Fail-Closed', async () => {
    await act(async () => {
      render(<CeoProductProfitabilityTab workspaceId={workspaceId} />);
    });

    const tabSemCusto = screen.getByRole('tab', { name: /Sem Custo/i });
    await act(async () => {
      fireEvent.click(tabSemCusto);
    });

    expect(screen.getByText(/Auditoria Fiscal Necessária/i)).toBeInTheDocument();
    expect(screen.getByText(/Princípio Fail-Closed de Conversão de Embalagens \(Gate 3\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Picolé Artesanal Especial Frutas/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bolo Caseiro Fatia Tradicional/i).length).toBeGreaterThan(0);
  });

  it('6. Aba "Evolução de Custos": Apresenta linha do tempo cronológica com histórico de compras e alertas de aumento (>= 10%)', async () => {
    await act(async () => {
      render(<CeoProductProfitabilityTab workspaceId={workspaceId} />);
    });

    const tabHistorico = screen.getByRole('tab', { name: /Evolução de Custos/i });
    await act(async () => {
      fireEvent.click(tabHistorico);
    });

    expect(screen.getByText(/Evolução Temporal de Custos & Alertas de Fornecedores \(Gate 5\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Compras/i)).toBeInTheDocument();
    expect(screen.getByText(/Menor Custo/i)).toBeInTheDocument();
    expect(screen.getByText(/Maior Custo/i)).toBeInTheDocument();

    // Histórico de compras Xodó Foods / Três Corações
    expect(screen.getAllByText(/Xodó Foods/i).length).toBeGreaterThan(0);
    // Detecção do aumento expressivo de 11.9% em 20/11
    expect(screen.getAllByText(/≥ 10% Aumento/i).length).toBeGreaterThan(0);
  });

  it('7. Aba "Combos & Categorias": Exibe margem média por categoria e rentabilidade estimada de combos', async () => {
    await act(async () => {
      render(<CeoProductProfitabilityTab workspaceId={workspaceId} />);
    });

    const tabCombos = screen.getByRole('tab', { name: /Combos & Categorias/i });
    await act(async () => {
      fireEvent.click(tabCombos);
    });

    expect(screen.getByText(/Margem Bruta por Categoria de Produto/i)).toBeInTheDocument();
    expect(screen.getByText(/Rentabilidade Estimada de Combos/i)).toBeInTheDocument();

    // Categorias auditadas
    expect(screen.getAllByText(/Cafeteria/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Salgados & Padaria/i).length).toBeGreaterThan(0);

    // Combos auditados (ex: 2 Pães de Queijo, 1 Café + 2 Pães de Queijo)
    expect(screen.getAllByText(/2 Pães de Queijo \(Dupla\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 Café \+ 2 Pães de Queijo/i).length).toBeGreaterThan(0);
  });

  it('8. Aba "Sugestões de Preço": Apresenta simulador determinístico e seguro sem alterar o PDV', async () => {
    await act(async () => {
      render(<CeoProductProfitabilityTab workspaceId={workspaceId} />);
    });

    const tabSugestoes = screen.getByRole('tab', { name: /Sugestões de Preço/i });
    await act(async () => {
      fireEvent.click(tabSugestoes);
    });

    expect(screen.getByText(/Sugestões Inteligentes de Revisão de Preços \(Simulador Seguro\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Modo Simulação: Nenhuma alteração é gravada no PDV/i)).toBeInTheDocument();
    expect(screen.getByText(/Preço Sugerido = Custo Unitário \/ \(1 − Margem Alvo\)/i)).toBeInTheDocument();

    // Cabeçalho da tabela de sugestões
    expect(screen.getByText(/Preço Sugerido Alvo/i)).toBeInTheDocument();
    expect(screen.getByText(/Ajuste Estimado/i)).toBeInTheDocument();
  });

  it('9. Invariante de Segurança Estrita: NENHUMA mutação de insert/update/delete é disparada', async () => {
    await act(async () => {
      render(<CeoProductProfitabilityTab workspaceId={workspaceId} />);
    });

    // Interage com as abas e filtros
    const tabSugestoes = screen.getByRole('tab', { name: /Sugestões de Preço/i });
    await act(async () => {
      fireEvent.click(tabSugestoes);
    });

    const refreshButton = screen.getByRole('button', { name: /Atualizar/i });
    await act(async () => {
      fireEvent.click(refreshButton);
    });

    // Garante que o componente nunca invocou mutações no banco
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
