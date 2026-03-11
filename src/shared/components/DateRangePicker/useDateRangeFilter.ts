/**
 * useDateRangeFilter
 *
 * Hook para gerenciar filtro de período de datas.
 * Suporta períodos rápidos (hoje, semana, mês, etc.) e datas personalizadas.
 * Persiste o estado via sessionStorage para manter o filtro ao navegar.
 */

import { useState, useCallback } from 'react';

export type QuickPeriod =
  | 'all'
  | 'today'
  | 'week'
  | 'month'
  | 'last_month'
  | 'year'
  | 'next_7'
  | 'next_30'
  | 'next_90'
  | 'custom';

export interface DateRange {
  startDate: string | null; // 'YYYY-MM-DD'
  endDate: string | null;   // 'YYYY-MM-DD'
  period: QuickPeriod;
  label: string;
}

// ── Helpers ───────────────────────────────────────────────────────

const toISO = (date: Date): string => date.toISOString().split('T')[0];

function getToday(): string {
  return toISO(new Date());
}

function computeRange(period: QuickPeriod, customStart?: string, customEnd?: string): DateRange {
  const now = new Date();
  const today = toISO(now);

  switch (period) {
    case 'all':
      return { startDate: null, endDate: null, period, label: 'Todos' };

    case 'today':
      return { startDate: today, endDate: today, period, label: 'Hoje' };

    case 'week': {
      const dayOfWeek = now.getDay(); // 0=Dom, 1=Seg...
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(now);
      monday.setDate(diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { startDate: toISO(monday), endDate: toISO(sunday), period, label: 'Esta semana' };
    }

    case 'month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: toISO(firstDay), endDate: toISO(lastDay), period, label: 'Este mês' };
    }

    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: toISO(firstDay), endDate: toISO(lastDay), period, label: 'Mês anterior' };
    }

    case 'year': {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      const lastDay = new Date(now.getFullYear(), 11, 31);
      return { startDate: toISO(firstDay), endDate: toISO(lastDay), period, label: 'Este ano' };
    }

    case 'next_7': {
      const end = new Date(now);
      end.setDate(now.getDate() + 7);
      return { startDate: today, endDate: toISO(end), period, label: 'Próximos 7 dias' };
    }

    case 'next_30': {
      const end = new Date(now);
      end.setDate(now.getDate() + 30);
      return { startDate: today, endDate: toISO(end), period, label: 'Próximos 30 dias' };
    }

    case 'next_90': {
      const end = new Date(now);
      end.setDate(now.getDate() + 90);
      return { startDate: today, endDate: toISO(end), period, label: 'Próximos 90 dias' };
    }

    case 'custom':
      return {
        startDate: customStart ?? null,
        endDate: customEnd ?? null,
        period,
        label: customStart && customEnd ? `${customStart} → ${customEnd}` : 'Personalizado',
      };

    default:
      return { startDate: null, endDate: null, period: 'all', label: 'Todos' };
  }
}

// ── Hook ──────────────────────────────────────────────────────────

interface UseDateRangeFilterOptions {
  /**
   * Período padrão ao montar o componente.
   * @default 'month'
   */
  defaultPeriod?: QuickPeriod;
  /**
   * Chave para persistência em sessionStorage.
   * Se omitido, o estado não é persistido.
   */
  storageKey?: string;
}

interface UseDateRangeFilterReturn {
  dateRange: DateRange;
  setQuickPeriod: (period: QuickPeriod) => void;
  setCustomRange: (startDate: string, endDate: string) => void;
  clearFilter: () => void;
  /** true quando startDate ou endDate estão definidos */
  isFiltered: boolean;
}

export function useDateRangeFilter(
  options: UseDateRangeFilterOptions = {}
): UseDateRangeFilterReturn {
  const { defaultPeriod = 'month', storageKey } = options;

  const getInitialState = (): DateRange => {
    if (storageKey) {
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) return JSON.parse(stored) as DateRange;
      } catch {
        // ignora erros de parse
      }
    }
    return computeRange(defaultPeriod);
  };

  const [dateRange, setDateRange] = useState<DateRange>(getInitialState);

  const persist = useCallback(
    (range: DateRange) => {
      setDateRange(range);
      if (storageKey) {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(range));
        } catch {
          // ignora erros de storage
        }
      }
    },
    [storageKey]
  );

  const setQuickPeriod = useCallback(
    (period: QuickPeriod) => {
      if (period !== 'custom') {
        persist(computeRange(period));
      }
    },
    [persist]
  );

  const setCustomRange = useCallback(
    (startDate: string, endDate: string) => {
      persist(computeRange('custom', startDate, endDate));
    },
    [persist]
  );

  const clearFilter = useCallback(() => {
    persist(computeRange('all'));
  }, [persist]);

  const isFiltered = dateRange.startDate !== null || dateRange.endDate !== null;

  return { dateRange, setQuickPeriod, setCustomRange, clearFilter, isFiltered };
}

export { getToday };
