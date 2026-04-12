import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Products } from '@/pages/Products'
import { Stock } from '@/pages/Stock'
import { StockEntries } from '@/pages/StockEntries'
import { Sales } from '@/pages/Sales'
import { Expenses } from '@/pages/Expenses'
import { Reports } from '@/pages/Reports'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/produtos" element={<Products />} />
          <Route path="/estoque" element={<Stock />} />
          <Route path="/entradas" element={<StockEntries />} />
          <Route path="/vendas" element={<Sales />} />
          <Route path="/despesas" element={<Expenses />} />
          <Route path="/relatorios" element={<Reports />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
