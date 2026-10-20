# Respaldo y restauración de la base de producción

Supabase está en plan **Free**: no hay respaldos automáticos ni restauración desde
el dashboard. El respaldo es responsabilidad nuestra.

Proyecto: `opndtxvomtlpgwyyloqd` · región `us-east-2` · Postgres 17.

---

## 1. Sacar un respaldo

### Requisitos (una sola vez)

- Herramientas de Postgres: `scoop install postgresql` (deja `pg_dump`, `pg_restore`
  y `psql` en `~\scoop\apps\postgresql\current\bin`).
- Contraseña de la base en `%APPDATA%\postgresql\pgpass.conf`, una línea por puerto:
  ```
  *:5432:postgres:postgres.opndtxvomtlpgwyyloqd:CONTRASEÑA
  *:6543:postgres:postgres.opndtxvomtlpgwyyloqd:CONTRASEÑA
  ```
  Guardarlo en ASCII, sin BOM (el Bloc de notas a veces lo guarda de forma que
  `psql` no lo lee). La contraseña se cambia en Dashboard → Database → Settings →
  *Reset database password*; la app no la usa, cambiarla no afecta a MiPOS.

### Conexión

La red de la oficina **bloquea el puerto 5432** (abre TCP pero el saludo de
Postgres nunca llega). Se usa el pooler en el **6543**:

```
host=aws-1-us-east-2.pooler.supabase.com port=6543 dbname=postgres user=postgres.opndtxvomtlpgwyyloqd sslmode=require
```

`aws-0-…` responde "tenant not found": el proyecto está en `aws-1`.

### Comando

```powershell
$bin = "$HOME\scoop\apps\postgresql\current\bin"
$fecha = Get-Date -Format yyyy-MM-dd
& "$bin\pg_dump.exe" -w -Fc -f "$HOME\Documents\Respaldos\MiPOS\mipos_$fecha.dump" `
  "host=aws-1-us-east-2.pooler.supabase.com port=6543 dbname=postgres user=postgres.opndtxvomtlpgwyyloqd sslmode=require"
```

Formato `-Fc` (comprimido, se restaura con `pg_restore`). ~4 MB y ~90 s con la
base de octubre 2026 (44 MB en disco: la diferencia son índices, catálogo y
compresión).

### Guardarlo

El archivo trae los datos de **todas** las empresas y los usuarios de acceso
(con sus contraseñas cifradas). Cifrarlo y sacarlo de la laptop:

```powershell
7z a -p -mhe=on mipos_$fecha.7z mipos_$fecha.dump   # pide la clave
Remove-Item mipos_$fecha.dump
```

Copia en Google Drive o disco externo. **Nunca dentro de la carpeta del
repositorio.**

### Verificarlo

```powershell
& "$bin\pg_restore.exe" --list mipos_$fecha.dump | Select-String "TABLE DATA public ventas"
```

---

## 2. Qué trae el respaldo y qué no

| Trae | No trae (vive fuera de la base) |
|---|---|
| Esquema `public` completo: 75 tablas, datos, 79 funciones, 20 triggers, 319 políticas RLS, índices | Edge Functions (código en `supabase/functions/`, **salvo** `quick-responder` y `dynamic-responder`, que no están en git) |
| `auth.users` e `auth.identities` (los usuarios conservan su contraseña) | Configuración de Auth: Site URL, URLs de redirección, plantillas de correo, SMTP |
| Publicación Realtime de `pedidos` | Variables de Cloudflare Pages (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) |
| | La anon key y la service role key (son del proyecto, cambian con uno nuevo) |
| | Vault (`vault.secrets`): vacío hoy; si algún día se usa, no se puede restaurar en otro proyecto |

---

## 3. Restaurar

### Caso A — El proyecto vive, se dañaron datos

No restaurar encima de producción: todo lo registrado después del respaldo se
perdería. Cargar el respaldo en un Postgres local (sección 4), comparar contra
producción y devolver **solo las filas que faltan o cambiaron**, con un script
revisado y probado con `BEGIN … ROLLBACK`.

### Caso B — Se perdió el proyecto

1. **Proyecto nuevo** en Supabase, región `us-east-2`. Anotar la contraseña y el
   nuevo `ref`. Agregar las dos líneas al `pgpass.conf` con el usuario
   `postgres.<ref-nuevo>`. Confirmar el host del pooler en el botón *Connect*.

2. **Usuarios de acceso** (primero, porque `public.usuarios` los referencia). Solo
   `users` e `identities`: el resto de `auth` lo crea Supabase y chocaría.
   ```powershell
   $dump = "C:\ruta\mipos_AAAA-MM-DD.dump"
   $conn = "host=<pooler> port=6543 dbname=postgres user=postgres.<ref-nuevo> sslmode=require"
   & "$bin\pg_restore.exe" --list $dump |
     Select-String 'TABLE DATA auth (users|identities) ' | ForEach-Object { $_.Line } |
     Set-Content -Encoding ascii auth.list
   & "$bin\pg_restore.exe" -w --single-transaction --data-only -L auth.list -d $conn $dump
   ```

3. **El sistema** (esquema `public`: tablas, datos, funciones, triggers, RLS, permisos).
   ```powershell
   & "$bin\pg_restore.exe" -w --single-transaction --no-owner -n public -d $conn $dump
   ```
   `--single-transaction` es obligatorio por el pooler en modo transacción: sin
   él, cada sentencia puede caer en otra conexión y se pierden los `SET` iniciales.
   Si algo falla, no queda nada a medias: se corrige y se repite.

4. **Realtime** (lo usa NuevoPedido):
   ```sql
   alter publication supabase_realtime add table public.pedidos;
   ```

5. **Edge Functions** (las dos del repo se publican sin verificación de JWT, como hoy):
   ```powershell
   supabase functions deploy crear-usuario --project-ref <ref-nuevo> --no-verify-jwt
   supabase functions deploy resetear-password --project-ref <ref-nuevo> --no-verify-jwt
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las pone
   Supabase solo.

6. **Auth** (Dashboard → Authentication → URL Configuration): Site URL
   `https://coco-pos.pages.dev` y redirección `https://coco-pos.pages.dev/reset-password`.
   Revisar plantillas de correo y SMTP si se habían personalizado.

7. **Frontend**: en Cloudflare Pages cambiar `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` y volver a publicar. Cambiar también el `.env` local.
   Las pestañas abiertas verán el aviso de versión nueva (`AvisoNuevaVersion`).
   Todos los usuarios tendrán que volver a iniciar sesión (el secreto de los
   tokens es otro), con su misma contraseña.

8. **Comprobar**: comparar conteos (consulta de la sección 4) contra los del
   respaldo, iniciar sesión con un usuario de cada empresa y facturar un pedido de
   prueba. Actualizar el `ref` en `claude.md` y en el plugin de Supabase.

Tiempo estimado: 1–2 horas con el sistema caído.

> **El caso B no se ha ensayado contra un proyecto Supabase real** (solo la carga
> completa en Postgres local, sección 4). Los pasos 2 y 3 pueden necesitar ajustes
> si la versión de `auth` del proyecto nuevo cambió columnas. Ensayarlo en un
> proyecto gratuito de prueba antes de necesitarlo de verdad.

---

## 4. Prueba de restauración local

Para verificar un respaldo o para el caso A. No toca producción.

```powershell
$bin  = "$HOME\scoop\apps\postgresql\current\bin"
$data = "$HOME\scoop\apps\postgresql\current\data"
& "$bin\pg_ctl.exe" -D $data -l "$env:TEMP\pg_local.log" -o "-p 5433" start
```

Preparar una base que imite un proyecto nuevo de Supabase (roles y extensiones):

```sql
CREATE DATABASE mipos_restore_test;
\c mipos_restore_test
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_admin',
    'supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin','supabase_replication_admin',
    'supabase_read_only_user','dashboard_user','pgbouncer','supabase_functions_admin','supabase_etl_admin']
  LOOP IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
    EXECUTE format('CREATE ROLE %I NOLOGIN', r); END IF; END LOOP; END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
```

```powershell
& "$bin\pg_restore.exe" -h localhost -p 5433 -U postgres -d mipos_restore_test --no-owner $dump
```

Errores esperados (9): `schema "extensions" already exists` y 8 del Vault
(`supabase_vault` solo existe en Supabase). Cualquier otro error hay que mirarlo.

Conteo de filas por tabla, para comparar contra producción (correrlo en ambos lados):

```sql
select n.nspname||'.'||c.relname tabla,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::int filas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public','auth') order by 1;
```

Al terminar: `drop database mipos_restore_test;` y `pg_ctl -D $data stop`.

### Registro de pruebas

| Fecha | Respaldo | Resultado |
|---|---|---|
| 2026-10-20 | `mipos_2026-10-20.dump` (4,3 MB) | OK. 102 tablas, 59.374 filas, todas iguales a producción salvo 2 `auth.refresh_tokens` (sesiones renovadas después del respaldo). Totales de ventas, cobros y stock idénticos. El trigger `ventas_un_pedido_una_nota` funcionó en la copia. Solo los 9 errores esperados. |
