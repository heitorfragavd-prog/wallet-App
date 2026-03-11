// Hook para gerenciar o estado de filtro de data range
// Usado em conjunto com o componente DateRangePicker

import { useState, useCallback } from 'react';
import type { DateRange } from './DateRangePicker';

interface UseDateRangeFilterOptions {
  defaultPeriod?: 'all';
  storageKey?: string;
}

export function useDateRangeFilter(_options?: UseDateRangeFilterOptions): {
  dateRange: DateRange;
  setRange: (start: string, end: string) => void;
  clearFilter: () => void;
} {
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
    label: 'Todos os períodos',
    period: 'all',
  });

  const setRange = useCallback((start: string, end: string) => {
    setDateRange({ startDate: start, endDate: end, label: `${start} – ${end}`, period: 'custom' });
  }, []);

  const clearFilter = useCallback(() => {
    setDateRange({ startDate: null, endDate: null, label: 'Todos os períodos', period: 'all' });
  }, []);

  return { dateRange, setRange, clearFilter };
}
