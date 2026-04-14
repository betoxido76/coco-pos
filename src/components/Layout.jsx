import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LayoutDashboard, Package, ShoppingCart, Settings, Users, TrendingDown, CreditCard, LogOut, Menu, X, Truck, FolderTree } from 'lucide-react'
import { useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { AlertTriangle } from 'lucide-react'


const nav = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/inventario', icon: Package, label: 'Inventario' },
    { to: '/ventas', icon: ShoppingCart, label: 'Ventas' },
    { to: '/compras', icon: Truck, label: 'Compras' },
    { to: '/cuentas-cobrar', icon: CreditCard, label: 'Cuentas x Cobrar' },
    { to: '/cuentas-pagar', icon: TrendingDown, label: 'Cuentas x Pagar' },
    { to: '/produccion', icon: FlaskConical, label: 'Producción' },
    { to: '/mermas', icon: AlertTriangle, label: 'Mermas' },
    { to: '/administracion', icon: FolderTree, label: 'Administración' },
]

export default function Layout() {
    const { perfil, logout } = useAuth()
    const navigate = useNavigate()
    const [open, setOpen] = useState(true)

    async function handleLogout() {
        await logout()
        navigate('/login')
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f9fafb' }}>

            {/* Sidebar */}
            <aside style={{
                width: open ? '220px' : '60px',
                minWidth: open ? '220px' : '60px',
                transition: 'width 0.2s',
                backgroundColor: '#ffffff',
                borderRight: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                position: 'sticky',
                top: 0,
            }}>

                {/* Logo */}
                <div style={{
                    height: '56px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 16px',
                    borderBottom: '1px solid #f3f4f6'
                }}>
                    {open && <span style={{ fontWeight: 600, fontSize: '14px', color: '#1f2937' }}>🥥 Coco POS</span>}
                    <button
                        onClick={() => setOpen(!open)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', marginLeft: 'auto', padding: '4px' }}
                    >
                        {open ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>

                {/* Nav links */}
                <nav style={{ flex: 1, padding: '12px 8px' }}>
                    {nav.map(({ to, icon: Icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            style={({ isActive }) => ({
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                fontSize: '14px',
                                fontWeight: isActive ? 500 : 400,
                                color: isActive ? '#15803d' : '#4b5563',
                                backgroundColor: isActive ? '#f0fdf4' : 'transparent',
                                marginBottom: '2px',
                                transition: 'background 0.15s',
                            })}
                        >
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
                    <button
                        onClick={handleLogout}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            width: '100%', padding: '10px 12px', borderRadius: '8px',
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '14px', color: '#6b7280', transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.color = '#dc2626' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6b7280' }}
                    >
                        <LogOut size={16} style={{ flexShrink: 0 }} />
                        {open && <span>Cerrar sesión</span>}
                    </button>
                </div>
            </aside>

            {/* Contenido */}
            <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
                <Outlet />
            </main>
        </div>
    )
}
