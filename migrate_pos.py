"""
Migración: pos_repuestos.db → MiPOS Supabase
Genera migration.sql listo para ejecutar en el SQL Editor de Supabase.

Uso:
    python migrate_pos.py                                      # pide los datos interactivamente
    python migrate_pos.py <empresa_id> <usuario_id>           # argumentos directos
    python migrate_pos.py <empresa_id> <usuario_id> <db_path> # con ruta custom de BD

Ejemplos:
    python migrate_pos.py
    python migrate_pos.py cd496885-... 759a0053-...
    python migrate_pos.py cd496885-... 759a0053-... C:/ruta/cliente.db
"""
import sqlite3, uuid, ast, os, sys

# UUID determinístico: misma entrada → mismo UUID siempre
# Evita inconsistencias si el script se regenera y se corre parcialmente
NS = uuid.UUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
def det_uuid(*parts):
    return str(uuid.uuid5(NS, '|'.join(str(p) for p in parts)))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_params():
    args = sys.argv[1:]
    if len(args) >= 2:
        empresa_id = args[0]
        usuario_id = args[1]
        db_path    = args[2] if len(args) >= 3 else os.path.join(BASE_DIR, 'pos_repuestos.db')
    else:
        print("=== Migración pos_repuestos.db → MiPOS ===")
        print("Consulta en Supabase:")
        print("  SELECT id, nombre FROM empresas;")
        print("  SELECT id, nombre, email FROM usuarios WHERE empresa_id = '<id_empresa>';")
        print()
        empresa_id = input("empresa_id  : ").strip()
        usuario_id = input("usuario_id  : ").strip()
        db_default = os.path.join(BASE_DIR, 'pos_repuestos.db')
        db_input   = input(f"ruta BD SQLite [{db_default}]: ").strip()
        db_path    = db_input if db_input else db_default

    out_path = os.path.join(BASE_DIR, 'migration.sql')
    return empresa_id, usuario_id, db_path, out_path

EMPRESA_ID, USUARIO_ID, DB_PATH, OUT_PATH = get_params()

# ── helpers ──────────────────────────────────────────────────────────────────

def open_db():
    conn = sqlite3.connect(DB_PATH)
    def text_factory(b):
        try:    return b.decode('utf-8')
        except: return b.decode('latin-1', errors='replace')
    conn.text_factory = text_factory
    conn.row_factory  = sqlite3.Row
    return conn

def esc(v):
    if v is None or (isinstance(v, str) and v.strip() == ''):
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

def num(v, default=0):
    try:
        f = float(v)
        return default if f != f else f          # NaN → default
    except (TypeError, ValueError):
        return default

def date10(s):
    if not s: return None
    return str(s)[:10]

# ── main ─────────────────────────────────────────────────────────────────────

def make_idempotent(lines):
    result = []
    for line in lines:
        if line.startswith('INSERT INTO configuracion ') and line.endswith(';'):
            line = line[:-1] + ' ON CONFLICT (empresa_id, clave) DO NOTHING;'
        elif line.startswith('INSERT INTO ') and line.endswith(';'):
            line = line[:-1] + ' ON CONFLICT (id) DO NOTHING;'
        result.append(line)
    return result

def write_part(part_num, title, lines):
    slug = title.lower().replace(' ', '_').replace('(', '').replace(')', '').replace('/', '').replace('.', '')
    filename = f'migration_{part_num:02d}_{slug}.sql'
    path = os.path.join(BASE_DIR, filename)
    header = [
        f'-- ================================================',
        f'-- Parte {part_num}: {title}',
        f'-- empresa_id : {EMPRESA_ID}',
        f'-- ================================================',
        '',
        'BEGIN;',
        '',
    ]
    footer = ['', 'COMMIT;']
    content = header + make_idempotent(lines) + footer
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(content))
    print(f'  -> {filename}  ({len(content)} lineas)')

def main():
    conn = open_db()
    c    = conn.cursor()
    parts = {}   # part_num → (title, lines)
    cur_part = None

    def sql(s):
        if cur_part is not None:
            parts[cur_part][1].append(s)

    def section(num, title):
        nonlocal cur_part
        cur_part = num
        parts[num] = (title, [])

    print('Generando archivos de migración...')

    almacen_map  = {}   # codigo_tienda  → uuid
    proveedor_map= {}   # rif            → uuid
    cliente_map  = {}   # numero_id      → uuid
    producto_map = {}   # sku            → uuid
    tg_map       = {}   # nombre tipo    → uuid
    venta_map    = {}   # old venta id   → uuid

    # ── 1. ALMACENES ─────────────────────────────────────────────────────────
    section(1, 'Almacenes')
    for r in c.execute("SELECT * FROM tiendas ORDER BY codigo_tienda"):
        aid        = det_uuid('almacen', EMPRESA_ID, r['codigo_tienda'])
        almacen_map[r['codigo_tienda']] = aid
        es_default = 'true' if r['codigo_tienda'] == '1' else 'false'
        sql(f"INSERT INTO almacenes (id, empresa_id, nombre, activo, es_default) "
            f"VALUES ('{aid}', '{EMPRESA_ID}', {esc(r['descripcion'])}, true, {es_default});")

    # ── 2. PROVEEDORES ────────────────────────────────────────────────────────
    section(2, 'Proveedores')
    for r in c.execute("SELECT * FROM proveedores"):
        pid = det_uuid('proveedor', EMPRESA_ID, r['rif'])
        proveedor_map[r['rif']] = pid
        sql(f"INSERT INTO proveedores (id, empresa_id, nombre, rif, telefono, activo) "
            f"VALUES ('{pid}', '{EMPRESA_ID}', {esc(r['nombre'])}, {esc(r['rif'])}, "
            f"{esc(r['telefono'] or None)}, true);")

    # ── 3. CLIENTES ───────────────────────────────────────────────────────────
    section(3, 'Clientes')
    for r in c.execute("SELECT * FROM clientes"):
        cid = det_uuid('cliente', EMPRESA_ID, r['numero_id'])
        cliente_map[r['numero_id']] = cid
        sql(f"INSERT INTO clientes (id, empresa_id, nombre, rif, direccion, telefono, email, "
            f"vehiculo, activo, contribuyente_especial) "
            f"VALUES ('{cid}', '{EMPRESA_ID}', {esc(r['nombre'])}, {esc(r['numero_id'])}, "
            f"{esc(r['direccion'] or None)}, {esc(r['telefono'] or None)}, {esc(r['email'] or None)}, "
            f"{esc(r['vehiculo'] or None)}, true, false);")

    # ── 4. PRODUCTOS ──────────────────────────────────────────────────────────
    section(4, 'Productos terminados')
    for r in c.execute("SELECT * FROM productos"):
        ptid = det_uuid('producto', EMPRESA_ID, r['sku'])
        producto_map[r['sku']] = ptid
        activo = 'true' if r['activo'] == 'S' else 'false'
        nombre = r['descripcion'] if r['descripcion'] and str(r['descripcion']).strip() else r['sku']
        sql(f"INSERT INTO productos_terminados "
            f"(id, empresa_id, nombre, sku, precio_venta, costo_promedio, "
            f"stock_actual, stock_minimo, unidad_medida, tipo_producto, activo, aplica_iva, categoria_1) "
            f"VALUES ('{ptid}', '{EMPRESA_ID}', {esc(nombre)}, {esc(r['sku'])}, "
            f"{num(r['precio_venta'])}, {num(r['costo'])}, "
            f"0, 0, 'unidad', 'comprado', {activo}, false, {esc(r['categoria'])});")

        # productos_autopartes — solo si tiene datos de autoparte
        # barras_1 mapea a 'tipo' (ej: LISO, PERFORADO, ORIGINAL, AFTERMARKET)
        if any([r['marca'], r['nro_parte'], r['barras_1'], r['barras_2'], r['barras_3']]):
            apid = det_uuid('autoparte', EMPRESA_ID, r['sku'])
            sql(f"INSERT INTO productos_autopartes (id, empresa_id, producto_id, marca, nro_parte, tipo, barras_2, barras_3) "
                f"VALUES ('{apid}', '{EMPRESA_ID}', '{ptid}', "
                f"{esc(r['marca'])}, {esc(r['nro_parte'])}, {esc(r['barras_1'])}, {esc(r['barras_2'])}, {esc(r['barras_3'])});")

    # ── 5. STOCK ──────────────────────────────────────────────────────────────
    section(5, 'Stock por almacen')
    stock_totals = {}
    for r in c.execute("SELECT * FROM inventarios"):
        sku    = r['producto_sku']
        tienda = r['codigo_tienda']
        stock  = int(num(r['stock'], 0))
        if sku not in producto_map or tienda not in almacen_map:
            continue
        ptid = producto_map[sku]
        aid  = almacen_map[tienda]
        suid = det_uuid('stock', EMPRESA_ID, tienda, sku)
        sql(f"INSERT INTO stock_ubicacion (id, empresa_id, almacen_id, tipo_item, item_id, cantidad) "
            f"VALUES ('{suid}', '{EMPRESA_ID}', '{aid}', 'producto_terminado', '{ptid}', {stock});")
        stock_totals[sku] = stock_totals.get(sku, 0) + stock

    # stock_actual updates van en el mismo archivo que stock_ubicacion (parte 5)
    for sku, total in stock_totals.items():
        if sku not in producto_map: continue
        sql(f"UPDATE productos_terminados SET stock_actual = {total} WHERE id = '{producto_map[sku]}';")

    # ── 6. TIPOS DE GASTO ─────────────────────────────────────────────────────
    section(6, 'Tipos de gasto y configuracion')
    for r in c.execute("SELECT * FROM tipos_gastos"):
        tgid = det_uuid('tipogasto', EMPRESA_ID, r['nombre'])
        tg_map[r['nombre']] = tgid
        sql(f"INSERT INTO tipos_gastos (id, empresa_id, nombre, activo) "
            f"VALUES ('{tgid}', '{EMPRESA_ID}', {esc(r['nombre'])}, true);")

    # ── 7. CONFIGURACION (tasas) — va en la misma parte 6 ────────────────────
    clave_map = {'tasa_cambio': 'tasa_bcv', 'tasa_euro': 'tasa_euro', 'tasa_binance': 'tasa_binance'}
    for r in c.execute("SELECT * FROM configuracion"):
        clave = clave_map.get(r['clave'], r['clave'])
        sql(f"INSERT INTO configuracion (empresa_id, clave, valor) "
            f"VALUES ('{EMPRESA_ID}', '{clave}', {num(r['valor'])});")

    # ── 8. GASTOS ─────────────────────────────────────────────────────────────
    section(7, 'Gastos')
    for r in c.execute("SELECT * FROM gastos"):
        gid      = det_uuid('gasto', EMPRESA_ID, str(r['id']))
        monto_usd = num(r['monto_usd'])
        monto_bs  = num(r['monto_veb'])
        tasa      = round(monto_bs / monto_usd, 4) if monto_usd > 0 else 0
        fecha     = date10(r['fecha_pago']) or date10(r['fecha_registro'])
        tgid_sql  = f"'{tg_map[r['tipo']]}'" if r['tipo'] in tg_map else 'NULL'
        metodo    = r['metodo_pago_usd'] if r['metodo_pago_usd'] and r['metodo_pago_usd'].strip() else None
        sql(f"INSERT INTO gastos "
            f"(id, empresa_id, usuario_id, nombre, descripcion, monto, monto_usd, monto_bs, "
            f"tasa_cambio, tipo_tasa, metodo_pago, fecha, estado, tipo_gasto_id) "
            f"VALUES ('{gid}', '{EMPRESA_ID}', '{USUARIO_ID}', {esc(r['nombre'])}, {esc(r['descripcion'])}, "
            f"{monto_usd}, {monto_usd}, {monto_bs}, {tasa}, 'BCV', "
            f"{esc(metodo)}, {esc(fecha)}, 'pagado', {tgid_sql});")

    # ── 9. VENTAS ─────────────────────────────────────────────────────────────
    section(8, 'Ventas e items')
    for r in c.execute("SELECT * FROM ventas"):
        vid = det_uuid('venta', EMPRESA_ID, str(r['id']))
        venta_map[r['id']] = vid
        cid = cliente_map.get(r['cliente_id'])
        if not cid: continue
        total    = num(r['total_usd'])
        pago_usd = num(r['pago_usd'])
        pago_bs  = num(r['pago_veb'])
        tasa     = num(r['tasa_cambio'])
        vehiculo = r['vehiculo_cliente'] if r['vehiculo_cliente'] and r['vehiculo_cliente'].strip() else None
        sql(f"INSERT INTO ventas "
            f"(id, empresa_id, cliente_id, usuario_id, numero_factura, subtotal, impuesto_pct, total, "
            f"estado_cobro, fecha_venta, tasa_cambio, tipo_tasa, pago_usd, pago_bs, "
            f"metodo_usd, metodo_bs, vehiculo_cliente) "
            f"VALUES ('{vid}', '{EMPRESA_ID}', '{cid}', '{USUARIO_ID}', {esc(r['id'])}, "
            f"{total}, 0, {total}, 'pagado', {esc(r['fecha'])}, {tasa}, 'BCV', "
            f"{pago_usd}, {pago_bs}, {esc(r['metodo_usd'])}, {esc(r['metodo_veb'])}, {esc(vehiculo)});")

    # items de ventas van en la misma parte 8
    for r in c.execute("SELECT * FROM detalles_ventas"):
        vid = venta_map.get(r['venta_id'])
        if not vid: continue
        if r['producto_sku'] not in producto_map: continue
        ptid = producto_map[r['producto_sku']]
        sql(f"INSERT INTO venta_items (id, empresa_id, venta_id, producto_id, cantidad, precio_unitario) "
            f"VALUES ('{det_uuid('ventaitem', EMPRESA_ID, str(r['venta_id']), r['producto_sku'])}', '{EMPRESA_ID}', '{vid}', '{ptid}', "
            f"{num(r['cantidad'])}, {num(r['precio_unitario'])});")

    # ── 10. COMPRAS ───────────────────────────────────────────────────────────
    section(9, 'Compras e items')
    for r in c.execute("SELECT * FROM compras"):
        provid = proveedor_map.get(r['rif_proveedor'])
        if not provid: continue
        cid   = det_uuid('compra', EMPRESA_ID, str(r['id']))
        total = num(r['total_usd'])
        tasa  = num(r['tasa_cambio'])
        sql(f"INSERT INTO compras "
            f"(id, empresa_id, proveedor_id, usuario_id, subtotal, total, estado, "
            f"fecha_compra, tasa_cambio, estado_cobro) "
            f"VALUES ('{cid}', '{EMPRESA_ID}', '{provid}', '{USUARIO_ID}', "
            f"{total}, {total}, 'recibida', {esc(r['fecha'])}, {tasa}, 'pagado');")
        try:
            items = ast.literal_eval(r['detalle_json'])
        except Exception:
            continue
        for item in items:
            sku = item.get('sku', '')
            if sku not in producto_map: continue
            ptid = producto_map[sku]
            sql(f"INSERT INTO compra_items "
                f"(id, empresa_id, compra_id, tipo_insumo, insumo_id, cantidad, precio_unitario) "
                f"VALUES ('{det_uuid('compraitem', EMPRESA_ID, str(r['id']), sku)}', '{EMPRESA_ID}', '{cid}', "
                f"'producto_terminado', '{ptid}', {num(item.get('cantidad',1))}, {num(item.get('costo',0))});")

    conn.close()

    total_lines = 0
    for num_part, (title, plines) in sorted(parts.items()):
        write_part(num_part, title, plines)
        total_lines += len(plines)

    print(f'OK  {len(parts)} archivos generados  ({total_lines} statements en total)')

if __name__ == '__main__':
    main()
