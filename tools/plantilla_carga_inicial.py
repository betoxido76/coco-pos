# Genera el libro de carga inicial de soma ops (cliente de manufactura nuevo).
import sys
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter as L

SALIDA = sys.argv[1]
FONT = 'Arial'
NOCHE, TEAL, AMBAR = '14213D', '0F766E', 'D97706'
F_TIT = Font(name=FONT, size=14, bold=True, color=NOCHE)
F_DESC = Font(name=FONT, size=9, italic=True, color='4B5563')
F_HDR = Font(name=FONT, size=10, bold=True, color='FFFFFF')
F_TXT = Font(name=FONT, size=10)
F_EJ = Font(name=FONT, size=10, italic=True, color='6B7280')
F_FORM = Font(name=FONT, size=10, color='374151')
FILL_REQ = PatternFill('solid', fgColor=TEAL)
FILL_OPC = PatternFill('solid', fgColor='5B8A86')
FILL_CALC = PatternFill('solid', fgColor='6B7280')
FILL_EJ = PatternFill('solid', fgColor='EEF2F1')
FILL_FCELDA = PatternFill('solid', fgColor='F3F4F6')
BORDE = Border(bottom=Side(style='thin', color='D1D5DB'))
WRAP = Alignment(wrap_text=True, vertical='center')

HDR, EJ, INI = 4, 5, 6          # fila de títulos, fila ejemplo, primera fila de datos
FILAS_MAESTRO, FILAS_MOV = 3000, 5000
FORM_MAESTRO, FORM_MOV = 1500, 4000   # filas con fórmulas de control

SINO = ['Sí', 'No']
UNIDADES = ['unidad', 'kg', 'g', 'litro', 'ml', 'caja', 'bolsa', 'rollo', 'metro', 'paquete', 'par', 'juego', 'otro']
ROLES = ['admin', 'vendedor', 'produccion', 'almacen', 'finanzas']
TIPO_ITEM = ['Producto terminado', 'Materia prima', 'Empaque', 'Consumible']

def sel(opts):
    return ('sel', opts)

def ref(rango):
    return ('ref', rango)

wb = Workbook()
wb.remove(wb.active)
INDICE = []   # (hoja, obligatoria, descripcion)


def hoja(nombre, titulo, desc, cols, ejemplo, filas=FILAS_MAESTRO, filas_form=FORM_MAESTRO,
         obligatoria='Sí', resumen=''):
    """cols: lista de dicts {h, req, w, k, v, c, f}
       k: t texto | i entero | n número | m monto | p porcentaje | d fecha | f fórmula
       v: validación sel([...]) o ref('Hoja!$A$5:$A$3000'); c: comentario; f: plantilla con {r}"""
    ws = wb.create_sheet(nombre)
    INDICE.append((nombre, obligatoria, resumen or desc))
    n = len(cols)
    ws['A1'] = titulo; ws['A1'].font = F_TIT
    ws['A2'] = desc; ws['A2'].font = F_DESC; ws['A2'].alignment = Alignment(wrap_text=True, vertical='top')
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max(n, 6))
    ws.row_dimensions[2].height = 42
    ws['A3'] = ('* = obligatorio · Fila gris = EJEMPLO (no se carga; sobrescríbala o déjela) · '
                'Columnas grises oscuras = cálculo automático, no escribir · Pase el mouse por cada título para ver la ayuda')
    ws['A3'].font = Font(name=FONT, size=8, color=AMBAR, bold=True)
    for j, c in enumerate(cols, 1):
        col = L(j)
        k = c.get('k', 't')
        cell = ws.cell(HDR, j, c['h'] + (' *' if c.get('req') else ''))
        cell.font = F_HDR
        cell.fill = FILL_CALC if k == 'f' else (FILL_REQ if c.get('req') else FILL_OPC)
        cell.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
        if c.get('c'):
            cm = Comment(c['c'], 'soma ops'); cm.width = 320; cm.height = 140
            cell.comment = cm
        ws.column_dimensions[col].width = c.get('w', 16)
        fmt = {'i': '0', 'n': '#,##0.####', 'm': '#,##0.00', 'p': '0.00', 'd': 'dd/mm/yyyy'}.get(k)
        # ejemplo
        ev = ejemplo[j - 1] if j - 1 < len(ejemplo) else None
        if k == 'f':
            ws.cell(EJ, j, c['f'].format(r=EJ))
        elif ev is not None:
            if k == 'd' and isinstance(ev, str):
                d_, m_, a_ = ev.split('/'); ev = datetime(int(a_), int(m_), int(d_))
            ws.cell(EJ, j, ev)
        e = ws.cell(EJ, j); e.font = F_EJ; e.fill = FILL_EJ
        if fmt: e.number_format = fmt
        # fórmulas de control y formato de la columna
        if k == 'f':
            for r in range(INI, INI + filas_form):
                x = ws.cell(r, j, c['f'].format(r=r)); x.font = F_FORM; x.fill = FILL_FCELDA
                if c.get('fmt'): x.number_format = c['fmt']
            if c.get('fmt'): e.number_format = c['fmt']
        elif fmt:
            for r in range(INI, INI + filas):
                ws.cell(r, j).number_format = fmt
        # validaciones
        v = c.get('v')
        rango = f'{col}{EJ}:{col}{INI + filas - 1}'
        if v:
            tipo, val = v
            formula = '"' + ','.join(val) + '"' if tipo == 'sel' else '=' + val
            dv = DataValidation(type='list', formula1=formula, allow_blank=True, showErrorMessage=(tipo == 'sel'))
            dv.error = 'Elija un valor de la lista.'; dv.errorTitle = 'Valor no válido'
            if tipo == 'ref':
                dv.showErrorMessage = True; dv.errorStyle = 'warning'
                dv.error = 'Ese código no está en la hoja de referencia. Puede seguir, pero revíselo.'
                dv.errorTitle = 'Código no encontrado'
            ws.add_data_validation(dv); dv.add(rango)
        elif k == 'd':
            dv = DataValidation(type='date', operator='greaterThan', formula1='DATE(2000,1,1)', allow_blank=True)
            dv.error = 'Escriba una fecha (dd/mm/aaaa).'; dv.errorTitle = 'Fecha no válida'; dv.showErrorMessage = True
            ws.add_data_validation(dv); dv.add(rango)
        elif k in ('i', 'n', 'm', 'p'):
            dv = DataValidation(type='whole' if k == 'i' else 'decimal', operator='greaterThanOrEqual',
                                formula1='0', allow_blank=True)
            dv.error = 'Escriba un número mayor o igual a 0, sin símbolos.'; dv.errorTitle = 'Número no válido'
            dv.showErrorMessage = True
            ws.add_data_validation(dv); dv.add(rango)
    ws.row_dimensions[HDR].height = 34
    ws.freeze_panes = ws.cell(EJ, 2)
    ws.auto_filter.ref = f'A{HDR}:{L(n)}{HDR}'
    ws.sheet_view.zoomScale = 90
    return ws


# Fórmulas de control reutilizables -----------------------------------------
def existe(col, hoja_ref, col_ref='A', vacio_ok=False):
    return (f'=IF({col}{{r}}="","",IF(COUNTIF({hoja_ref}!${col_ref}:${col_ref},{col}{{r}})>0,"OK","NO EXISTE"))')

def nombre_de(col, hoja_ref, col_cod='A', col_nom='B'):
    return (f'=IF({col}{{r}}="","",IFERROR(INDEX({hoja_ref}!${col_nom}:${col_nom},'
            f'MATCH({col}{{r}},{hoja_ref}!${col_cod}:${col_cod},0)),"—"))')

def existe_item(col_tipo, col_cod):
    t, c = col_tipo, col_cod
    return (f'=IF({c}{{r}}="","",IF(COUNTIF(IF({t}{{r}}="Materia prima",Materias_Primas!$A:$A,'
            f'IF({t}{{r}}="Empaque",Empaques!$A:$A,IF({t}{{r}}="Consumible",Consumibles!$A:$A,Productos!$A:$A))),'
            f'{c}{{r}})>0,"OK","NO EXISTE"))')

# ═══ 2. Empresa (clave / valor) ═════════════════════════════════════════════
ws = wb.create_sheet('Empresa')
INDICE.append(('Empresa', 'Sí', 'Datos fiscales, fecha de corte y configuración general.'))
ws['A1'] = 'Datos de la empresa'; ws['A1'].font = F_TIT
ws['A2'] = 'Complete la columna "Valor". La FECHA DE CORTE es la más importante: amarra inventario, CxC, CxP y bancos.'
ws['A2'].font = F_DESC
filas_emp = [
    ('Razón social *', '', 'Como aparece en el RIF.'),
    ('Nombre comercial', '', 'Nombre con el que lo conocen sus clientes (opcional).'),
    ('RIF *', '', 'Formato J-12345678-9.'),
    ('Dirección fiscal *', '', 'Sale impresa en las notas de entrega.'),
    ('Teléfono', '', ''),
    ('Correo', '', ''),
    ('Fecha de corte *', None, 'Día en que se cuenta el inventario y se toman los saldos de CxC, CxP y bancos. '
     'Todo lo anterior va en las hojas de saldos e históricos; todo lo posterior se registra en el sistema.'),
    ('¿Es agente de retención de IVA/ISLR?', 'No', 'Indicado por soma ops: NO es agente. Si cambia, avísenos.'),
    ('% de IVA que le retienen sus clientes contribuyentes especiales *', None,
     'Normalmente 75 o 100. Dato de su contador. Escriba solo el número.'),
    ('% de ISLR que le retienen sus clientes (si aplica)', None, 'Deje vacío o 0 si no le retienen ISLR.'),
    ('Tasa de cambio que usa normalmente *', 'BCV', 'BCV, Euro o Binance: la que usa para convertir a Bs.'),
    ('¿Los pedidos requieren aprobación antes de alistar?', 'Sí', 'Sí = un supervisor aprueba cada pedido.'),
    ('Moneda de sus precios de lista', 'USD', 'El sistema trabaja en USD sin IVA.'),
    ('Logo', 'Enviar aparte', 'PNG o JPG con fondo transparente, por correo.'),
]
for c, t in zip('ABC', ['Campo', 'Valor', 'Ayuda']):
    x = ws[f'{c}4']; x.value = t; x.font = F_HDR; x.fill = FILL_REQ
for i, (campo, val, ayuda) in enumerate(filas_emp, 5):
    ws.cell(i, 1, campo).font = Font(name=FONT, size=10, bold=campo.endswith('*'))
    v = ws.cell(i, 2, val); v.font = F_TXT; v.fill = PatternFill('solid', fgColor='FEF3C7')
    a = ws.cell(i, 3, ayuda); a.font = F_DESC; a.alignment = WRAP
    ws.row_dimensions[i].height = 30
FILA_CORTE = 5 + [f[0] for f in filas_emp].index('Fecha de corte *')
ws.cell(FILA_CORTE, 2).number_format = 'dd/mm/yyyy'
for fila, ops in ((5 + 7, SINO), (5 + 10, ['BCV', 'Euro', 'Binance']), (5 + 11, SINO)):
    dv = DataValidation(type='list', formula1='"' + ','.join(ops) + '"', allow_blank=True)
    ws.add_data_validation(dv); dv.add(f'B{fila}')
dv = DataValidation(type='date', operator='greaterThan', formula1='DATE(2020,1,1)')
ws.add_data_validation(dv); dv.add(f'B{FILA_CORTE}')
ws.column_dimensions['A'].width = 52; ws.column_dimensions['B'].width = 30; ws.column_dimensions['C'].width = 80
CORTE = f'Empresa!$B${FILA_CORTE}'

# ═══ 3. Usuarios ═══════════════════════════════════════════════════════════
hoja('Usuarios', 'Usuarios del sistema',
     'Una fila por persona que entrará al sistema. soma ops crea los accesos y envía la clave a cada correo.',
     [dict(h='Nombre y apellido', req=True, w=28),
      dict(h='Correo', req=True, w=30, c='Será su usuario para entrar. Debe ser único.'),
      dict(h='Rol', req=True, w=14, v=sel(ROLES),
           c='admin: todo, incluido montos y configuración.\nfinanzas: cobros, pagos, bancos, costos.\n'
             'vendedor: pedidos y clientes.\nproduccion: órdenes y recetas.\nalmacen: inventario, despacho, compras.'),
      dict(h='Teléfono', w=16),
      dict(h='¿Vendedor de calle?', w=14, v=sel(SINO), c='Sí = toma pedidos desde el teléfono y se le asignan clientes.'),
      dict(h='Módulos que usará', w=50, c='Escriba "todos" o la lista: Ventas, Pedidos, CxC, CxP, Compras, '
             'Inventario, Producción, Gastos, Bancos, Despacho, Activos…')],
     ['María Pérez', 'maria.perez@empresa.com', 'admin', '0414-1234567', 'No', 'todos'],
     resumen='Personas que usarán el sistema, su rol y módulos.')

# ═══ 4. Almacenes ══════════════════════════════════════════════════════════
hoja('Almacenes', 'Almacenes y ubicaciones',
     'Lugares donde guarda inventario (planta, depósito, cava, tienda). Una fila por ubicación interna; '
     'si el almacén no tiene ubicaciones, deje esa columna vacía.',
     [dict(h='Almacén', req=True, w=26),
      dict(h='Ubicación interna', w=26, c='Opcional: estante, pasillo, cava 1… Repita el almacén en cada fila.'),
      dict(h='¿Almacén principal?', w=14, v=sel(SINO), c='Solo uno en Sí: es el que el sistema propone por defecto.'),
      dict(h='Descripción', w=40)],
     ['Planta principal', 'Cava de frío', 'Sí', 'Producto terminado refrigerado'],
     resumen='Almacenes y ubicaciones internas.')

# ═══ 5. Categorías de clientes ═════════════════════════════════════════════
hoja('Cat_Clientes', 'Categorías de clientes (hasta 4 niveles)',
     'Cómo agrupa a sus clientes. El nivel 1 es el CANAL (lo usan el Dashboard y los reportes). '
     'Una fila por combinación; repita los niveles superiores.',
     [dict(h='Nivel 1 (Canal)', req=True, w=24, c='Ej.: Autoservicio, Distribuidor, Mayorista, Detal, Corporativo.'),
      dict(h='Nivel 2', w=22, c='Ej.: cadena o zona.'),
      dict(h='Nivel 3', w=22), dict(h='Nivel 4', w=22)],
     ['Autoservicio', 'Cadenas nacionales', 'Gran Caracas', ''],
     resumen='Canales y agrupaciones de clientes (4 niveles).')

# ═══ 6. Productos terminados ═══════════════════════════════════════════════
REF_PROV = 'Proveedores!$C$5:$C$3005'
hoja('Productos', 'Productos terminados (lo que vende)',
     'Todo lo que aparece en una nota de entrega: lo que fabrica, lo que compra para revender y los servicios '
     '(flete, despacho). Montos en USD SIN IVA.',
     [dict(h='Código / SKU', req=True, w=14, c='Código único. Se usa en recetas, precios, inventario y ventas.'),
      dict(h='Nombre', req=True, w=34),
      dict(h='Descripción', w=28),
      dict(h='Tipo', req=True, w=13, v=sel(['producido', 'comprado', 'servicio']),
           c='producido: lo fabrica (lleva receta).\ncomprado: lo compra y revende.\nservicio: flete, despacho; no mueve inventario.'),
      dict(h='Unidad', req=True, w=11, v=sel(UNIDADES), c='Unidad en que cuenta el inventario (unidad, kg, litro…).'),
      dict(h='Unidad de venta 2', w=13, v=sel(UNIDADES), c='Opcional: si también vende por caja, bulto, paquete…'),
      dict(h='Factor unidad 2', k='n', w=11, c='Cuántas unidades trae la unidad 2. Ej.: caja de 12 → 12.'),
      dict(h='Categoría 1', w=18, c='Familia o línea de producto.'),
      dict(h='Categoría 2', w=18, c='Subfamilia (opcional).'),
      dict(h='Aplica IVA', req=True, w=10, v=sel(SINO), c='Sí = gravado 16 %. No = exento.'),
      dict(h='Costo unitario USD', k='m', w=12, c='Costo por unidad SIN IVA. Necesario para márgenes.'),
      dict(h='Precio base USD', k='m', w=12, c='Precio de referencia SIN IVA. Los precios por lista van en "Listas_Precios".'),
      dict(h='Stock mínimo', k='n', w=10),
      dict(h='Vida útil (días)', k='i', w=10, c='Días desde la producción hasta el vencimiento.'),
      dict(h='RIF proveedor habitual', w=16, v=ref(REF_PROV), c='Solo para tipo "comprado".')],
     ['PT-001', 'Mermelada de fresa 250 g', 'Frasco de vidrio', 'producido', 'unidad', 'caja', 12,
      'Mermeladas', 'Frutos rojos', 'Sí', 1.35, 2.9, 48, 365, ''],
     resumen='Productos que vende (fabricados, de reventa y servicios).')

# ═══ 7-9. Materias primas, empaques, consumibles ══════════════════════════
def hoja_insumo(nombre, titulo, desc, ej, con_tipo):
    cols = [dict(h='Código', req=True, w=14, c='Código único. Se usa en recetas, inventario y compras.'),
            dict(h='Nombre', req=True, w=32), dict(h='Descripción', w=26)]
    if con_tipo:
        cols.append(dict(h='Tipo', req=True, w=13, v=sel(['comprado', 'producido']),
                         c='producido: la fabrica usted (p. ej. una base o un jarabe). Lleva receta en "Recetas".'))
    cols += [dict(h='Unidad', req=True, w=11, v=sel(UNIDADES)),
             dict(h='Categoría', w=18),
             dict(h='Aplica IVA', req=True, w=10, v=sel(SINO), c='Si el proveedor le cobra IVA.'),
             dict(h='Costo unitario USD', k='m', w=12, c='Último costo de compra por unidad, SIN IVA.'),
             dict(h='Stock mínimo', k='n', w=10),
             dict(h='Vida útil (días)', k='i', w=10),
             dict(h='RIF proveedor habitual', w=16, v=ref(REF_PROV))]
    hoja(nombre, titulo, desc, cols, ej, resumen=titulo)

hoja_insumo('Materias_Primas', 'Materias primas',
            'Insumos que se transforman en producción (frutas, azúcar, harina…). Montos USD SIN IVA.',
            ['MP-001', 'Fresa congelada', 'Grado A', 'comprado', 'kg', 'Frutas', 'No', 2.1, 200, 180, 'J-30987654-3'], True)
hoja_insumo('Empaques', 'Materiales de empaque',
            'Frascos, tapas, etiquetas, cajas, bolsas… lo que se consume al empacar.',
            ['EMP-001', 'Frasco de vidrio 250 ml', '', 'unidad', 'Envases', 'Sí', 0.32, 1000, '', 'J-30555111-0'], False)
hoja_insumo('Consumibles', 'Consumibles',
            'Materiales de uso interno que se gastan pero no forman parte del producto (guantes, limpieza, papelería).',
            ['CON-001', 'Guantes de nitrilo (caja 100)', '', 'caja', 'Higiene', 'Sí', 6.5, 5, '', ''], False)

# ═══ 10. Recetas ═══════════════════════════════════════════════════════════
hoja('Recetas', 'Recetas de producción',
     'Una fila por INSUMO de cada receta. Repita el producto fabricado y su rinde en cada fila. '
     'Aplica a productos terminados "producido" y a materias primas "producido".',
     [dict(h='Código fabricado', req=True, w=14, c='Código del producto terminado o de la materia prima que se fabrica.'),
      dict(h='Qué se fabrica', req=True, w=18, v=sel(['Producto terminado', 'Materia prima'])),
      dict(h='Rinde (cantidad)', req=True, k='n', w=11,
           c='Cuánto sale de UNA tanda de esta receta, en la unidad del producto. Ej.: 24 frascos.'),
      dict(h='Merma %', k='p', w=9, c='Pérdida normal del proceso. Escriba 3 para 3 %.'),
      dict(h='Tipo de insumo', req=True, w=18, v=sel(TIPO_ITEM)),
      dict(h='Código insumo', req=True, w=14),
      dict(h='Cantidad', req=True, k='n', w=11, c='Cantidad del insumo para UNA tanda, en la unidad del insumo.'),
      dict(h='¿Insumo base?', w=11, v=sel(SINO),
           c='Sí solo si la producción se planifica por lo que se procesa de este insumo '
             '(p. ej. "cuántos kg de fruta proceso hoy") y no por lo que sale. Uno por receta.'),
      dict(h='Notas', w=26),
      dict(h='Fabricado existe', k='f', w=12,
           f='=IF(A{r}="","",IF(COUNTIF(IF(B{r}="Materia prima",Materias_Primas!$A:$A,Productos!$A:$A),A{r})>0,"OK","NO EXISTE"))'),
      dict(h='Insumo existe', k='f', w=12, f=existe_item('E', 'F'))],
     ['PT-001', 'Producto terminado', 24, 3, 'Materia prima', 'MP-001', 3.6, 'No', ''],
     filas=FILAS_MOV, filas_form=FORM_MAESTRO, resumen='Insumos y cantidades por tanda de cada producto fabricado.')

# ═══ 11. Listas de precios ═════════════════════════════════════════════════
hoja('Listas_Precios', 'Listas de precios',
     'Una fila por producto y lista. Si solo tiene un precio, use una sola lista (ej. "General"). '
     'Precios en USD SIN IVA por la unidad principal; el precio por caja lo calcula el sistema con el factor.',
     [dict(h='Nombre de la lista', req=True, w=20, c='Ej.: General, Mayorista, Autoservicio, Detal.'),
      dict(h='Código producto', req=True, w=14, v=ref('Productos!$A$5:$A$3005')),
      dict(h='Precio USD sin IVA', req=True, k='m', w=13),
      dict(h='Vigente desde', k='d', w=12, c='Opcional. Vacío = desde el arranque.'),
      dict(h='¿Lista por defecto?', w=12, v=sel(SINO), c='Sí en las filas de la lista que se usa cuando el cliente no tiene una asignada.'),
      dict(h='Producto', k='f', w=30, f=nombre_de('B', 'Productos')),
      dict(h='Control', k='f', w=12, f=existe('B', 'Productos'))],
     ['General', 'PT-001', 2.9, None, 'Sí'],
     filas=FILAS_MOV, filas_form=FORM_MOV, resumen='Precio de cada producto en cada lista.')

# ═══ 12. Clientes ══════════════════════════════════════════════════════════
hoja('Clientes', 'Clientes',
     'Un cliente por RIF. Si tiene varias sucursales o puntos de entrega, regístrelas en "Sucursales_Clientes".',
     [dict(h='Código', w=11, c='Opcional: su código interno.'),
      dict(h='Razón social', req=True, w=32),
      dict(h='RIF / Cédula', req=True, w=15, c='J-12345678-9, V-12345678. Único por cliente.'),
      dict(h='Contribuyente especial', req=True, w=12, v=sel(SINO),
           c='Sí = le retiene IVA al pagar. El sistema lo descuenta del cobro.'),
      dict(h='Dirección fiscal', w=36),
      dict(h='Teléfono', w=14), dict(h='Correo', w=24),
      dict(h='Contacto comercial', w=20), dict(h='Teléfono comercial', w=14), dict(h='Correo comercial', w=22),
      dict(h='Contacto administrativo', w=20, c='Quien paga: cuentas por pagar del cliente.'),
      dict(h='Teléfono administrativo', w=14), dict(h='Correo administrativo', w=22),
      dict(h='Condición de pago', req=True, w=11, v=sel(['contado', 'credito'])),
      dict(h='Días de crédito', k='i', w=9),
      dict(h='Límite de crédito USD', k='m', w=12, c='Opcional. 0 o vacío = sin límite.'),
      dict(h='Lista de precios', w=16, c='Nombre exacto de una lista de "Listas_Precios".'),
      dict(h='Canal (nivel 1)', w=18, v=ref('Cat_Clientes!$A$5:$A$500')),
      dict(h='Nivel 2', w=16), dict(h='Nivel 3', w=16), dict(h='Nivel 4', w=16),
      dict(h='Vendedor (correo)', w=24, v=ref('Usuarios!$B$5:$B$300'), c='Correo del vendedor asignado (hoja Usuarios).'),
      dict(h='Se entrega con', w=14, v=sel(['factura', 'nota de entrega']),
           c='Documento que el cliente exige con la mercancía. Solo es un aviso; no cambia el IVA.'),
      dict(h='Paga indexado', w=10, v=sel(SINO),
           c='Sí (normal) = si paga en Bs., paga a la tasa del día del pago.\n'
             'No = paga los Bs. de la factura sin ajustar (ej. algunas cadenas).')],
     ['C-001', 'Distribuidora El Valle, C.A.', 'J-40123456-7', 'Sí', 'Av. Principal, Caracas', '0212-5551234',
      'compras@elvalle.com', 'Luis Gómez', '0414-5550001', 'lgomez@elvalle.com', 'Ana Ruiz', '0412-5550002',
      'cxp@elvalle.com', 'credito', 15, 5000, 'General', 'Autoservicio', 'Cadenas nacionales', 'Gran Caracas', '',
      'maria.perez@empresa.com', 'factura', 'Sí'],
     resumen='Maestro de clientes con crédito, canal y vendedor.')

# ═══ 13. Sucursales ════════════════════════════════════════════════════════
hoja('Sucursales_Clientes', 'Sucursales / puntos de entrega',
     'Solo para clientes con más de un lugar de entrega (cadenas, franquicias). Una fila por sucursal.',
     [dict(h='RIF cliente', req=True, w=15, v=ref('Clientes!$C$5:$C$3005')),
      dict(h='Nombre de la sucursal', req=True, w=26),
      dict(h='Dirección', req=True, w=40), dict(h='Ciudad', w=16), dict(h='Estado', w=14),
      dict(h='Contacto', w=18), dict(h='Teléfono', w=14),
      dict(h='¿Principal?', w=10, v=sel(SINO)),
      dict(h='Cliente', k='f', w=30, f=nombre_de('A', 'Clientes', 'C', 'B'))],
     ['J-40123456-7', 'El Valle - Los Ruices', 'Calle 3, Galpón 5, Los Ruices', 'Caracas', 'Miranda',
      'Pedro León', '0414-5550003', 'Sí'],
     filas_form=FORM_MAESTRO, obligatoria='Si aplica', resumen='Puntos de entrega de cada cliente.')

# ═══ 14. Proveedores ═══════════════════════════════════════════════════════
hoja('Proveedores', 'Proveedores',
     'Proveedores de materia prima, empaque, servicios y gastos. Un proveedor por RIF.',
     [dict(h='Código', w=11),
      dict(h='Razón social', req=True, w=32),
      dict(h='RIF', req=True, w=15),
      dict(h='Tipo', w=18, v=sel(['materia_prima', 'material_empaque', 'producto_terminado', 'consumibles', 'servicios'])),
      dict(h='Dirección fiscal', w=36), dict(h='Teléfono', w=14), dict(h='Contacto', w=20),
      dict(h='Condición de pago', req=True, w=11, v=sel(['contado', 'credito'])),
      dict(h='Días de crédito', k='i', w=9)],
     ['P-001', 'Frutas del Campo, C.A.', 'J-30987654-3', 'materia_prima', 'Zona Industrial, Valencia',
      '0241-5550000', 'Carlos Díaz', 'credito', 30],
     resumen='Maestro de proveedores.')

hoja('Cuentas_Proveedores', 'Cuentas bancarias de proveedores',
     'Cuentas a donde se les paga. Un proveedor puede tener varias; marque una como predeterminada.',
     [dict(h='RIF proveedor', req=True, w=15, v=ref(REF_PROV)),
      dict(h='Banco', req=True, w=20), dict(h='Tipo de cuenta', w=12, v=sel(['corriente', 'ahorro'])),
      dict(h='Número de cuenta', req=True, w=24), dict(h='Titular', w=28), dict(h='RIF titular', w=15),
      dict(h='¿Predeterminada?', w=12, v=sel(SINO)),
      dict(h='Proveedor', k='f', w=30, f=nombre_de('A', 'Proveedores', 'C', 'B'))],
     ['J-30987654-3', 'Banesco', 'corriente', '0134-0000-00-0000000000', 'Frutas del Campo, C.A.', 'J-30987654-3', 'Sí'],
     obligatoria='Opcional', resumen='Cuentas bancarias de cada proveedor.')

# ═══ 16. Inventario inicial ════════════════════════════════════════════════
hoja('Inventario_Inicial', 'Inventario inicial (conteo físico a la fecha de corte)',
     'Lo que hay físicamente el día de la fecha de corte. Una fila por artículo y almacén (y lote, si los maneja). '
     'Incluya productos terminados, materias primas, empaques y consumibles.',
     [dict(h='Tipo', req=True, w=18, v=sel(TIPO_ITEM)),
      dict(h='Código', req=True, w=14),
      dict(h='Almacén', req=True, w=20, v=ref('Almacenes!$A$5:$A$500')),
      dict(h='Ubicación interna', w=18),
      dict(h='Cantidad', req=True, k='n', w=11, c='En la unidad principal del artículo (no en cajas).'),
      dict(h='Costo unitario USD', k='m', w=12, c='Opcional: si se deja vacío se usa el costo del maestro.'),
      dict(h='Lote', w=12), dict(h='Vence', k='d', w=12),
      dict(h='Control', k='f', w=12, f=existe_item('A', 'B'))],
     ['Producto terminado', 'PT-001', 'Planta principal', 'Cava de frío', 480, 1.35, 'L-1103', '30/11/2027'],
     filas=FILAS_MOV, filas_form=FORM_MOV, resumen='Conteo físico a la fecha de corte.')

# ═══ 17. Bancos ═══════════════════════════════════════════════════════════
hoja('Bancos', 'Cuentas bancarias y cajas de la empresa',
     'Cuentas propias (bancos en Bs., cuentas en divisas, Zelle, Binance, caja chica) con su saldo a la fecha de corte.',
     [dict(h='Nombre corto', req=True, w=22, c='Cómo la llaman: "Banesco Bs", "Zelle", "Caja chica".'),
      dict(h='Banco / plataforma', req=True, w=18),
      dict(h='Número de cuenta', w=24),
      dict(h='Tipo', w=12, v=sel(['corriente', 'ahorro', 'divisas', 'caja', 'digital'])),
      dict(h='Moneda', req=True, w=9, v=sel(['Bs', 'USD', 'EUR', 'USDT'])),
      dict(h='Saldo a la fecha de corte', req=True, k='m', w=14, c='En la moneda de la cuenta.')],
     ['Banesco Bs', 'Banesco', '0134-0000-00-0000000000', 'corriente', 'Bs', 125000.0],
     obligatoria='Si usa Bancos', resumen='Cuentas propias y su saldo a la fecha de corte.')

hoja('Tasas_Cambio', 'Tasas de cambio históricas',
     'Solo si sus documentos históricos o saldos están en Bs.: la tasa de cada día que aparezca en esas hojas. '
     'Bs. por 1 USD (o por 1 EUR).',
     [dict(h='Fecha', req=True, k='d', w=12), dict(h='BCV (Bs/USD)', req=True, k='m', w=12),
      dict(h='Euro (Bs/EUR)', k='m', w=12), dict(h='Binance (Bs/USDT)', k='m', w=12)],
     ['31/10/2026', 228.48, 266.12, 305.0],
     obligatoria='Si hay montos en Bs.', resumen='Tasa de cada fecha con montos en Bs.')

# ═══ 19-20. Ventas históricas ══════════════════════════════════════════════
hoja('Ventas_Hist', 'Ventas históricas — encabezado (una fila por documento)',
     'Notas de entrega o facturas emitidas ANTES de la fecha de corte, para reportes, Dashboard y márgenes. '
     'El detalle por producto va en "Ventas_Hist_Lineas" con el mismo N° de documento. Montos en USD.',
     [dict(h='N° documento', req=True, w=14, c='Único. Debe coincidir con las líneas y, si sigue pendiente, con "CxC_Pendientes".'),
      dict(h='Tipo', w=14, v=sel(['factura', 'nota de entrega'])),
      dict(h='N° de control', w=12),
      dict(h='Fecha', req=True, k='d', w=12),
      dict(h='RIF cliente', req=True, w=15, v=ref('Clientes!$C$5:$C$3005')),
      dict(h='Sucursal', w=20, c='Nombre exacto de la sucursal (hoja Sucursales_Clientes), si aplica.'),
      dict(h='Vendedor (correo)', w=22, v=ref('Usuarios!$B$5:$B$300')),
      dict(h='Condición', w=10, v=sel(['contado', 'credito'])),
      dict(h='Vence', k='d', w=12),
      dict(h='Base gravada USD', req=True, k='m', w=12, c='Suma de líneas con IVA, sin el IVA. 0 si todo es exento.'),
      dict(h='Base exenta USD', k='m', w=12),
      dict(h='IVA USD', k='m', w=11),
      dict(h='Total USD', req=True, k='m', w=12),
      dict(h='Estado', req=True, w=11, v=sel(['pagada', 'pendiente', 'parcial', 'anulada']),
           c='pendiente o parcial: deben aparecer también en "CxC_Pendientes".'),
      dict(h='Moneda en que se facturó', w=11, v=sel(['USD', 'Bs'])),
      dict(h='Tasa usada', k='m', w=10, c='Solo si se facturó en Bs.'),
      dict(h='O/C cliente', w=12),
      dict(h='Dif. total', k='f', w=10, fmt='#,##0.00',
           f='=IF(A{r}="","",ROUND(M{r}-J{r}-K{r}-L{r},2))'),
      dict(h='Base según líneas', k='f', w=12, fmt='#,##0.00',
           f='=IF(A{r}="","",SUMIF(Ventas_Hist_Lineas!$A:$A,A{r},Ventas_Hist_Lineas!$J:$J))'),
      dict(h='Control', k='f', w=16,
           f='=IF(A{r}="","",IF(COUNTIF(Clientes!$C:$C,E{r})=0,"CLIENTE NO EXISTE",'
             'IF(ABS(R{r})>0.05,"TOTAL NO CUADRA",IF(S{r}=0,"SIN LÍNEAS",'
             'IF(ABS(S{r}-J{r}-K{r})>0.05,"LÍNEAS NO CUADRAN","OK")))))')],
     ['NE-000950', 'nota de entrega', '', '15/10/2026', 'J-40123456-7', 'El Valle - Los Ruices',
      'maria.perez@empresa.com', 'credito', '30/10/2026', 34.8, 0, 5.57, 40.37, 'pendiente', 'USD', None, 'OC-7781'],
     filas=FILAS_MOV, filas_form=FORM_MOV, obligatoria='Recomendada',
     resumen='Encabezado de cada venta anterior a la fecha de corte.')

hoja('Ventas_Hist_Lineas', 'Ventas históricas — líneas (una fila por producto de cada documento)',
     'Detalle de cada documento de "Ventas_Hist". Precio unitario en USD SIN IVA y con el descuento ya aplicado, '
     'o indique el descuento en su columna.',
     [dict(h='N° documento', req=True, w=14, v=ref('Ventas_Hist!$A$5:$A$5005')),
      dict(h='Código producto', req=True, w=14, v=ref('Productos!$A$5:$A$3005')),
      dict(h='Cantidad', req=True, k='n', w=10),
      dict(h='Unidad vendida', w=11, v=sel(['principal', 'unidad 2']),
           c='principal = la unidad del maestro. unidad 2 = caja/bulto (el sistema la convierte con el factor).'),
      dict(h='Precio unitario USD sin IVA', req=True, k='m', w=13, c='Precio por la unidad vendida.'),
      dict(h='Descuento %', k='p', w=9, c='Escriba 5 para 5 %. Vacío si el precio ya trae el descuento.'),
      dict(h='Aplica IVA', w=9, v=sel(SINO), c='Vacío = lo que diga el maestro de productos.'),
      dict(h='Costo unitario USD', k='m', w=11, c='Opcional pero MUY útil: costo al momento de la venta, para márgenes históricos.'),
      dict(h='Producto', k='f', w=28, f=nombre_de('B', 'Productos')),
      dict(h='Base línea USD', k='f', w=12, fmt='#,##0.00',
           f='=IF(A{r}="","",ROUND(C{r}*E{r}*(1-N(F{r})/100),2))'),
      dict(h='Control', k='f', w=16,
           f='=IF(A{r}="","",IF(COUNTIF(Ventas_Hist!$A:$A,A{r})=0,"DOC. NO EXISTE",'
             'IF(COUNTIF(Productos!$A:$A,B{r})=0,"PRODUCTO NO EXISTE","OK")))')],
     ['NE-000950', 'PT-001', 12, 'principal', 2.9, 0, 'Sí', 1.35],
     filas=20000, filas_form=20000, obligatoria='Recomendada', resumen='Productos de cada venta histórica.')

# ═══ 21-22. CxC ════════════════════════════════════════════════════════════
hoja('CxC_Pendientes', 'Cuentas por cobrar a la fecha de corte',
     'Documentos de clientes NO cobrados (o cobrados en parte) a la fecha de corte. Si el documento está en '
     '"Ventas_Hist", use el mismo N°. Montos en USD.',
     [dict(h='N° documento', req=True, w=14),
      dict(h='RIF cliente', req=True, w=15, v=ref('Clientes!$C$5:$C$3005')),
      dict(h='Fecha de emisión', req=True, k='d', w=12),
      dict(h='Vence', req=True, k='d', w=12),
      dict(h='Base gravada USD', k='m', w=12, c='Necesaria si el cliente es contribuyente especial (para su retención de IVA).'),
      dict(h='IVA USD', k='m', w=11),
      dict(h='Total documento USD', req=True, k='m', w=13),
      dict(h='Abonado USD', k='m', w=12, c='Lo ya cobrado en dinero antes del corte.'),
      dict(h='Retención IVA ya recibida USD', k='m', w=13,
           c='Si el cliente ya entregó el comprobante de retención. Vacío si aún falta.'),
      dict(h='N° comprobante retención', w=16),
      dict(h='Moneda original', w=10, v=sel(['USD', 'Bs'])),
      dict(h='Monto Bs (si aplica)', k='m', w=13),
      dict(h='Tasa del documento', k='m', w=10),
      dict(h='Paga indexado', w=10, v=sel(SINO), c='No = si paga en Bs., paga el monto en Bs. de la factura sin ajustar.'),
      dict(h='Notas', w=24),
      dict(h='Saldo USD', k='f', w=12, fmt='#,##0.00', f='=IF(A{r}="","",ROUND(G{r}-N(H{r})-N(I{r}),2))'),
      dict(h='Días vencida', k='f', w=10, fmt='0',
           f=f'=IF(OR(A{{r}}="",D{{r}}="",{CORTE}=""),"",MAX(0,{CORTE}-D{{r}}))'),
      dict(h='Control', k='f', w=16,
           f='=IF(A{r}="","",IF(COUNTIF(Clientes!$C:$C,B{r})=0,"CLIENTE NO EXISTE",IF(P{r}<0,"SALDO NEGATIVO","OK")))')],
     ['NE-000950', 'J-40123456-7', '15/10/2026', '30/10/2026', 34.8, 5.57, 40.37, 10, None, '', 'USD', None, None, 'Sí', ''],
     filas=FILAS_MOV, filas_form=FORM_MOV, resumen='Documentos de clientes pendientes de cobro.')

hoja('CxC_Saldos_a_Favor', 'Saldos a favor de clientes',
     'Notas de crédito sin aplicar, anticipos o pagos en exceso que el cliente todavía puede usar.',
     [dict(h='RIF cliente', req=True, w=15, v=ref('Clientes!$C$5:$C$3005')),
      dict(h='Tipo', req=True, w=16, v=sel(['nota de credito', 'anticipo', 'pago en exceso'])),
      dict(h='N° documento', w=14), dict(h='Fecha', req=True, k='d', w=12),
      dict(h='Disponible USD', req=True, k='m', w=12),
      dict(h='Documento al que se aplicará', w=18, c='Opcional: N° de la nota pendiente a la que corresponde.'),
      dict(h='Concepto', w=32),
      dict(h='Cliente', k='f', w=30, f=nombre_de('A', 'Clientes', 'C', 'B'))],
     ['J-40123456-7', 'nota de credito', 'NC-000045', '20/10/2026', 12.5, '', 'Devolución por producto dañado'],
     obligatoria='Si aplica', resumen='Notas de crédito y anticipos de clientes sin aplicar.')

# ═══ 23-25. CxP ════════════════════════════════════════════════════════════
hoja('CxP_Compras', 'Cuentas por pagar — compras a proveedores',
     'Facturas de compra (materia prima, empaque, reventa) NO pagadas o pagadas en parte a la fecha de corte. USD.',
     [dict(h='RIF proveedor', req=True, w=15, v=ref(REF_PROV)),
      dict(h='N° factura', req=True, w=14), dict(h='N° control', w=12),
      dict(h='Fecha factura', req=True, k='d', w=12), dict(h='Vence', req=True, k='d', w=12),
      dict(h='Base gravada USD', k='m', w=12), dict(h='Base exenta USD', k='m', w=12), dict(h='IVA USD', k='m', w=11),
      dict(h='Total USD', req=True, k='m', w=12),
      dict(h='Abonado USD', k='m', w=12),
      dict(h='Moneda original', w=10, v=sel(['USD', 'Bs'])),
      dict(h='Monto Bs (si aplica)', k='m', w=13), dict(h='Tasa', k='m', w=10),
      dict(h='Descripción', w=28),
      dict(h='Saldo USD', k='f', w=12, fmt='#,##0.00', f='=IF(B{r}="","",ROUND(I{r}-N(J{r}),2))'),
      dict(h='Control', k='f', w=18,
           f='=IF(B{r}="","",IF(COUNTIF(Proveedores!$C:$C,A{r})=0,"PROVEEDOR NO EXISTE",'
             'IF(AND(F{r}&G{r}&H{r}<>"",ABS(I{r}-N(F{r})-N(G{r})-N(H{r}))>0.05),"TOTAL NO CUADRA",'
             'IF(O{r}<0,"SALDO NEGATIVO","OK"))))')],
     ['J-30987654-3', 'A-004512', '00-018833', '25/10/2026', '24/11/2026', 420, 0, 0, 420, 0, 'USD', None, None,
      'Fresa congelada 200 kg'],
     filas=FILAS_MOV, filas_form=FORM_MOV, resumen='Facturas de compra pendientes de pago.')

hoja('CxP_Gastos', 'Cuentas por pagar — gastos',
     'Gastos ya recibidos y NO pagados a la fecha de corte (alquiler, servicios, honorarios, fletes…). USD.',
     [dict(h='RIF proveedor', w=15, v=ref(REF_PROV), c='Opcional si es un gasto sin proveedor registrado.'),
      dict(h='Nombre proveedor', w=26),
      dict(h='N° factura', w=14),
      dict(h='Tipo de gasto', req=True, w=18, v=ref('Catalogos!$A$5:$A$300')),
      dict(h='Descripción', req=True, w=30),
      dict(h='Fecha', req=True, k='d', w=12), dict(h='Vence', req=True, k='d', w=12),
      dict(h='Base imponible USD', k='m', w=12), dict(h='IVA USD', k='m', w=11),
      dict(h='Total USD', req=True, k='m', w=12),
      dict(h='Abonado USD', k='m', w=12),
      dict(h='Moneda original', w=10, v=sel(['USD', 'Bs'])),
      dict(h='Monto Bs (si aplica)', k='m', w=13), dict(h='Tasa', k='m', w=10),
      dict(h='Saldo USD', k='f', w=12, fmt='#,##0.00', f='=IF(E{r}="","",ROUND(J{r}-N(K{r}),2))')],
     ['J-31222333-4', 'Inmobiliaria Centro, C.A.', 'F-1209', 'Alquiler', 'Alquiler galpón noviembre',
      '01/11/2026', '05/11/2026', 800, 128, 928, 0, 'USD'],
     filas_form=FORM_MAESTRO, resumen='Gastos pendientes de pago.')

hoja('Anticipos_Proveedores', 'Anticipos a proveedores',
     'Dinero pagado a un proveedor ANTES de recibir la mercancía y que aún no se ha cruzado con una factura.',
     [dict(h='RIF proveedor', req=True, w=15, v=ref(REF_PROV)),
      dict(h='Fecha del pago', req=True, k='d', w=12),
      dict(h='Monto pagado USD', req=True, k='m', w=12),
      dict(h='Saldo por aplicar USD', req=True, k='m', w=12, c='Lo que todavía no se ha descontado de facturas.'),
      dict(h='Orden de compra / referencia', w=18), dict(h='N° recibo del proveedor', w=16),
      dict(h='Banco desde el que se pagó', w=18, c='Nombre corto de la hoja "Bancos".'),
      dict(h='Notas', w=26),
      dict(h='Proveedor', k='f', w=30, f=nombre_de('A', 'Proveedores', 'C', 'B'))],
     ['J-30987654-3', '05/11/2026', 600, 600, 'OC-0102', 'R-3321', 'Zelle', 'Frascos lote diciembre'],
     obligatoria='Si aplica', resumen='Anticipos a proveedores sin aplicar.')

# ═══ 26. Catálogos varios ══════════════════════════════════════════════════
hoja('Catalogos', 'Catálogos varios',
     'Listas cortas que usa el sistema. Escriba un valor por fila en cada columna; las columnas son independientes.',
     [dict(h='Tipos de gasto', req=True, w=28, c='Alquiler, Electricidad, Nómina, Fletes, Honorarios…'),
      dict(h='Áreas de consumo interno', w=28, c='Áreas que piden materiales al almacén (Requisiciones): Producción, '
             'Limpieza, Mantenimiento, Oficina…'),
      dict(h='Ubicaciones de activos fijos', w=28, c='Dónde están los equipos: Planta, Oficina, Depósito… '
             'Si no lo llena, se usa "Activos".'),
      dict(h='Categorías de activos fijos', w=32,
           c='Ya vienen: Maquinaria y equipos de producción, Equipos de refrigeración, Vehículos, Equipos de '
             'computación, Mobiliario y equipos de oficina, Herramientas, Instalaciones y mejoras. Agregue otras aquí.')],
     ['Alquiler', 'Producción', 'Planta', ''],
     filas=300, resumen='Tipos de gasto, áreas de consumo y ubicaciones de activos.')

# ═══ 27. Activos fijos ═════════════════════════════════════════════════════
CAT_ACT = ['Maquinaria y equipos de producción', 'Equipos de refrigeración', 'Vehículos', 'Equipos de computación',
           'Mobiliario y equipos de oficina', 'Herramientas', 'Instalaciones y mejoras']
hoja('Activos_Fijos', 'Activos fijos',
     'Equipos que la empresa usa y controla físicamente (máquinas, neveras, vehículos, computadoras). '
     'Una fila por equipo; si tiene varios iguales sin serial, use la columna Cantidad.',
     [dict(h='Nombre', req=True, w=30),
      dict(h='Categoría', req=True, w=30, v=ref('Listas!$A$2:$A$30'), c='Puede agregar categorías en "Catalogos".'),
      dict(h='Marca', w=14), dict(h='Modelo', w=14), dict(h='Serial', w=16),
      dict(h='Ubicación', w=18, c='De la columna "Ubicaciones de activos fijos" en "Catalogos".'),
      dict(h='Responsable (correo)', w=24, v=ref('Usuarios!$B$5:$B$300')),
      dict(h='Estado', w=13, v=sel(['operativo', 'mantenimiento', 'danado', 'desuso'])),
      dict(h='Fecha de adquisición', k='d', w=12),
      dict(h='Valor de adquisición USD', k='m', w=13, c='Sin IVA. Solo lo verán administración y finanzas.'),
      dict(h='Vida útil (meses)', k='i', w=10, c='Vacío = la de la categoría.'),
      dict(h='Garantía hasta', k='d', w=12),
      dict(h='RIF proveedor', w=15, v=ref(REF_PROV)),
      dict(h='N° factura de compra', w=14),
      dict(h='Cantidad', k='i', w=9, c='Vacío = 1. Crea una ficha por unidad.'),
      dict(h='Observaciones', w=28)],
     ['Marmita industrial 200 L', 'Maquinaria y equipos de producción', 'Inoxmaq', 'M-200', 'SN-88231', 'Planta',
      'maria.perez@empresa.com', 'operativo', '15/03/2024', 6800, 120, '15/03/2026', '', '', 1, ''],
     obligatoria='Opcional', resumen='Equipos de la empresa (módulo Activos).')

# ═══ Listas (auxiliar) ═════════════════════════════════════════════════════
wl = wb.create_sheet('Listas')
wl['A1'] = 'Categorías de activos'; wl['A1'].font = F_HDR; wl['A1'].fill = FILL_CALC
for i, c in enumerate(CAT_ACT, 2):
    wl.cell(i, 1, c).font = F_TXT
for i in range(len(CAT_ACT) + 2, 31):   # categorías nuevas desde Catalogos!D
    k = i - len(CAT_ACT) - 2
    wl.cell(i, 1, f'=IF(Catalogos!D{6 + k}="","",Catalogos!D{6 + k})').font = F_TXT
wl.column_dimensions['A'].width = 40
wl['C1'] = 'Hoja auxiliar para las listas desplegables. No editar.'; wl['C1'].font = F_DESC
wl.sheet_state = 'hidden'

# ═══ 1. Instrucciones (al principio) ═══════════════════════════════════════
wi = wb.create_sheet('Instrucciones', 0)
wi.sheet_view.showGridLines = False
wi.column_dimensions['A'].width = 3; wi.column_dimensions['B'].width = 26
wi.column_dimensions['C'].width = 16; wi.column_dimensions['D'].width = 90
wi['B2'] = 'soma ops — Carga inicial de datos'; wi['B2'].font = Font(name=FONT, size=18, bold=True, color=NOCHE)
wi['B3'] = 'Del pedido al cobro, en un solo lugar.'; wi['B3'].font = Font(name=FONT, size=10, italic=True, color=TEAL)
textos = [
    ('Cómo usar este libro', None),
    ('1. Fecha de corte', 'Defina primero en la hoja "Empresa" la FECHA DE CORTE. El inventario, las cuentas por '
     'cobrar, las cuentas por pagar y los saldos de bancos se toman a ese día. Las ventas históricas son de antes; '
     'todo lo posterior se registra en el sistema.'),
    ('2. Orden sugerido', 'Llene las hojas en el orden de las pestañas: primero maestros (usuarios, almacenes, '
     'productos, insumos, clientes, proveedores), luego recetas y precios, y al final saldos e históricos.'),
    ('3. Códigos', 'Los códigos y RIF deben ser idénticos entre hojas (el código de un producto en "Recetas" o en '
     '"Ventas_Hist_Lineas" debe existir en "Productos"). Las columnas grises "Control" lo revisan solas: '
     'deben decir OK.'),
    ('4. Montos', 'Todo en USD y SIN IVA, salvo donde la columna diga "IVA" o "Total". Use punto o coma decimal '
     'según su Excel; no escriba el símbolo $.'),
    ('5. Fechas', 'Formato dd/mm/aaaa.'),
    ('6. Sí / No', 'Use las listas desplegables.'),
    ('7. Hojas que no aplican', 'Si una hoja no le aplica, déjela vacía. No borre ni cambie el nombre de las hojas '
     'ni de las columnas.'),
    ('8. Dudas', 'Pase el mouse sobre el título de cada columna: tiene una nota con la explicación.'),
    ('Colores', None),
    ('Título verde oscuro *', 'Columna obligatoria.'),
    ('Título verde claro', 'Columna opcional.'),
    ('Título gris', 'Cálculo automático o control. No escribir.'),
    ('Fila gris clara', 'EJEMPLO. No se carga: puede sobrescribirla o dejarla.'),
]
r = 5
for t, d in textos:
    if d is None:
        r += 1
        wi.cell(r, 2, t).font = Font(name=FONT, size=12, bold=True, color=TEAL)
    else:
        wi.cell(r, 2, t).font = Font(name=FONT, size=10, bold=True)
        x = wi.cell(r, 4, d); x.font = F_TXT; x.alignment = WRAP
        wi.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
        wi.row_dimensions[r].height = 30 if len(d) > 95 else 16
        if len(d) > 190: wi.row_dimensions[r].height = 44
    r += 1
muestras = {'Título verde oscuro *': FILL_REQ, 'Título verde claro': FILL_OPC, 'Título gris': FILL_CALC,
            'Fila gris clara': FILL_EJ}
for row in wi.iter_rows(min_row=5, max_row=r):
    c = row[1]
    if c.value in muestras:
        c.fill = muestras[c.value]
        c.font = Font(name=FONT, size=10, bold=True, color=('374151' if c.value == 'Fila gris clara' else 'FFFFFF'))
r += 1
wi.cell(r, 2, 'Hojas del libro').font = Font(name=FONT, size=12, bold=True, color=TEAL); r += 1
for c, t in zip((2, 3, 4), ('Hoja', '¿Obligatoria?', 'Qué contiene')):
    x = wi.cell(r, c, t); x.font = F_HDR; x.fill = FILL_REQ
r += 1
for nom, ob, desc in INDICE:
    x = wi.cell(r, 2, nom); x.hyperlink = f"#'{nom}'!A1"
    x.font = Font(name=FONT, size=10, color=TEAL, underline='single')
    wi.cell(r, 3, ob).font = Font(name=FONT, size=10, bold=(ob == 'Sí'))
    wi.cell(r, 4, desc).font = F_TXT
    for c in (2, 3, 4): wi.cell(r, c).border = BORDE
    r += 1

# Colores de pestañas
for ws in wb.worksheets:
    n = ws.title
    if n in ('Instrucciones', 'Empresa'): ws.sheet_properties.tabColor = NOCHE
    elif n in ('Ventas_Hist', 'Ventas_Hist_Lineas', 'CxC_Pendientes', 'CxC_Saldos_a_Favor', 'CxP_Compras',
               'CxP_Gastos', 'Anticipos_Proveedores', 'Bancos', 'Tasas_Cambio', 'Inventario_Inicial'):
        ws.sheet_properties.tabColor = AMBAR
    else:
        ws.sheet_properties.tabColor = TEAL
wb.active = 0
wb.save(SALIDA)
print('ok', len(wb.worksheets), 'hojas')
