import React from 'react'
import type { DateRange } from '@/types'

interface DateFilterProps {
  selected: DateRange
  onChange: (range: DateRange) => void
  startDate?: string
  endDate?: string
  onStartDateChange?: (date: string) => void
  onEndDateChange?: (date: string) => void
}

const ranges: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'year', label: 'Ano' },
  { value: 'custom', label: 'Período' },
]

export const DateFilter: React.FC<DateFilterProps> = ({
  selected,
  onChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="flex items-center bg-dark-800/60 rounded-xl border border-dark-700/50 p-1">
      {ranges.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
            selected === range.value
              ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700/50'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>

    {selected === 'custom' && (
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={startDate || ''}
          onChange={(e) => onStartDateChange?.(e.target.value)}
          className="input-field !py-1.5 !px-3 !text-xs w-36"
        />
        <span className="text-dark-500 text-xs">até</span>
        <input
          type="date"
          value={endDate || ''}
          onChange={(e) => onEndDateChange?.(e.target.value)}
          className="input-field !py-1.5 !px-3 !text-xs w-36"
        />
      </div>
    )}
  </div>
)
