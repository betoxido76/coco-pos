import { useState, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import * as XLSX from 'xlsx'
import { Download, Upload, CheckCircle, AlertTriangle, X, FileSpreadsheet } from 'lucide-react'

// ─── Definición de catálogos ───────────────────────────────────
const CATALOGOS = [
    {
        key: 'productos_terminados',
        conflicto: 'sku',
        label: 'Productos Terminados',
        tabla: 'productos_terminados',
        columnas: [
            { campo: 'nombre', header: 'Nombre', requerido: true },
            { campo: 'sku', header: 'SKU', requerido: true },
            { campo: 'descripcion', header: 'Descripcion', requerido: false },
            { campo: 'unidad_medida', header: 'Unidad', requerido: true },
            { campo: 'precio_venta', header: 'Precio Venta', requerido: false },
            { campo: 'costo_promedio', header: 'Costo Promedio', requerido: false },
            { campo: 'stock_actual', header: 'Stock Actual', requerido: false },
            { campo: 'stock_minimo', header: 'Stock Minimo', requerido: false },
            { campo: 'categoria_1', header: 'Categoria 1', requerido: false },
            { campo: 'categoria_2', header: 'Categoria 2', requerido: false },
            { campo: 'tipo_producto', header: 'Tipo', requerido: false },
            { campo: 'vida_util_dias', header: 'Vida Util Dias', requerido: false },
            { campo: 'aplica_iva', header: 'Aplica IVA', requerido: false },
        ],
        defaults: { tipo_producto: 'producido', unidad_medida: 'unidad', aplica_iva: true, activo: true, stock_actual: 0, stock_minimo: 0 }
    },
    {
        key: 'materias_primas',
        conflicto: 'codigo',
        label: 'Materias Primas',
        tabla: 'materias_primas',
        columnas: [
            { campo: 'nombre', header: 'Nombre', requerido: true },
            { campo: 'codigo', header: 'Codigo', requerido: true },
            { campo: 'descripcion', header: 'Descripcion', requerido: false },
            { campo: 'unidad_medida', header: 'Unidad', requerido: true },
            { campo: 'costo_compra_promedio', header: 'Costo', requerido: false },
            { campo: 'stock_actual', header: 'Stock Actual', requerido: false },
            { campo: 'stock_minimo', header: 'Stock Minimo', requerido: false },
            { campo: 'categoria_1', header: 'Categoria 1', requerido: false },
            { campo: 'tipo_producto', header: 'Tipo', requerido: false },
            { campo: 'aplica_iva', header: 'Aplica IVA', requerido: false },
        ],
        defaults: { tipo_producto: 'comprado', unidad_medida: 'kg', aplica_iva: true, activo: true, stock_actual: 0, stock_minimo: 0 }
    },
    {
        key: 'materiales_empaque',
        conflicto: 'codigo',
        label: 'Materiales de Empaque',
        tabla: 'materiales_empaque',
        columnas: [
            { campo: 'nombre', header: 'Nombre', requerido: true },
            { campo: 'codigo', header: 'Codigo', requerido: true },
            { campo: 'descripcion', header: 'Descripcion', requerido: false },
            { campo: 'unidad_medida', header: 'Unidad', requerido: true },
            { campo: 'costo_compra_promedio', header: 'Costo', requerido: false },
            { campo: 'stock_actual', header: 'Stock Actual', requerido: false },
            { campo: 'stock_minimo', header: 'Stock Minimo', requerido: false },
            { campo: 'categoria_1', header: 'Categoria 1', requerido: false },
            { campo: 'aplica_iva', header: 'Aplica IVA', requerido: false },
        ],
        defaults: { tipo_producto: 'comprado', unidad_medida: 'unidad', aplica_iva: true, activo: true, stock_actual: 0, stock_minimo: 0 }
    },
    {
        key: 'consumibles',
        conflicto: 'codigo',
        label: 'Consumibles',
        tabla: 'consumibles',
        columnas: [
            { campo: 'nombre', header: 'Nombre', requerido: true },
            { campo: 'codigo', header: 'Codigo', requerido: false },
            { campo: 'descripcion', header: 'Descripcion', requerido: false },
            { campo: 'unidad_medida', header: 'Unidad', requerido: true },
            { campo: 'costo_compra_promedio', header: 'Costo', requerido: false },
            { campo: 'stock_actual', header: 'Stock Actual', requerido: false },
            { campo: 'stock_minimo', header: 'Stock Minimo', requerido: false },
            { campo: 'categoria_1', header: 'Categoria 1', requerido: false },
            { campo: 'aplica_iva', header: 'Aplica IVA', requerido: false },
        ],
        defaults: { unidad_medida: 'unidad', aplica_iva: true, activo: true, stock_actual: 0, stock_minimo: 0 }
    },
    {
        key: 'clientes',
        conflicto: 'rif',
        label: 'Clientes',
        tabla: 'clientes',
        columnas: [
            { campo: 'nombre', header: 'Nombre', requerido: true },
            { campo: 'rif', header: 'RIF', requerido: false },
            { campo: 'telefono', header: 'Telefono', requerido: false },
            { campo: 'email', header: 'Email', requerido: false },
            { campo: 'condicion_pago', header: 'Condicion Pago', requerido: false },
            { campo: 'dias_credito', header: 'Dias Credito', requerido: false },
            { campo: 'limite_credito', header: 'Limite Credito', requerido: false },
        ],
        defaults: { condicion_pago: 'contado', dias_credito: 0, limite_credito: 0, activo: true }
    },
    {
        key: 'proveedores',
        conflicto: 'rif',
        label: 'Proveedores',
        tabla: 'proveedores',
        columnas: [
            { campo: 'nombre', header: 'Nombre', requerido: true },
            { campo: 'rif', header: 'RIF', requerido: false },
            { campo: 'telefono', header: 'Telefono', requerido: false },
            { campo: 'contacto', header: 'Contacto', requerido: false },
            { campo: 'tipo', header: 'Tipo', requerido: false },
        ],
        defaults: { activo: true }
    },
]

// ─── Helpers ──────────────────────────────────────────────────
function parsearBooleano(val) {
    if (typeof val === 'boolean') return val
    if (typeof val === 'number') return val === 1
    const s = String(val).toLowerCase().trim()
    return ['si', 'sí', 'yes', 'true', '1', 'x'].includes(s)
}

function validarFila(fila, columnas) {
    const errores = []
    columnas.forEach(col => {
        if (col.requerido && (fila[col.campo] === null || fila[col.campo] === undefined || fila[col.campo] === '')) {
            errores.push(`"${col.header}" es requerido`)
        }
    })
    return errores
}

function procesarFila(filaRaw, columnas, defaults) {
    const fila = { ...defaults }
    columnas.forEach(col => {
        const val = filaRaw[col.header]
        if (val === undefined || val === null || val === '') return
        if (col.campo === 'aplica_iva') {
            fila[col.campo] = parsearBooleano(val)
        } else if (['precio_venta', 'costo_promedio', 'costo_compra_promedio', 'stock_actual', 'stock_minimo', 'vida_util_dias', 'dias_credito', 'limite_credito'].includes(col.campo)) {
            fila[col.campo] = Number(val) || 0
        } else {
            fila[col.campo] = String(val).trim()
        }
    })
    return fila
}

// ─── Componente principal ──────────────────────────────────────
export default function CargaDatos() {
    const [catalogoKey, setCatalogoKey] = useState('productos_terminados')
    const [paso, setPaso] = useState('inicio') // inicio | preview | resultado
    const [filas, setFilas] = useState([])
    const [erroresFila, setErroresFila] = useState({})
    const [cargando, setCargando] = useState(false)
    const [resultado, setResultado] = useState(null)
    const fileRef = useRef()

    const catalogo = CATALOGOS.find(c => c.key === catalogoKey)

    // ── Descargar plantilla ──
    function descargarPlantilla() {
        const headers = catalogo.columnas.map(c => c.header)
        const ejemplos = {
            productos_terminados: [['Agua de Coco 500ml', 'ACN-500', 'Agua natural sin preservantes', 'unidad', 2.50, 1.20, 100, 20, 'Bebidas', 'Agua de Coco', 'producido', 30, 'Si']],
            materias_primas: [['Agua de coco concentrada', 'MP-COC-001', 'Concentrado natural', 'litro', 0.80, 50, 10, 'Orgánicos', 'comprado', 'Si']],
            materiales_empaque: [['Botella PET 500ml', 'ME-BOT-001', 'Transparente', 'unidad', 0.15, 500, 100, 'Envases', 'Si']],
            consumibles: [['Guantes nitrilo M', 'CON-001', 'Caja x100', 'caja', 8.50, 10, 2, 'Seguridad', 'Si']],
            clientes: [['Supermercado Central', 'J-12345678-9', '0212-555-0101', 'compras@central.com', 'credito', 30, 5000]],
            proveedores: [['Agroindustrial Los Llanos', 'J-98765432-1', '0414-555-0202', 'Juan Pérez', 'materia_prima']],
        }
        const ws = XLSX.utils.aoa_to_sheet([headers, ...(ejemplos[catalogoKey] || [])])
        ws['!cols'] = headers.map(() => ({ wch: 20 }))
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, catalogo.label)
        XLSX.writeFile(wb, `plantilla_${catalogoKey}.xlsx`)
    }

    // ── Procesar archivo subido ──
    function procesarArchivo(e) {
        const file = e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (evt) => {
            const wb = XLSX.read(evt.target.result, { type: 'binary' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' })

            const filasProcessadas = rawData.map((row, idx) => ({
                _idx: idx + 2,
                ...procesarFila(row, catalogo.columnas, catalogo.defaults)
            }))

            const errores = {}
            filasProcessadas.forEach((fila, idx) => {
                const errs = validarFila(fila, catalogo.columnas)
                if (errs.length > 0) errores[idx] = errs
            })

            setFilas(filasProcessadas)
            setErroresFila(errores)
            setPaso('preview')
        }
        reader.readAsBinaryString(file)
        e.target.value = ''
    }

    // ── Confirmar carga ──
    async function confirmarCarga() {
        const filasValidas = filas.filter((_, idx) => !erroresFila[idx])
        if (filasValidas.length === 0) return
        setCargando(true)

        const payload = filasValidas.map(({ _idx, ...rest }) => rest)
        let insertados = 0, errores = []

        const BATCH = 50
        for (let i = 0; i < payload.length; i += BATCH) {
            const lote = payload.slice(i, i + BATCH)
            const { error } = await supabase
                .from(catalogo.tabla)
                .upsert(lote, { onConflict: catalogo.conflicto, ignoreDuplicates: false })
            if (error) {
                errores.push(`Lote ${Math.floor(i / BATCH) + 1}: ${error.message}`)
            } else {
                insertados += lote.length
            }
        }

        setCargando(false)
        setResultado({ insertados, errores, total: filasValidas.length })
        setPaso('resultado')
    }

    function reiniciar() {
        setPaso('inicio'); setFilas([]); setErroresFila({}); setResultado(null)
    }

    const filasConError = Object.keys(erroresFila).length
    const filasValidas = filas.length - filasConError
    const columnasMostrar = catalogo.columnas.slice(0, 5)

    return (
        <div style={{ padding: '24px' }}>

            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Carga masiva de datos</h1>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Importa catálogos completos desde Excel</p>
            </div>

            {/* Selector de catálogo */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
                {CATALOGOS.map(c => (
                    <button key={c.key}
                        onClick={() => { setCatalogoKey(c.key); reiniciar() }}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
                            borderColor: catalogoKey === c.key ? '#16a34a' : '#e5e7eb',
                            backgroundColor: catalogoKey === c.key ? '#f0fdf4' : '#fff',
                            color: catalogoKey === c.key ? '#16a34a' : '#6b7280'
                        }}>
                        {c.label}
                    </button>
                ))}
            </div>

            {/* PASO 1 — Inicio */}
            {paso === 'inicio' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '700px' }}>

                    {/* Descargar plantilla */}
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '8px' }}>
                                <Download size={20} style={{ color: '#16a34a' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Paso 1</div>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>Descargar plantilla</div>
                            </div>
                        </div>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px', lineHeight: 1.5 }}>
                            Descarga la plantilla Excel para <strong>{catalogo.label}</strong> con las columnas requeridas y un ejemplo.
                        </p>
                        <button onClick={descargarPlantilla}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                            <Download size={15} /> Descargar plantilla
                        </button>
                    </div>

                    {/* Subir archivo */}
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <div style={{ backgroundColor: '#eff6ff', borderRadius: '8px', padding: '8px' }}>
                                <Upload size={20} style={{ color: '#1d4ed8' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Paso 2</div>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>Subir archivo completado</div>
                            </div>
                        </div>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px', lineHeight: 1.5 }}>
                            Llena la plantilla con tus datos y súbela aquí. Se validará antes de insertar.
                        </p>
                        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
                            onChange={procesarArchivo} style={{ display: 'none' }} />
                        <button onClick={() => fileRef.current.click()}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                            <Upload size={15} /> Seleccionar archivo
                        </button>
                    </div>

                    {/* Columnas requeridas */}
                    <div style={{ gridColumn: 'span 2', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '10px' }}>
                            Columnas de la plantilla — {catalogo.label}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {catalogo.columnas.map(col => (
                                <span key={col.campo} style={{
                                    fontSize: '12px', padding: '3px 10px', borderRadius: '20px', fontFamily: 'monospace',
                                    backgroundColor: col.requerido ? '#fef3c7' : '#f3f4f6',
                                    color: col.requerido ? '#92400e' : '#6b7280',
                                    border: col.requerido ? '1px solid #fde68a' : '1px solid #e5e7eb'
                                }}>
                                    {col.header}{col.requerido ? ' *' : ''}
                                </span>
                            ))}
                        </div>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '8px 0 0' }}>* campos requeridos</p>
                    </div>
                </div>
            )}

            {/* PASO 2 — Preview */}
            {paso === 'preview' && (
                <div>
                    {/* Resumen */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 20px', fontSize: '13px', color: '#166534' }}>
                            <strong>{filasValidas}</strong> filas válidas listas para importar
                        </div>
                        {filasConError > 0 && (
                            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 20px', fontSize: '13px', color: '#dc2626' }}>
                                <strong>{filasConError}</strong> filas con errores — no se importarán
                            </div>
                        )}
                    </div>

                    {/* Tabla preview */}
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '16px' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: 500, color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileSpreadsheet size={16} style={{ color: '#6b7280' }} />
                            Preview — mostrando primeras {Math.min(filas.length, 10)} de {filas.length} filas
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>Fila</th>
                                        {columnasMostrar.map(col => (
                                            <th key={col.campo} style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{col.header}</th>
                                        ))}
                                        <th style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filas.slice(0, 10).map((fila, idx) => {
                                        const errs = erroresFila[idx]
                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: errs ? '#fef2f2' : 'transparent' }}>
                                                <td style={{ padding: '8px 12px', fontSize: '12px', color: '#9ca3af' }}>{fila._idx}</td>
                                                {columnasMostrar.map(col => (
                                                    <td key={col.campo} style={{ padding: '8px 12px', fontSize: '12px', color: '#374151', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {String(fila[col.campo] ?? '—')}
                                                    </td>
                                                ))}
                                                <td style={{ padding: '8px 12px' }}>
                                                    {errs ? (
                                                        <div style={{ fontSize: '11px', color: '#dc2626' }}>
                                                            {errs.join(', ')}
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '11px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                            <CheckCircle size={12} /> OK
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Botones */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={confirmarCarga} disabled={cargando || filasValidas === 0}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: filasValidas === 0 ? '#d1d5db' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: filasValidas === 0 ? 'default' : 'pointer', opacity: cargando ? 0.6 : 1 }}>
                            <Upload size={16} />
                            {cargando ? 'Importando...' : `Importar ${filasValidas} registros`}
                        </button>
                        <button onClick={reiniciar}
                            style={{ backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* PASO 3 — Resultado */}
            {paso === 'resultado' && resultado && (
                <div style={{ maxWidth: '500px' }}>
                    <div style={{ backgroundColor: resultado.errores.length === 0 ? '#f0fdf4' : '#fffbeb', borderRadius: '12px', border: `1px solid ${resultado.errores.length === 0 ? '#bbf7d0' : '#fde68a'}`, padding: '24px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            {resultado.errores.length === 0
                                ? <CheckCircle size={24} style={{ color: '#16a34a' }} />
                                : <AlertTriangle size={24} style={{ color: '#d97706' }} />
                            }
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>
                                    {resultado.errores.length === 0 ? 'Carga completada' : 'Carga completada con advertencias'}
                                </div>
                                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                                    {resultado.insertados} de {resultado.total} registros importados correctamente
                                </div>
                            </div>
                        </div>

                        {resultado.errores.length > 0 && (
                            <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 500, color: '#dc2626', marginBottom: '6px' }}>Errores al insertar:</div>
                                {resultado.errores.map((e, i) => (
                                    <div key={i} style={{ fontSize: '12px', color: '#dc2626', marginBottom: '2px' }}>· {e}</div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={reiniciar}
                            style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                            Cargar otro archivo
                        </button>
                        <button onClick={() => { setCatalogoKey('productos_terminados'); reiniciar() }}
                            style={{ backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>
                            Ir al inicio
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}