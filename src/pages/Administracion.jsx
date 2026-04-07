import { useState } from 'react'
import { Package, Beaker, Layers, Users, Settings, Truck } from 'lucide-react'
import Productos from './Productos'
import MateriasPrimas from './MateriasPrimas'
import Clientes from './Clientes'
import Proveedores from './Proveedores'
import Configuracion from './Configuracion'

const TABS = [
    { key: 'productos', label: 'Productos', icon: Package },
    { key: 'mp', label: 'Materias Primas', icon: Beaker },
    { key: 'empaque', label: 'Materiales de Empaque', icon: Layers },
    { key: 'clientes', label: 'Clientes', icon: Users },
    { key: 'proveedores', label: 'Proveedores', icon: Truck },
    { key: 'tasas', label: 'Tasas de Cambio', icon: Settings },
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
                        <button
                            key={tab.key}
                            onClick={() => setTabActiva(tab.key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
                                borderColor: tabActiva === tab.key ? '#16a34a' : '#e5e7eb',
                                backgroundColor: tabActiva === tab.key ? '#f0fdf4' : '#fff',
                                color: tabActiva === tab.key ? '#16a34a' : '#6b7280'
                            }}
                        >
                            <tab.icon size={14} /> {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Contenido del tab */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {tabActiva === 'productos' && <Productos />}
                {tabActiva === 'mp' && <MateriasPrimas tabInicial="materias_primas" />}
                {tabActiva === 'empaque' && <MateriasPrimas tabInicial="materiales_empaque" />}
                {tabActiva === 'clientes' && <Clientes />}
                {tabActiva === 'proveedores' && <Proveedores />}
                {tabActiva === 'tasas' && <Configuracion />}
            </div>
        </div>
    )
}
