import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventario from './pages/Inventario'
import Ventas from './pages/Ventas'
import Compras from './pages/Compras'
import Administracion from './pages/Administracion'
import CuentasCobrar from './pages/CuentasCobrar'
import CuentasPagar from './pages/CuentasPagar'
import Produccion from './pages/Produccion'
import Mermas from './pages/Mermas'
import Pedidos from './pages/Pedidos'
import NuevoPedido from './pages/NuevoPedido'
import CambiosManoMano from './pages/CambiosManoMano'
import SuperAdmin from './pages/SuperAdmin'
import Gastos from './pages/Gastos'
import ResetPassword from './pages/ResetPassword'
import './index.css'

function RutaProtegida({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-500 text-sm">Cargando...</div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function App() {
  const { user, perfil, loading } = useAuth()
  if (loading) return null

  // Vendedores van directo al módulo de pedidos sin ver el resto del sistema
  if (user && perfil?.rol === 'vendedor') {
    return (
      <Routes>
        <Route path="/login" element={<Navigate to="/nuevo-pedido" replace />} />
        <Route path="/nuevo-pedido" element={
          <RutaProtegida>
            <NuevoPedido onPedidoCreado={() => { }} />
          </RutaProtegida>
        } />
        <Route path="*" element={<Navigate to="/nuevo-pedido" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<RutaProtegida><Layout /></RutaProtegida>}>
        <Route index element={<Dashboard />} />
        <Route path="inventario" element={<Inventario />} />
        <Route path="ventas" element={<Ventas />} />
        <Route path="compras" element={<Compras />} />
        <Route path="administracion" element={<Administracion />} />
        <Route path="cuentas-cobrar" element={<CuentasCobrar />} />
        <Route path="cuentas-pagar" element={<CuentasPagar />} />
        <Route path="produccion" element={<Produccion />} />
        <Route path="mermas" element={<Mermas />} />
        <Route path="pedidos" element={<Pedidos />} />
        <Route path="nuevo-pedido" element={<NuevoPedido onPedidoCreado={() => { }} />} />
        <Route path="cambios-mano-mano" element={<CambiosManoMano />} />
        <Route path="/superadmin" element={<SuperAdmin />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)
