import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Warehouse,
  PackagePlus,
  ShoppingCart,
  Receipt,
  BarChart3,
  ChevronLeft,
  Shirt,
} from 'lucide-react'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/produtos', label: 'Produtos', icon: Package },
  { path: '/estoque', label: 'Estoque', icon: Warehouse },
  { path: '/entradas', label: 'Entradas', icon: PackagePlus },
  { path: '/vendas', label: 'Vendas', icon: ShoppingCart },
  { path: '/despesas', label: 'Despesas', icon: Receipt },
  { path: '/relatorios', label: 'Relatórios', icon: BarChart3 },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const location = useLocation()

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="lg:hidden fixed inset-0 bg-dark-950/60 backdrop-blur-sm z-40"
          onClick={onToggle}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-screen
          bg-dark-900/95 backdrop-blur-xl border-r border-dark-700/50
          transition-all duration-300 ease-in-out flex flex-col
          ${collapsed ? '-translate-x-full lg:translate-x-0 lg:w-20' : 'translate-x-0 w-64'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-dark-700/50 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center shadow-lg shadow-brand-600/20 shrink-0">
            <Shirt className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="text-sm font-bold text-dark-50 tracking-tight">ERP Atacado</h1>
              <p className="text-[10px] text-dark-500 font-medium">Gestão Inteligente</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => {
                  if (window.innerWidth < 1024) onToggle()
                }}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200 group relative
                  ${
                    isActive
                      ? 'bg-brand-600/15 text-brand-300 shadow-sm'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/50'
                  }
                `}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-500 rounded-r-full" />
                )}
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-brand-400' : 'group-hover:text-dark-300'}`} />
                {!collapsed && (
                  <span className="animate-fade-in">{item.label}</span>
                )}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-dark-800 text-dark-200 text-xs font-medium rounded-lg shadow-xl
                                  opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50
                                  hidden lg:block">
                    {item.label}
                  </div>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Collapse toggle - desktop only */}
        <div className="hidden lg:block px-3 pb-4">
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-dark-500 hover:text-dark-300 hover:bg-dark-800/50 transition-all duration-200"
          >
            <ChevronLeft
              className={`w-4 h-4 transition-transform duration-300 ${
                collapsed ? 'rotate-180' : ''
              }`}
            />
            {!collapsed && <span className="text-xs font-medium">Recolher</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
