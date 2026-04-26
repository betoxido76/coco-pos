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
import Cotizador from './pages/Cotizador'
import Finanzas from './pages/Finanzas'
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

function ModuloProtegido({ modulo, children }) {
  const { perfil, modulosActivos } = useAuth()
  if (modulosActivos === null) return null // aún cargando
  if (perfil?.rol === 'superadmin') return children
  if (modulosActivos.includes(modulo)) return children
  return <Navigate to="/" replace />
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
        <Route index element={<ModuloProtegido modulo="dashboard"><Dashboard /></ModuloProtegido>} />
        <Route path="inventario" element={<ModuloProtegido modulo="inventario"><Inventario /></ModuloProtegido>} />
        <Route path="ventas" element={<ModuloProtegido modulo="ventas"><Ventas /></ModuloProtegido>} />
        <Route path="compras" element={<ModuloProtegido modulo="compras"><Compras /></ModuloProtegido>} />
        <Route path="administracion" element={<ModuloProtegido modulo="administracion"><Administracion /></ModuloProtegido>} />
        <Route path="cuentas-cobrar" element={<ModuloProtegido modulo="cxc"><CuentasCobrar /></ModuloProtegido>} />
        <Route path="cuentas-pagar" element={<ModuloProtegido modulo="cxp"><CuentasPagar /></ModuloProtegido>} />
        <Route path="produccion" element={<ModuloProtegido modulo="produccion"><Produccion /></ModuloProtegido>} />
        <Route path="mermas" element={<ModuloProtegido modulo="mermas"><Mermas /></ModuloProtegido>} />
        <Route path="pedidos" element={<ModuloProtegido modulo="pedidos"><Pedidos /></ModuloProtegido>} />
        <Route path="nuevo-pedido" element={<ModuloProtegido modulo="pedidos_campo"><NuevoPedido onPedidoCreado={() => { }} /></ModuloProtegido>} />
        <Route path="cambios-mano-mano" element={<ModuloProtegido modulo="cambios"><CambiosManoMano /></ModuloProtegido>} />
        <Route path="cotizador" element={<ModuloProtegido modulo="cotizador"><Cotizador /></ModuloProtegido>} />
        <Route path="finanzas" element={<ModuloProtegido modulo="finanzas"><Finanzas /></ModuloProtegido>} />
        <Route path="gastos" element={<ModuloProtegido modulo="gastos"><Gastos /></ModuloProtegido>} />
        <Route path="superadmin" element={<SuperAdmin />} />
        <Route path="reset-password" element={<ResetPassword />} />
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
