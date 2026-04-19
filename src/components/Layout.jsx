import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
    LayoutDashboard, Package, ShoppingCart,
    TrendingDown, CreditCard, LogOut, Menu, X, Truck, FolderTree,
    ClipboardList, DollarSign, FlaskConical, AlertTriangle, ArrowLeftRight
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

const NAV_ITEMS = [
    { key: 'dashboard',      to: '/',                  icon: LayoutDashboard, label: 'Dashboard' },
    { key: 'inventario',     to: '/inventario',         icon: Package,         label: 'Inventario' },
    { key: 'ventas',         to: '/ventas',             icon: ShoppingCart,    label: 'Ventas' },
    { key: 'pedidos',        to: '/pedidos',            icon: ClipboardList,   label: 'Pedidos' },
    { key: 'compras',        to: '/compras',            icon: Truck,           label: 'Compras' },
    { key: 'cxc',            to: '/cuentas-cobrar',     icon: DollarSign,      label: 'Cuentas x Cobrar' },
    { key: 'cxp',            to: '/cuentas-pagar',      icon: CreditCard,      label: 'Cuentas x Pagar' },
    { key: 'produccion',     to: '/produccion',         icon: FlaskConical,    label: 'Producción' },
    { key: 'cambios',        to: '/cambios-mano-mano',  icon: ArrowLeftRight,  label: 'Cambios Mano a Mano' },
    { key: 'mermas',         to: '/mermas',             icon: AlertTriangle,   label: 'Mermas' },
    { key: 'administracion', to: '/administracion',     icon: FolderTree,      label: 'Administración' },
]

export default function Layout() {
    const { perfil, logout } = useAuth()
    const navigate = useNavigate()
    const [open, setOpen] = useState(true)
    const [modulosActivos, setModulosActivos] = useState(null) // null = cargando

    useEffect(() => {
        if (!perfil) return

        // Superadmin ve todo sin restricciones
        if (perfil.rol === 'superadmin') {
            setModulosActivos(NAV_ITEMS.map(i => i.key))
            return
        }

        supabase
            .from('usuario_modulos')
            .select('modulo_id')
            .eq('usuario_id', perfil.id)
            .eq('empresa_id', perfil.empresa_id)
            .eq('activo', true)
            .then(({ data }) => {
                if (data) setModulosActivos(data.map(m => m.modulo_id))
                else setModulosActivos([])
            })
    }, [perfil])

    const navFiltrado = modulosActivos === null
        ? []
        : NAV_ITEMS.filter(item => modulosActivos.includes(item.key))

    async function handleLogout() {
        await logout()
        navigate('/login')
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
            <aside style={{
                width: open ? '220px' : '60px', minWidth: open ? '220px' : '60px',
                transition: 'width 0.2s', backgroundColor: '#ffffff',
                borderRight: '1px solid #e5e7eb', display: 'flex',
                flexDirection: 'column', height: '100vh', position: 'sticky', top: 0,
            }}>
                {/* Logo */}
                <div style={{
                    height: '56px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', padding: '0 16px',
                    borderBottom: '1px solid #f3f4f6'
                }}>
                    {open && <span style={{ fontWeight: 600, fontSize: '14px', color: '#1f2937' }}>🥥 Coco POS</span>}
                    <button onClick={() => setOpen(!open)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', marginLeft: 'auto', padding: '4px' }}>
                        {open ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>

                {/* Nav */}
                <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
                    {modulosActivos === null ? (
                        <div style={{ padding: '20px 12px', fontSize: '12px', color: '#9ca3af' }}>Cargando...</div>
                    ) : navFiltrado.map(({ to, icon: Icon, label }) => (
                        <NavLink key={to} to={to} end={to === '/'}
                            style={({ isActive }) => ({
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '10px 12px', borderRadius: '8px', textDecoration: 'none',
                                fontSize: '14px', fontWeight: isActive ? 500 : 400,
                                color: isActive ? '#15803d' : '#4b5563',
                                backgroundColor: isActive ? '#f0fdf4' : 'transparent',
                                marginBottom: '2px', transition: 'background 0.15s',
                            })}>
                            <Icon size={18} style={{ flexShrink: 0 }} />
                            {open && <span>{label}</span>}
                        </NavLink>
                    ))}
                </nav>

                {/* Usuario + logout */}
                <div style={{ padding: '12px 8px', borderTop: '1px solid #f3f4f6' }}>
                    {open && perfil && (
                        <div style={{ padding: '0 12px', marginBottom: '8px' }}>
                            <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', margin: 0 }}>{perfil.nombre}</p>
                            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{perfil.rol}</p>
                        </div>
                    )}
                    <button onClick={handleLogout}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                            padding: '10px 12px', borderRadius: '8px', background: 'none',
                            border: 'none', cursor: 'pointer', fontSize: '14px', color: '#6b7280',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6b7280' }}>
                        <LogOut size={16} style={{ flexShrink: 0 }} />
                        {open && <span>Cerrar sesión</span>}
                    </button>
                </div>
            </aside>

            <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
                <Outlet />
            </main>
        </div>
    )
}
