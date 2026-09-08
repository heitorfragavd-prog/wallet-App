import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Colaborador } from './useColaboradores';
import { useColaboradorCalculos } from './useColaboradorCalculos';

const funcionarioSemAdmissao: Colaborador = {
  id: 'funcionario-sem-admissao',
  nome: 'Funcionaria sem admissao',
  foto_url: null,
  tipo: 'funcionario',
  cargo: null,
  data_admissao: null,
  data_demissao: null,
  salario_bruto: 1_621,
  vale_transporte: 0,
  vale_refeicao: 0,
  outros_beneficios: 0,
  status: null,
  dias_experiencia: 90,
  carga_horaria_semanal: 44,
  created_at: '2026-08-17T12:00:00Z',
};

describe('useColaboradorCalculos', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mantem estado e dias da experiencia nulos com status e admissao ausentes', () => {
    const { result } = renderHook(() => useColaboradorCalculos(
      funcionarioSemAdmissao,
      [],
      [],
      '2026-08',
    ));

    expect(result.current.estadoContrato).toBeNull();
    expect(result.current.diasParaFimExperiencia).toBeNull();
  });

  it('trata status nulo como ativo quando ha data de admissao', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T15:00:00Z'));
    const { result } = renderHook(() => useColaboradorCalculos(
      { ...funcionarioSemAdmissao, data_admissao: '2026-08-01', dias_experiencia: 45 },
      [],
      [],
      '2026-08',
    ));

    expect(result.current.estadoContrato).toEqual({
      estado: 'experiencia',
      diasRestantes: 29,
      dataFim: '2026-09-15',
    });
    expect(result.current.diasParaFimExperiencia).toBe(29);
  });
});
