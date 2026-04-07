import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventario from './pages/Inventario'
import Ventas from './pages/Ventas'
import Productos from './pages/Productos'
import MateriasPrimas from './pages/MateriasPrimas'
import Compras from './pages/Compras'
import Configuracion from './pages/Configuracion'
import './index.css'
import Clientes from './pages/Clientes'
import CuentasCobrar from './pages/CuentasCobrar'

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
  const { user, loading } = useAuth()
  if (loading) return null

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<RutaProtegida><Layout /></RutaProtegida>}>
        <Route index element={<Dashboard />} />
        <Route path="inventario" element={<Inventario />} />
        <Route path="ventas" element={<Ventas />} />
        <Route path="productos" element={<Productos />} />
        <Route path="materias-primas" element={<MateriasPrimas />} />
        <Route path="compras" element={<Compras />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="cuentas-cobrar" element={<CuentasCobrar />} />
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
