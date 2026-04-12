import React from 'react'
import { Package } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 animate-fade-in">
    <div className="w-16 h-16 rounded-2xl bg-dark-800/80 border border-dark-700/50 flex items-center justify-center mb-5">
      {icon || <Package className="w-8 h-8 text-dark-500" />}
    </div>
    <h3 className="text-lg font-semibold text-dark-200 mb-2">{title}</h3>
    <p className="text-dark-400 text-sm text-center max-w-md mb-6">{description}</p>
    {action}
  </div>
)
