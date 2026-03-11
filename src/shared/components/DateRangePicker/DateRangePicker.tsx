/**
 * DateRangePicker
 *
 * Componente de filtro por período de datas, com visual consistente
 * com o padrão do Wallet App (acento laranja, fundo escuro, ícone calendário).
 *
 * Suporta períodos rápidos clicáveis e seleção personalizada de data.
 */

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { QuickPeriod, DateRange } from './useDateRangeFilter';

// ── Tipos ─────────────────────────────────────────────────────────

interface QuickOption {
  value: QuickPeriod;
  label: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onPeriodChange: (period: QuickPeriod) => void;
  onCustomChange: (startDate: string, endDate: string) => void;
  onClear?: () => void;
  quickOptions?: QuickOption[];
  placeholder?: string;
  className?: string;
  /** Se true, mostra o botão de limpar (voltar para "Todos") */
  showClear?: boolean;
}

// ── Opções padrão ─────────────────────────────────────────────────

export const DEFAULT_QUICK_OPTIONS: QuickOption[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'year', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
];

export const FUTURE_QUICK_OPTIONS: QuickOption[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'next_7', label: 'Próximos 7 dias' },
  { value: 'next_30', label: 'Próximos 30 dias' },
  { value: 'next_90', label: 'Próximos 90 dias' },
  { value: 'all', label: 'Todos' },
  { value: 'custom', label: 'Personalizado' },
];

// ── Componente ────────────────────────────────────────────────────

export const DateRangePicker = ({
  value,
  onPeriodChange,
  onCustomChange,
  onClear,
  quickOptions = DEFAULT_QUICK_OPTIONS,
  placeholder = 'Selecionar período',
  className = '',
  showClear = true,
}: DateRangePickerProps) => {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(value.startDate ?? '');
  const [customEnd, setCustomEnd] = useState(value.endDate ?? '');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isFiltered = value.period !== 'all';

  const handlePeriodSelect = (period: QuickPeriod) => {
    if (period !== 'custom') {
      onPeriodChange(period);
      setOpen(false);
    }
    // Se custom, mantém o menu aberto para preencher as datas
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onCustomChange(customStart, customEnd);
      setOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClear?.();
  };

  const formatDisplayLabel = (): string => {
    if (value.period === 'custom' && value.startDate && value.endDate) {
      const fmt = (d: string) => {
        const [y, m, day] = d.split('-');
        return `${day}/${m}/${y}`;
      };
      return `${fmt(value.startDate)} – ${fmt(value.endDate)}`;
    }
    if (value.period === 'all') return placeholder;
    return value.label;
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* ── Trigger Button ── */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`
          flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium
          transition-all duration-200 whitespace-nowrap
          ${isFiltered
            ? 'bg-orange-500/10 border-orange-500 text-orange-400 hover:bg-orange-500/20'
            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-orange-500/50 hover:text-white'
          }
        `}
      >
        <Calendar className="h-4 w-4 flex-shrink-0" />
        <span>{formatDisplayLabel()}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
        {/* Botão de limpar filtro */}
        {isFiltered && showClear && onClear && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={(e) => e.key === 'Enter' && handleClear(e as unknown as React.MouseEvent)}
            className="ml-1 p-0.5 rounded-full hover:bg-orange-500/20 transition-colors cursor-pointer"
            aria-label="Limpar filtro de data"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div className="
          absolute top-full left-0 mt-2 z-50
          bg-slate-900 border border-slate-700 rounded-xl shadow-xl shadow-black/40
          min-w-[220px] overflow-hidden
          animate-in fade-in-0 slide-in-from-top-2 duration-150
        ">
          {/* Períodos rápidos */}
          <div className="p-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide px-2 py-1 mb-1">
              Período rápido
            </p>
            {quickOptions.map((opt) => (
              opt.value !== 'custom' ? (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handlePeriodSelect(opt.value)}
                  className={`
                    w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors
                    ${value.period === opt.value
                      ? 'bg-orange-500/15 text-orange-400 font-medium'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }
                  `}
                >
                  {opt.label}
                </button>
              ) : null
            ))}
          </div>

          {/* Separador + Personalizado */}
          {quickOptions.some((o) => o.value === 'custom') && (
            <>
              <div className="border-t border-slate-700/60 mx-2" />
              <div className="p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => handlePeriodSelect('custom')}
                  className={`
                    w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                    ${value.period === 'custom'
                      ? 'bg-orange-500/15 text-orange-400 font-medium'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }
                  `}
                >
                  📅 Personalizado
                </button>

                {/* Inputs de data customizada */}
                {(value.period === 'custom' || value.period === 'all') && (
                  <div className="space-y-2 pt-1">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Data início</label>
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="
                          w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700
                          text-white text-sm focus:outline-none focus:border-orange-500
                          [color-scheme:dark]
                        "
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Data fim</label>
                      <input
                        type="date"
                        value={customEnd}
                        min={customStart}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="
                          w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700
                          text-white text-sm focus:outline-none focus:border-orange-500
                          [color-scheme:dark]
                        "
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!customStart || !customEnd}
                      onClick={handleCustomApply}
                      className="
                        w-full py-2 rounded-lg bg-orange-500 hover:bg-orange-600
                        text-white text-sm font-medium transition-colors
                        disabled:opacity-40 disabled:cursor-not-allowed
                      "
                    >
                      Aplicar
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Opção "Todos" / limpar */}
          {showClear && onClear && (
            <div className="border-t border-slate-700/60 p-2">
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                🗓 Ver todos
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
