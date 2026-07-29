// Hook para gerenciar o estado de filtro de data range
// Usado em conjunto com o componente DateRangePicker

import { useState, useCallback, useMemo } from 'react';
import type { DateRange } from './DateRangePicker';

interface UseDateRangeFilterOptions {
  defaultPeriod?: 'all' | 'today';
  storageKey?: string;
}

// Retorna a data de hoje no formato YYYY-MM-DD (local time)
function getTodayString(): string {
  const hoje = new Date();
  const year = hoje.getFullYear();
  const month = String(hoje.getMonth() + 1).padStart(2, '0');
  const day = String(hoje.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useDateRangeFilter(options?: UseDateRangeFilterOptions): {
  dateRange: DateRange;
  setRange: (start: string, end: string) => void;
  clearFilter: () => void;
} {
  const defaultPeriod = options?.defaultPeriod ?? 'all';
  
  const initialDateRange = useMemo<DateRange>(() => {
    if (defaultPeriod === 'today') {
      const hoje = getTodayString();
      return {
        startDate: hoje,
        endDate: hoje,
        label: 'Hoje',
        period: 'today',
      };
    }
    return {
      startDate: null,
      endDate: null,
      label: 'Todos os períodos',
      period: 'all',
    };
  }, [defaultPeriod]);

  const [dateRange, setDateRange] = useState<DateRange>(initialDateRange);

  const setRange = useCallback((start: string, end: string) => {
    setDateRange({ startDate: start, endDate: end, label: `${start} – ${end}`, period: 'custom' });
  }, []);

  const clearFilter = useCallback(() => {
    setDateRange({ startDate: null, endDate: null, label: 'Todos os períodos', period: 'all' });
  }, []);

  return { dateRange, setRange, clearFilter };
}
