import React from 'react'
import { Menu, Bell } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/produtos': 'Produtos',
  '/estoque': 'Estoque',
  '/entradas': 'Entrada de Mercadorias',
  '/vendas': 'Vendas',
  '/despesas': 'Despesas',
  '/relatorios': 'Relatórios',
}

interface HeaderProps {
  onMenuToggle: () => void
  lowStockCount?: number
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle, lowStockCount = 0 }) => {
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'ERP Atacado'

  return (
    <header className="sticky top-0 z-30 h-16 bg-dark-950/80 backdrop-blur-xl border-b border-dark-700/30 flex items-center justify-between px-5 lg:px-8">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="btn-icon lg:hidden"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-dark-50">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {lowStockCount > 0 && (
          <div className="relative">
            <button className="btn-icon relative">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-danger-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                {lowStockCount}
              </span>
            </button>
          </div>
        )}
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-white text-xs font-bold">
          A
        </div>
      </div>
    </header>
  )
}
