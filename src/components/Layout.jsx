import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
    LayoutDashboard, Package, ShoppingCart,
    TrendingDown, CreditCard, LogOut, Menu, X, Truck, FolderTree,
    ClipboardList, DollarSign, FlaskConical, AlertTriangle, ArrowLeftRight,
    User
} from 'lucide-react'
import { useState } from 'react'

const NAV_ITEMS = [
    { key: 'dashboard', to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { key: 'inventario', to: '/inventario', icon: Package, label: 'Inventario' },
    { key: 'ventas', to: '/ventas', icon: ShoppingCart, label: 'Ventas' },
    { key: 'pedidos_campo', to: '/nuevo-pedido', icon: ClipboardList, label: 'Pedidos en Campo' },
    { key: 'pedidos', to: '/pedidos', icon: ClipboardList, label: 'Pedidos' },
    { key: 'compras', to: '/compras', icon: Truck, label: 'Compras' },
    { key: 'cxc', to: '/cuentas-cobrar', icon: DollarSign, label: 'Cuentas x Cobrar' },
    { key: 'cxp', to: '/cuentas-pagar', icon: CreditCard, label: 'Cuentas x Pagar' },
    { key: 'gastos', to: '/gastos', icon: DollarSign, label: 'Gastos' },
    { key: 'produccion', to: '/produccion', icon: FlaskConical, label: 'Producción' },
    { key: 'cambios', to: '/cambios-mano-mano', icon: ArrowLeftRight, label: 'Cambios Mano a Mano' },
    { key: 'mermas', to: '/mermas', icon: AlertTriangle, label: 'Mermas' },
    { key: 'administracion', to: '/administracion', icon: FolderTree, label: 'Administración' },
]

export default function Layout() {
    const { perfil, logout, modulosActivos } = useAuth()
    const navigate = useNavigate()
    const [open, setOpen] = useState(true)

    const navFiltrado = modulosActivos === null
        ? []
        : NAV_ITEMS.filter(item => modulosActivos.includes(item.key))

    const [modalPass, setModalPass] = useState(false)
    const [passNueva, setPassNueva] = useState('')
    const [passConfirmar, setPassConfirmar] = useState('')
    const [guardandoPass, setGuardandoPass] = useState(false)
    const [errorPass, setErrorPass] = useState('')
    const [exitoPass, setExitoPass] = useState(false)

    function abrirModalPass() {
        setPassNueva(''); setPassConfirmar('')
        setErrorPass(''); setExitoPass(false); setModalPass(true)
    }

    async function cambiarPassword() {
        if (!passNueva || passNueva.length < 6) { setErrorPass('La nueva contraseña debe tener al menos 6 caracteres'); return }
        if (passNueva !== passConfirmar) { setErrorPass('Las contraseñas no coinciden'); return }
        setGuardandoPass(true); setErrorPass('')

        const { error } = await supabase.auth.updateUser({ password: passNueva })
        if (error) { setErrorPass('Error: ' + error.message); setGuardandoPass(false); return }

        setGuardandoPass(false)
        setExitoPass(true)
        setTimeout(() => setModalPass(false), 2000)
    }

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
                    {open && <span style={{ fontWeight: 600, fontSize: '14px', color: '#1f2937' }}>MiPOS</span>}
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
                            <button onClick={abrirModalPass}
                                style={{ marginTop: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#9ca3af', padding: 0, textDecoration: 'underline' }}>
                                Cambiar contraseña
                            </button>
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

            {/* Modal cambiar contraseña */}
            {modalPass && (
                <>
                    <div onClick={() => setModalPass(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '380px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 20px' }}>Cambiar contraseña</h3>

                        {exitoPass ? (
                            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#166534', textAlign: 'center' }}>
                                ✅ Contraseña actualizada correctamente
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {[
                                    { label: 'Nueva contraseña', value: passNueva, set: setPassNueva, placeholder: 'Mínimo 6 caracteres' },
                                    { label: 'Confirmar nueva contraseña', value: passConfirmar, set: setPassConfirmar, placeholder: 'Repite la nueva contraseña' },
                                ].map(f => (
                                    <div key={f.label}>
                                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>{f.label}</label>
                                        <input type="password" value={f.value} onChange={e => f.set(e.target.value)}
                                            placeholder={f.placeholder}
                                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }} />
                                    </div>
                                ))}

                                {errorPass && (
                                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626' }}>
                                        {errorPass}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                                    <button onClick={cambiarPassword} disabled={guardandoPass}
                                        style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoPass ? 0.6 : 1 }}>
                                        {guardandoPass ? 'Guardando...' : 'Guardar'}
                                    </button>
                                    <button onClick={() => setModalPass(false)}
                                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
