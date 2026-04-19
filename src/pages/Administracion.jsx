import { useState } from 'react'
import { Package, Beaker, Users, Settings, Truck, Filter, Tag, Warehouse } from 'lucide-react'
import Productos from './Productos'
import MateriasPrimas from './MateriasPrimas'
import Consumibles from './Consumibles'
import Clientes from './Clientes'
import Proveedores from './Proveedores'
import Configuracion from './Configuracion'
import CargaDatos from './CargaDatos'
import ListasPrecios from './ListasPrecios'
import GestionAlmacenes from './GestionAlmacenes'
import AccesosUsuarios from './AccesosUsuarios'
import { Database } from 'lucide-react'

const TABS = [
    { key: 'productos', label: 'Productos', icon: Package },
    { key: 'insumos', label: 'Insumos', icon: Beaker },
    { key: 'consumibles', label: 'Consumibles', icon: Filter },
    { key: 'clientes', label: 'Clientes', icon: Users },
    { key: 'proveedores', label: 'Proveedores', icon: Truck },
    { key: 'tasas', label: 'Tasas de Cambio', icon: Settings },
    { key: 'listas_precio', label: 'Listas de Precio', icon: Tag },
    { key: 'almacenes', label: 'Almacenes', icon: Warehouse },
    { key: 'carga', label: 'Carga de Datos', icon: Database },
    { key: 'accesos', label: 'Usuarios y accesos', icon: Users },
]

export default function Administracion() {
    const [tabActiva, setTabActiva] = useState('productos')

    return (
        <div style={{ padding: '24px' }}>
            {/* Header y Tabs */}
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Administración y Configuración</h1>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>Gestión unificada de maestros y parámetros del sistema</p>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {TABS.map(tab => (
                        <button key={tab.key} onClick={() => setTabActiva(tab.key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
                                borderColor: tabActiva === tab.key ? '#16a34a' : '#e5e7eb',
                                backgroundColor: tabActiva === tab.key ? '#f0fdf4' : '#fff',
                                color: tabActiva === tab.key ? '#16a34a' : '#6b7280'
                            }}>
                            <tab.icon size={14} /> {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Contenido del tab */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {tabActiva === 'productos' && <Productos />}
                {tabActiva === 'insumos' && <MateriasPrimas />}
                {tabActiva === 'consumibles' && <Consumibles />}
                {tabActiva === 'clientes' && <Clientes />}
                {tabActiva === 'proveedores' && <Proveedores />}
                {tabActiva === 'tasas' && <Configuracion />}
                {tabActiva === 'listas_precio' && <ListasPrecios />}
                {tabActiva === 'almacenes' && <GestionAlmacenes />}
                {tabActiva === 'carga' && <CargaDatos />}
                {tabActiva === 'accesos' && <AccesosUsuarios />}
            </div>
        </div>
    )
}
