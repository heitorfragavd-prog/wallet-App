/**
 * DateRangePicker — Seletor de período por calendário visual
 *
 * Desktop: dois meses lado a lado.
 * Mobile: um mês por vez com navegação.
 * Posicionamento: fixed, alinhado à direita do trigger, detecta overflow
 * de viewport automaticamente.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

// ── Helpers de data ──────────────────────────────────────────────────────────

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];
const DAYS_PT = ['dom','seg','ter','qua','qui','sex','sab'];

/** Retorna yyyy-MM-dd no fuso local */
function toISOLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Cria Date a partir de yyyy-MM-dd sem fuso */
function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Formata para exibição: "01 mar, 2026" */
function formatDisplay(iso: string): string {
  const d = fromISO(iso);
  return `${String(d.getDate()).padStart(2,'0')} ${MONTHS_PT[d.getMonth()].slice(0,3).toLowerCase()}, ${d.getFullYear()}`;
}

/** Dias de um mês (ano, mês 0-indexed) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Weekday (0=dom) do primeiro dia do mês */
function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface DateRange {
  startDate: string | null;
  endDate: string | null;
  label: string;
  period: string;
}

interface DateRangePickerProps {
  value: DateRange;
  /** Chamado quando o usuário confirma um range completo */
  onChange: (start: string, end: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
}

// ── Componente de um mês ──────────────────────────────────────────────────────
interface MonthGridProps {
  year: number;
  month: number;
  selecting: boolean;
  hoverDate: string | null;
  startDate: string | null;
  endDate: string | null;
  onDayClick: (iso: string) => void;
  onDayHover: (iso: string) => void;
}

function MonthGrid({ year, month, startDate, endDate, hoverDate, selecting, onDayClick, onDayHover }: MonthGridProps) {
  const total = daysInMonth(year, month);
  const offset = firstWeekday(year, month);
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const start = startDate ? fromISO(startDate).getTime() : null;
  const end = (endDate ? fromISO(endDate) : hoverDate && selecting ? fromISO(hoverDate) : null)?.getTime() ?? null;

  return (
    <div className="min-w-0">
      <p className="text-center font-semibold text-white mb-3 text-sm">
        {MONTHS_PT[month]} {year}
      </p>
      {/* Header dias da semana */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_PT.map(d => (
          <div key={d} className="text-center text-xs text-slate-500 font-medium py-1">{d}</div>
        ))}
      </div>
      {/* Células */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const iso = toISOLocal(new Date(year, month, day));
          const ts = fromISO(iso).getTime();
          const isStart = iso === startDate;
          const isEnd = iso === endDate;
          const rangeMin = start && end ? Math.min(start, end) : start;
          const rangeMax = start && end ? Math.max(start, end) : end;
          const inRange = rangeMin && rangeMax && ts > rangeMin && ts < rangeMax;
          const isToday = iso === toISOLocal(new Date());

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onDayClick(iso)}
              onMouseEnter={() => onDayHover(iso)}
              className={[
                'relative h-9 w-full text-sm flex items-center justify-center transition-colors select-none',
                inRange ? 'bg-blue-600/20' : '',
                (isStart || isEnd)
                  ? 'bg-blue-600 text-white font-bold rounded-full z-10'
                  : inRange
                    ? 'text-white'
                    : isToday
                      ? 'text-blue-400 font-semibold'
                      : 'text-slate-300 hover:bg-slate-700 rounded-full',
              ].join(' ')}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function DateRangePicker({ value, onChange, onClear, placeholder = 'Selecionar período', className = '' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Posição absoluta calculada do dropdown (fixed)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Estado de navegação — mês esquerdo
  const now = new Date();
  const [leftYear, setLeftYear] = useState(now.getFullYear());
  const [leftMonth, setLeftMonth] = useState(now.getMonth());

  // Estado de seleção em andamento
  const [selecting, setSelecting] = useState<'start' | null>(null);
  const [tempStart, setTempStart] = useState<string | null>(value.startDate);
  const [tempEnd, setTempEnd] = useState<string | null>(value.endDate);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Mês direito = leftMonth + 1
  const rightMonth = (leftMonth + 1) % 12;
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear;

  // Calcula posição do dropdown ao abrir
  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const isMobile = vw < 640; // sm breakpoint

    // Largura do dropdown: 640 em desktop, 100vw-32px em mobile
    const dropWidth = isMobile ? Math.min(vw - 32, 340) : Math.min(640, vw - 32);

    // Alinha à direita do trigger. Se ultrapassar à esquerda, move para direita.
    let left = rect.right - dropWidth;
    if (left < 16) left = 16;
    if (left + dropWidth > vw - 16) left = vw - dropWidth - 16;

    setDropPos({ top: rect.bottom + 8, left, width: dropWidth });
  }, []);

  // Fechar ao clicar fora
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Recalcular posição ao rolar/redimensionar
  useEffect(() => {
    if (!open) return;
    calcPos();
    window.addEventListener('scroll', calcPos, true);
    window.addEventListener('resize', calcPos);
    return () => {
      window.removeEventListener('scroll', calcPos, true);
      window.removeEventListener('resize', calcPos);
    };
  }, [open, calcPos]);

  // Fechar com Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);

  // Sincroniza tempStart/End com valor externo
  useEffect(() => {
    setTempStart(value.startDate);
    setTempEnd(value.endDate);
    setSelecting(null);
  }, [value.startDate, value.endDate]);

  const prevMonth = () => {
    if (leftMonth === 0) { setLeftMonth(11); setLeftYear(y => y - 1); }
    else setLeftMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (leftMonth === 11) { setLeftMonth(0); setLeftYear(y => y + 1); }
    else setLeftMonth(m => m + 1);
  };

  const handleDayClick = (iso: string) => {
    if (!selecting || !tempStart) {
      setTempStart(iso);
      setTempEnd(null);
      setSelecting('start');
    } else {
      const start = fromISO(tempStart).getTime();
      const end = fromISO(iso).getTime();
      const finalStart = start <= end ? tempStart : iso;
      const finalEnd = start <= end ? iso : tempStart;
      setTempStart(finalStart);
      setTempEnd(finalEnd);
      setSelecting(null);
      onChange(finalStart, finalEnd);
      setOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempStart(null);
    setTempEnd(null);
    setSelecting(null);
    onClear?.();
  };

  const hasRange = value.startDate && value.endDate;
  const displayLabel = hasRange
    ? `${formatDisplay(value.startDate!)} - ${formatDisplay(value.endDate!)}`
    : placeholder;

  // Mobile: apenas 1 mês por vez
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div className={`relative ${className}`}>
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={[
          'flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 whitespace-nowrap max-w-[260px] sm:max-w-none',
          hasRange
            ? 'bg-blue-600/10 border-blue-500 text-blue-300 hover:bg-blue-600/20'
            : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white',
        ].join(' ')}
      >
        <Calendar className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">{displayLabel}</span>
        {hasRange && onClear && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={e => e.key === 'Enter' && handleClear(e as unknown as React.MouseEvent)}
            className="ml-1 p-0.5 rounded-full hover:bg-blue-500/20 cursor-pointer flex-shrink-0"
            aria-label="Limpar período"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {/* ── Dropdown Calendário (fixed) ── */}
      {open && dropPos && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            zIndex: 9999,
          }}
          className="bg-[#0f1623] border border-slate-700/60 rounded-2xl shadow-2xl p-4 sm:p-5 select-none"
          onMouseLeave={() => setHoverDate(null)}
        >
          {/* Instrução */}
          <p className="text-xs text-slate-500 mb-3 text-center">
            {!selecting && !tempStart
              ? 'Clique em um dia para iniciar a seleção'
              : selecting === 'start'
                ? 'Agora clique no dia final do período'
                : ''}
          </p>

          {/* Navegação */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Grade: 1 mês no mobile, 2 no desktop */}
          <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <MonthGrid
              year={leftYear}
              month={leftMonth}
              startDate={tempStart}
              endDate={tempEnd}
              hoverDate={hoverDate}
              selecting={selecting === 'start'}
              onDayClick={handleDayClick}
              onDayHover={setHoverDate}
            />
            {!isMobile && (
              <MonthGrid
                year={rightYear}
                month={rightMonth}
                startDate={tempStart}
                endDate={tempEnd}
                hoverDate={hoverDate}
                selecting={selecting === 'start'}
                onDayClick={handleDayClick}
                onDayHover={setHoverDate}
              />
            )}
          </div>

          {/* Footer */}
          {tempStart && tempEnd && (
            <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {formatDisplay(tempStart)} → {formatDisplay(tempEnd)}
              </span>
              {onClear && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                >
                  Limpar seleção
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
