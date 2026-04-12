import React from 'react'

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  gradient?: string
  className?: string
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  gradient = 'from-brand-600/20 to-accent-600/20',
  className = '',
}) => (
  <div className={`glass-card-hover p-5 relative overflow-hidden ${className}`}>
    {/* Background gradient */}
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-30`} />
    
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-dark-800/60 border border-dark-700/40 flex items-center justify-center">
          {icon}
        </div>
      </div>

      <p className="text-dark-400 text-xs font-medium uppercase tracking-wider mb-1">
        {title}
      </p>
      
      <p className="text-2xl font-bold text-dark-50 tracking-tight">
        {value}
      </p>

      {subtitle && (
        <p className="text-dark-500 text-xs mt-1.5">
          {subtitle}
        </p>
      )}
    </div>
  </div>
)
