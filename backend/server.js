const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const databaseMode = databaseUrl ? 'postgres' : 'sqlite';
const storageDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const dbPath = process.env.DB_PATH || path.join(storageDir, 'usuarios.db');
const passwordBase = String(process.env.DEFAULT_USER_PASSWORD || 'KIMBAMIPAPI').trim();
const sessionSecret = String(process.env.SESSION_SECRET || `${passwordBase}-merkateck-session`).trim();
const adminInicial = String(process.env.ADMIN_EMAIL || 'kimba@coso.com').trim().toLowerCase();
const correosBase = [
    'kimba@coso.com',
    'guty@coso.com',
    'aylen@coso.com',
    'brayan@coso.com',
    'luz@coso.com',
    'vicha@coso.com'
];
const mensajeInicialKimbin = 'Escribe aqui la nota de KIMBIN desde el panel de administracion.';
const tablasRequeridas = ['usuarios', 'registro_usuarios', 'accesos', 'notas_kimbin', 'productos', 'ventas', 'compras'];
const rolesPermitidos = new Set(['admin', 'vendedor', 'cliente']);
const origenesProductoPermitidos = new Set(['tienda', 'vendedor']);

let sqliteDb = null;
let pgPool = null;

function sql(sqlite, pg = sqlite) {
    return { sqlite, pg };
}

function crearErrorHttp(status, mensaje) {
    const error = new Error(mensaje);
    error.status = status;
    return error;
}

function hashPassword(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function toBase64Url(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function firmarToken(payload) {
    return crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
}

function crearTokenSesion(usuario) {
    const exp = Date.now() + (1000 * 60 * 60 * 12);
    const payload = JSON.stringify({
        id: usuario.id,
        email: usuario.email,
        role: normalizarRol(usuario.role, 'cliente'),
        exp
    });
    const encodedPayload = toBase64Url(payload);
    const signature = firmarToken(encodedPayload);
    return `${encodedPayload}.${signature}`;
}

function verificarTokenSesion(token) {
    const [encodedPayload, signature] = String(token || '').split('.');
    if (!encodedPayload || !signature) {
        return null;
    }

    const expectedSignature = firmarToken(encodedPayload);
    if (signature !== expectedSignature) {
        return null;
    }

    try {
        const payload = JSON.parse(fromBase64Url(encodedPayload));
        if (!payload?.email || !payload?.exp || payload.exp < Date.now()) {
            return null;
        }

        return {
            id: payload.id,
            email: String(payload.email).trim().toLowerCase(),
            role: normalizarRol(payload.role, 'cliente')
        };
    } catch (error) {
        return null;
    }
}

function obtenerTokenRequest(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    return req.headers['x-session-token'] || req.body?.sessionToken || req.query?.sessionToken || '';
}

function esEmailValido(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || '').trim().toLowerCase());
}

function normalizarRol(rol, porDefecto = 'cliente') {
    const valor = String(rol || porDefecto).trim().toLowerCase();
    return rolesPermitidos.has(valor) ? valor : porDefecto;
}

function normalizarOrigenProducto(origen, porDefecto = 'tienda') {
    const valor = String(origen || porDefecto).trim().toLowerCase();
    return origenesProductoPermitidos.has(valor) ? valor : porDefecto;
}

function obtenerNombreDesdeCorreo(correo) {
    const base = String(correo || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
    return base.replace(/\b\w/g, (letra) => letra.toUpperCase()) || 'Usuario';
}

function obtenerUsuariosSemilla() {
    const desdeEnv = String(process.env.SEED_USERS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

    return Array.from(new Set([...correosBase, adminInicial, ...desdeEnv].filter(esEmailValido)));
}

function obtenerRolSemilla(correo) {
    return correo === adminInicial ? 'admin' : 'vendedor';
}

function aNumero(value) {
    return Number(value || 0);
}

function mapearProducto(producto) {
    return {
        ...producto,
        vendidos: aNumero(producto.vendidos),
        stock: aNumero(producto.stock),
        precio: Number(producto.precio || 0),
        activo: aNumero(producto.activo),
        aprobado: aNumero(producto.aprobado),
        vendedor_id: producto.vendedor_id == null ? null : aNumero(producto.vendedor_id),
        origen_producto: normalizarOrigenProducto(producto.origen_producto, 'tienda'),
        vendedor_nombre: String(producto.vendedor_nombre || '').trim()
    };
}

function obtenerConfiguracionSsl() {
    const raw = String(process.env.DATABASE_SSL || process.env.PGSSLMODE || '').trim().toLowerCase();

    if (['false', '0', 'disable', 'off', 'no'].includes(raw)) {
        return false;
    }

    if (raw) {
        return { rejectUnauthorized: false };
    }

    return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

function tienePersistenciaConfigurada() {
    return Boolean(databaseUrl || process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DB_PATH);
}

function validarPersistenciaCritica() {
    const estaEnRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);

    if (estaEnRailway && !tienePersistenciaConfigurada()) {
        throw new Error('Railway no tiene persistencia configurada. Define DATABASE_URL para PostgreSQL o RAILWAY_VOLUME_MOUNT_PATH para SQLite persistente.');
    }
}

function inicializarClienteBaseDeDatos() {
    if (databaseMode === 'postgres') {
        pgPool = new Pool({
            connectionString: databaseUrl,
            ssl: obtenerConfiguracionSsl()
        });
        return;
    }

    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }

    sqliteDb = new sqlite3.Database(dbPath);
}

function sqliteRun(text, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.run(text, params, function onRun(error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({ lastID: this.lastID, changes: this.changes, rows: [] });
        });
    });
}

function sqliteGet(text, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.get(text, params, (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row || null);
        });
    });
}

function sqliteAll(text, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.all(text, params, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows || []);
        });
    });
}

async function dbExecute(statement, params = [], runner = null) {
    if (databaseMode === 'postgres') {
        const client = runner || pgPool;
        const result = await client.query(statement.pg, params);
        return {
            lastID: result.rows?.[0]?.id ?? null,
            changes: result.rowCount || 0,
            rows: result.rows || []
        };
    }

    return sqliteRun(statement.sqlite, params);
}

async function dbGet(statement, params = [], runner = null) {
    if (databaseMode === 'postgres') {
        const client = runner || pgPool;
        const result = await client.query(statement.pg, params);
        return result.rows?.[0] || null;
    }

    return sqliteGet(statement.sqlite, params);
}

async function dbAll(statement, params = [], runner = null) {
    if (databaseMode === 'postgres') {
        const client = runner || pgPool;
        const result = await client.query(statement.pg, params);
        return result.rows || [];
    }

    return sqliteAll(statement.sqlite, params);
}

function crearContextoQuery(runner = null) {
    return {
        execute: (statement, params = []) => dbExecute(statement, params, runner),
        get: (statement, params = []) => dbGet(statement, params, runner),
        all: (statement, params = []) => dbAll(statement, params, runner)
    };
}

async function conTransaccion(work) {
    if (databaseMode === 'postgres') {
        const client = await pgPool.connect();

        try {
            await client.query('BEGIN');
            const resultado = await work(crearContextoQuery(client));
            await client.query('COMMIT');
            return resultado;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    await dbExecute(sql('BEGIN IMMEDIATE'));

    try {
        const resultado = await work(crearContextoQuery());
        await dbExecute(sql('COMMIT'));
        return resultado;
    } catch (error) {
        try {
            await dbExecute(sql('ROLLBACK'));
        } catch (rollbackError) {
            console.error('No se pudo revertir la transaccion de SQLite:', rollbackError.message);
        }

        throw error;
    }
}

async function obtenerColumnasTabla(tabla) {
    if (databaseMode === 'postgres') {
        const rows = await dbAll(sql(
            '',
            `SELECT column_name AS nombre
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1`
        ), [tabla]);
        return rows.map((row) => row.nombre);
    }

    const rows = await dbAll(sql(`PRAGMA table_info(${tabla})`));
    return rows.map((row) => row.name);
}

async function asegurarColumna(tabla, columna, definicionSqlite, definicionPg = definicionSqlite) {
    const columnas = await obtenerColumnasTabla(tabla);
    if (columnas.includes(columna)) {
        return;
    }

    await dbExecute(sql(
        `ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicionSqlite}`,
        `ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS ${columna} ${definicionPg}`
    ));
}

async function crearUsuarioSemilla(correo, clave = passwordBase, role = obtenerRolSemilla(correo)) {
    if (!esEmailValido(correo)) {
        return;
    }

    const nombre = obtenerNombreDesdeCorreo(correo);
    const passwordHash = hashPassword(String(clave || passwordBase).trim());
    const rolFinal = normalizarRol(role, 'vendedor');

    await dbExecute(
        sql(
            `INSERT INTO usuarios (nombre, email, password_hash, role, activo)
             VALUES (?, ?, ?, ?, 1)
             ON CONFLICT(email) DO UPDATE SET
                 nombre = excluded.nombre,
                 password_hash = excluded.password_hash,
                 role = CASE WHEN usuarios.email = ? THEN 'admin' ELSE excluded.role END,
                 activo = 1`,
            `INSERT INTO usuarios (nombre, email, password_hash, role, activo)
             VALUES ($1, $2, $3, $4, 1)
             ON CONFLICT(email) DO UPDATE SET
                 nombre = EXCLUDED.nombre,
                 password_hash = EXCLUDED.password_hash,
                 role = CASE WHEN usuarios.email = $5 THEN 'admin' ELSE EXCLUDED.role END,
                 activo = 1`
        ),
        [nombre, correo, passwordHash, rolFinal, adminInicial]
    );
}

async function registrarEventoUsuario({ usuarioId = null, nombre, email, role, accion, actorEmail = 'sistema@merkateck.com' }, runner = null) {
    await dbExecute(
        sql(
            `INSERT INTO registro_usuarios (usuario_id, nombre, email, role, accion, actor_email)
             VALUES (?, ?, ?, ?, ?, ?)`,
            `INSERT INTO registro_usuarios (usuario_id, nombre, email, role, accion, actor_email)
             VALUES ($1, $2, $3, $4, $5, $6)`
        ),
        [usuarioId, nombre, email, role, accion, actorEmail],
        runner
    );
}

async function obtenerUsuarioActivo(correo) {
    return dbGet(
        sql(
            'SELECT id, nombre, email, password_hash, activo, role FROM usuarios WHERE email = ? AND activo = 1 LIMIT 1',
            'SELECT id, nombre, email, password_hash, activo, role FROM usuarios WHERE email = $1 AND activo = 1 LIMIT 1'
        ),
        [correo]
    );
}

async function validarUsuarioPorCorreo(correo, roles = []) {
    const email = String(correo || '').trim().toLowerCase();

    if (!esEmailValido(email)) {
        throw crearErrorHttp(401, 'Debes iniciar sesion con un correo valido.');
    }

    const usuario = await obtenerUsuarioActivo(email);

    if (!usuario) {
        throw crearErrorHttp(403, 'Ese usuario no esta autorizado.');
    }

    usuario.role = normalizarRol(usuario.role, 'cliente');

    if (roles.length > 0 && !roles.includes(usuario.role)) {
        throw crearErrorHttp(403, 'Tu usuario no tiene permisos para esta accion.');
    }

    return usuario;
}

async function validarAdminPorCorreo(correo) {
    return validarUsuarioPorCorreo(correo, ['admin']);
}

async function autenticarRequest(req, roles = [], fallbackEmail = '') {
    const token = obtenerTokenRequest(req);

    if (token) {
        const payload = verificarTokenSesion(token);
        if (!payload?.email) {
            throw crearErrorHttp(401, 'La sesión no es válida o expiró.');
        }

        const usuario = await obtenerUsuarioActivo(payload.email);
        if (!usuario) {
            throw crearErrorHttp(403, 'Ese usuario no está autorizado.');
        }

        usuario.role = normalizarRol(usuario.role, 'cliente');
        if (roles.length > 0 && !roles.includes(usuario.role)) {
            throw crearErrorHttp(403, 'Tu usuario no tiene permisos para esta acción.');
        }

        return usuario;
    }

    return validarUsuarioPorCorreo(fallbackEmail, roles);
}

async function autenticarAdminRequest(req, fallbackEmail = '') {
    return autenticarRequest(req, ['admin'], fallbackEmail);
}

async function obtenerProductoPorId(productoId, runner = null) {
    return dbGet(
        sql(
            `SELECT id, nombre, descripcion, precio, stock, activo, aprobado, origen_producto,
                    vendedor_id, vendedor_email, vendedor_nombre
             FROM productos
             WHERE id = ?
             LIMIT 1`,
            `SELECT id, nombre, descripcion, precio, stock, activo, aprobado, origen_producto,
                    vendedor_id, vendedor_email, vendedor_nombre
             FROM productos
             WHERE id = $1
             LIMIT 1`
        ),
        [productoId],
        runner
    );
}

function puedeGestionarProducto(usuario, producto) {
    if (!usuario || !producto) {
        return false;
    }

    if (usuario.role === 'admin') {
        return true;
    }

    return usuario.role === 'vendedor' && String(producto.vendedor_email || '').trim().toLowerCase() === usuario.email;
}

async function migrarVentasLegacyACompras() {
    await dbExecute(
        sql(
            `INSERT INTO compras (
                legacy_venta_id,
                producto_id,
                producto_nombre,
                cantidad,
                total,
                comprador_nombre,
                comprador_email,
                fecha
            )
            SELECT
                id,
                producto_id,
                producto_nombre,
                cantidad,
                total,
                comprador_nombre,
                comprador_email,
                fecha
            FROM ventas
            ON CONFLICT(legacy_venta_id) DO NOTHING`,
            `INSERT INTO compras (
                legacy_venta_id,
                producto_id,
                producto_nombre,
                cantidad,
                total,
                comprador_nombre,
                comprador_email,
                fecha
            )
            SELECT
                id,
                producto_id,
                producto_nombre,
                cantidad,
                total,
                comprador_nombre,
                comprador_email,
                fecha
            FROM ventas
            ON CONFLICT (legacy_venta_id) DO NOTHING`
        )
    );
}

async function verificarTablasRequeridas() {
    const tablas = databaseMode === 'postgres'
        ? await dbAll(
            sql(
                '',
                `SELECT table_name AS name
                 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = ANY($1::text[])`
            ),
            [tablasRequeridas]
        )
        : await dbAll(
            sql(
                `SELECT name
                 FROM sqlite_master
                 WHERE type = 'table' AND name IN (${tablasRequeridas.map(() => '?').join(', ')})`
            ),
            tablasRequeridas
        );

    const existentes = new Set(tablas.map((tabla) => tabla.name));
    const faltantes = tablasRequeridas.filter((tabla) => !existentes.has(tabla));

    if (faltantes.length > 0) {
        throw new Error(`Faltan tablas obligatorias: ${faltantes.join(', ')}`);
    }
}

async function asegurarModeloExtendido() {
    await asegurarColumna('usuarios', 'role', "TEXT NOT NULL DEFAULT 'cliente'", "TEXT NOT NULL DEFAULT 'cliente'");
    await asegurarColumna('productos', 'origen_producto', "TEXT NOT NULL DEFAULT 'tienda'", "TEXT NOT NULL DEFAULT 'tienda'");
    await asegurarColumna('productos', 'vendedor_id', 'INTEGER', 'INTEGER');
    await asegurarColumna('productos', 'vendedor_email', "TEXT DEFAULT ''", "TEXT DEFAULT ''");
    await asegurarColumna('productos', 'vendedor_nombre', "TEXT DEFAULT ''", "TEXT DEFAULT ''");
    await asegurarColumna('productos', 'aprobado', 'INTEGER NOT NULL DEFAULT 1', 'INTEGER NOT NULL DEFAULT 1');

    await dbExecute(sql(
        `UPDATE usuarios
         SET role = CASE
             WHEN email = ? THEN 'admin'
             WHEN COALESCE(role, '') NOT IN ('admin', 'vendedor', 'cliente') THEN 'cliente'
             WHEN COALESCE(role, '') = '' THEN 'vendedor'
             ELSE role
         END`,
        `UPDATE usuarios
         SET role = CASE
             WHEN email = $1 THEN 'admin'
             WHEN COALESCE(role, '') NOT IN ('admin', 'vendedor', 'cliente') THEN 'cliente'
             WHEN COALESCE(role, '') = '' THEN 'vendedor'
             ELSE role
         END`
    ), [adminInicial]);

    await dbExecute(sql(
        `UPDATE productos
         SET descripcion = COALESCE(descripcion, ''),
             origen_producto = CASE
                 WHEN LOWER(COALESCE(origen_producto, '')) IN ('tienda', 'vendedor') THEN LOWER(origen_producto)
                 WHEN TRIM(COALESCE(vendedor_email, '')) <> '' THEN 'vendedor'
                 ELSE 'tienda'
             END,
             vendedor_email = LOWER(COALESCE(vendedor_email, '')),
             vendedor_nombre = COALESCE(vendedor_nombre, ''),
             aprobado = COALESCE(aprobado, 1)`,
        `UPDATE productos
         SET descripcion = COALESCE(descripcion, ''),
             origen_producto = CASE
                 WHEN LOWER(COALESCE(origen_producto, '')) IN ('tienda', 'vendedor') THEN LOWER(origen_producto)
                 WHEN BTRIM(COALESCE(vendedor_email, '')) <> '' THEN 'vendedor'
                 ELSE 'tienda'
             END,
             vendedor_email = LOWER(COALESCE(vendedor_email, '')),
             vendedor_nombre = COALESCE(vendedor_nombre, ''),
             aprobado = COALESCE(aprobado, 1)`
    ));

    await dbExecute(sql('CREATE INDEX IF NOT EXISTS idx_usuarios_role ON usuarios (role)'));
    await dbExecute(sql('CREATE INDEX IF NOT EXISTS idx_registro_usuarios_email ON registro_usuarios (email)'));
    await dbExecute(sql('CREATE INDEX IF NOT EXISTS idx_productos_origen ON productos (origen_producto)'));
    await dbExecute(sql('CREATE INDEX IF NOT EXISTS idx_productos_vendedor_email ON productos (vendedor_email)'));
}

async function inicializarBaseDeDatos() {
    validarPersistenciaCritica();
    inicializarClienteBaseDeDatos();

    if (databaseMode === 'sqlite') {
        await dbExecute(sql('PRAGMA foreign_keys = ON'));
        await dbExecute(sql('PRAGMA journal_mode = WAL'));
    }

    const sentencias = [
        sql(
            `CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'cliente',
                activo INTEGER NOT NULL DEFAULT 1,
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'cliente',
                activo INTEGER NOT NULL DEFAULT 1,
                creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`
        ),
        sql(
            `CREATE TABLE IF NOT EXISTS accesos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                fecha TEXT DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS accesos (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`
        ),
        sql(
            `CREATE TABLE IF NOT EXISTS registro_usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER,
                nombre TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL,
                accion TEXT NOT NULL,
                actor_email TEXT,
                fecha TEXT DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS registro_usuarios (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER,
                nombre TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL,
                accion TEXT NOT NULL,
                actor_email TEXT,
                fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`
        ),
        sql(
            `CREATE TABLE IF NOT EXISTS notas_kimbin (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                mensaje TEXT NOT NULL,
                autor_email TEXT,
                actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS notas_kimbin (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                mensaje TEXT NOT NULL,
                autor_email TEXT,
                actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`
        ),
        sql(
            `CREATE TABLE IF NOT EXISTS productos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                categoria TEXT NOT NULL,
                descripcion TEXT NOT NULL DEFAULT '',
                precio REAL NOT NULL DEFAULT 0,
                imagen_url TEXT DEFAULT '',
                stock INTEGER NOT NULL DEFAULT 0,
                activo INTEGER NOT NULL DEFAULT 1,
                origen_producto TEXT NOT NULL DEFAULT 'tienda',
                vendedor_id INTEGER,
                vendedor_email TEXT DEFAULT '',
                vendedor_nombre TEXT DEFAULT '',
                aprobado INTEGER NOT NULL DEFAULT 1,
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS productos (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                categoria TEXT NOT NULL,
                descripcion TEXT NOT NULL DEFAULT '',
                precio REAL NOT NULL DEFAULT 0,
                imagen_url TEXT DEFAULT '',
                stock INTEGER NOT NULL DEFAULT 0,
                activo INTEGER NOT NULL DEFAULT 1,
                origen_producto TEXT NOT NULL DEFAULT 'tienda',
                vendedor_id INTEGER,
                vendedor_email TEXT DEFAULT '',
                vendedor_nombre TEXT DEFAULT '',
                aprobado INTEGER NOT NULL DEFAULT 1,
                creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`
        ),
        sql(
            `CREATE TABLE IF NOT EXISTS ventas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                producto_id INTEGER NOT NULL,
                producto_nombre TEXT NOT NULL,
                cantidad INTEGER NOT NULL DEFAULT 1,
                total REAL NOT NULL DEFAULT 0,
                comprador_nombre TEXT,
                comprador_email TEXT,
                fecha TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (producto_id) REFERENCES productos (id)
            )`,
            `CREATE TABLE IF NOT EXISTS ventas (
                id SERIAL PRIMARY KEY,
                producto_id INTEGER NOT NULL REFERENCES productos (id),
                producto_nombre TEXT NOT NULL,
                cantidad INTEGER NOT NULL DEFAULT 1,
                total REAL NOT NULL DEFAULT 0,
                comprador_nombre TEXT,
                comprador_email TEXT,
                fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`
        ),
        sql(
            `CREATE TABLE IF NOT EXISTS compras (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                legacy_venta_id INTEGER UNIQUE,
                producto_id INTEGER,
                producto_nombre TEXT NOT NULL,
                cantidad INTEGER NOT NULL DEFAULT 1,
                total REAL NOT NULL DEFAULT 0,
                comprador_nombre TEXT,
                comprador_email TEXT,
                fecha TEXT DEFAULT CURRENT_TIMESTAMP,
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (producto_id) REFERENCES productos (id)
            )`,
            `CREATE TABLE IF NOT EXISTS compras (
                id SERIAL PRIMARY KEY,
                legacy_venta_id INTEGER UNIQUE,
                producto_id INTEGER REFERENCES productos (id),
                producto_nombre TEXT NOT NULL,
                cantidad INTEGER NOT NULL DEFAULT 1,
                total REAL NOT NULL DEFAULT 0,
                comprador_nombre TEXT,
                comprador_email TEXT,
                fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`
        ),
        sql('CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos (activo)'),
        sql('CREATE INDEX IF NOT EXISTS idx_compras_producto_id ON compras (producto_id)'),
        sql('CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras (fecha)')
    ];

    for (const sentencia of sentencias) {
        await dbExecute(sentencia);
    }

    await asegurarModeloExtendido();

    for (const correo of obtenerUsuariosSemilla()) {
        await crearUsuarioSemilla(correo);
    }

    await dbExecute(
        sql(
            'INSERT INTO notas_kimbin (id, mensaje, autor_email) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING',
            'INSERT INTO notas_kimbin (id, mensaje, autor_email) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING'
        ),
        [mensajeInicialKimbin, 'sistema@merkateck.com']
    );

    await migrarVentasLegacyACompras();
    await verificarTablasRequeridas();
}

function manejarErrorRuta(res, error, mensajePredeterminado) {
    if (error?.status) {
        res.status(error.status).json({ ok: false, mensaje: error.message });
        return;
    }

    console.error(error);
    res.status(500).json({ ok: false, mensaje: mensajePredeterminado });
}

function obtenerResumenBaseDeDatos() {
    if (databaseMode === 'postgres') {
        return {
            motor: 'postgres',
            ubicacion: 'DATABASE_URL',
            persistencia: 'Railway service',
            persistenciaConfigurada: true
        };
    }

    return {
        motor: 'sqlite',
        ubicacion: dbPath,
        persistencia: storageDir,
        persistenciaConfigurada: tienePersistenciaConfigurada()
    };
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/KIMBIN', express.static(path.join(__dirname, '..', 'KIMBIN')));

app.get('/api/health', async (req, res) => {
    try {
        const totalUsuarios = await dbGet(sql(
            'SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1',
            'SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1'
        ));
        const totalVendedores = await dbGet(sql(
            "SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1 AND role = 'vendedor'",
            "SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1 AND role = 'vendedor'"
        ));
        const resumen = obtenerResumenBaseDeDatos();

        res.json({
            ok: true,
            mensaje: 'Servidor activo',
            totalUsuarios: aNumero(totalUsuarios?.total),
            totalVendedores: aNumero(totalVendedores?.total),
            baseDeDatos: resumen.ubicacion,
            motor: resumen.motor,
            persistencia: resumen.persistencia,
            persistenciaConfigurada: resumen.persistenciaConfigurada
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'Error al leer la base de datos');
    }
});

app.get('/api/usuarios', async (req, res) => {
    try {
        await autenticarAdminRequest(req, req.query.adminEmail || req.headers['x-admin-email']);

        const usuarios = await dbAll(sql(
            'SELECT id, nombre, email, role, activo, creado_en FROM usuarios ORDER BY creado_en DESC, email ASC',
            'SELECT id, nombre, email, role, activo, creado_en FROM usuarios ORDER BY creado_en DESC, email ASC'
        ));

        res.json({
            ok: true,
            usuarios: usuarios.map((usuario) => ({
                ...usuario,
                role: normalizarRol(usuario.role)
            }))
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo listar los usuarios.');
    }
});

app.get('/api/historial/usuarios', async (req, res) => {
    try {
        await autenticarAdminRequest(req, req.query.adminEmail || req.headers['x-admin-email']);

        const historial = await dbAll(sql(
            `SELECT id, usuario_id, nombre, email, role, accion, actor_email, fecha
             FROM registro_usuarios
             ORDER BY fecha DESC, id DESC
             LIMIT 100`,
            `SELECT id, usuario_id, nombre, email, role, accion, actor_email, fecha
             FROM registro_usuarios
             ORDER BY fecha DESC, id DESC
             LIMIT 100`
        ));

        res.json({ ok: true, historial });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo cargar el historial de usuarios.');
    }
});

app.post('/api/usuarios', async (req, res) => {
    const { email, nombre, password, role, adminEmail } = req.body || {};
    const correo = String(email || '').trim().toLowerCase();
    const nombreFinal = String(nombre || '').trim() || obtenerNombreDesdeCorreo(correo);
    const claveFinal = String(password || '').trim() || passwordBase;
    const rolFinal = normalizarRol(role, 'vendedor');

    if (!esEmailValido(correo)) {
        res.status(400).json({ ok: false, mensaje: 'Ingresa un correo valido.' });
        return;
    }

    try {
        await autenticarAdminRequest(req, adminEmail);

        const resultadoOperacion = await conTransaccion(async (query) => {
            const existente = await query.get(sql(
                'SELECT id FROM usuarios WHERE email = ? LIMIT 1',
                'SELECT id FROM usuarios WHERE email = $1 LIMIT 1'
            ), [correo]);

            await query.execute(
                sql(
                    `INSERT INTO usuarios (nombre, email, password_hash, role, activo)
                     VALUES (?, ?, ?, ?, 1)
                     ON CONFLICT(email) DO UPDATE SET
                         nombre = excluded.nombre,
                         password_hash = excluded.password_hash,
                         role = excluded.role,
                         activo = 1`,
                    `INSERT INTO usuarios (nombre, email, password_hash, role, activo)
                     VALUES ($1, $2, $3, $4, 1)
                     ON CONFLICT(email) DO UPDATE SET
                         nombre = EXCLUDED.nombre,
                         password_hash = EXCLUDED.password_hash,
                         role = EXCLUDED.role,
                         activo = 1`
                ),
                [nombreFinal, correo, hashPassword(claveFinal), rolFinal]
            );

            const usuarioGuardado = await query.get(sql(
                'SELECT id, nombre, email, role FROM usuarios WHERE email = ? LIMIT 1',
                'SELECT id, nombre, email, role FROM usuarios WHERE email = $1 LIMIT 1'
            ), [correo]);

            await registrarEventoUsuario({
                usuarioId: usuarioGuardado?.id || null,
                nombre: usuarioGuardado?.nombre || nombreFinal,
                email: usuarioGuardado?.email || correo,
                role: normalizarRol(usuarioGuardado?.role || rolFinal, rolFinal),
                accion: existente ? 'actualizacion_usuario' : 'creacion_usuario',
                actorEmail: adminEmail
            }, query);

            return { existente };
        });

        res.status(resultadoOperacion.existente ? 200 : 201).json({
            ok: true,
            mensaje: resultadoOperacion.existente ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.'
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo guardar el usuario.');
    }
});

app.get('/api/productos', async (req, res) => {
    try {
        const productos = await dbAll(sql(
            `SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                    p.creado_en, p.actualizado_en, p.origen_producto, p.vendedor_id, p.vendedor_email,
                    p.vendedor_nombre, p.aprobado, COALESCE(SUM(c.cantidad), 0) AS vendidos
             FROM productos p
             LEFT JOIN compras c ON c.producto_id = p.id
             WHERE p.activo = 1 AND p.aprobado = 1
             GROUP BY p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                      p.creado_en, p.actualizado_en, p.origen_producto, p.vendedor_id, p.vendedor_email,
                      p.vendedor_nombre, p.aprobado
             ORDER BY p.origen_producto ASC, p.actualizado_en DESC, p.id DESC`,
            `SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                    p.creado_en, p.actualizado_en, p.origen_producto, p.vendedor_id, p.vendedor_email,
                    p.vendedor_nombre, p.aprobado, COALESCE(SUM(c.cantidad), 0) AS vendidos
             FROM productos p
             LEFT JOIN compras c ON c.producto_id = p.id
             WHERE p.activo = 1 AND p.aprobado = 1
             GROUP BY p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                      p.creado_en, p.actualizado_en, p.origen_producto, p.vendedor_id, p.vendedor_email,
                      p.vendedor_nombre, p.aprobado
             ORDER BY p.origen_producto ASC, p.actualizado_en DESC, p.id DESC`
        ));

        const productosNormalizados = productos.map(mapearProducto);

        res.json({
            ok: true,
            productos: productosNormalizados,
            productosTienda: productosNormalizados.filter((producto) => producto.origen_producto === 'tienda'),
            productosVendedores: productosNormalizados.filter((producto) => producto.origen_producto === 'vendedor')
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo cargar el catalogo.');
    }
});

app.get('/api/productos/gestion', async (req, res) => {
    try {
        const usuario = await autenticarRequest(req, ['admin', 'vendedor'], req.query.email || req.headers['x-user-email']);
        const params = [];
        let whereSqlite = 'WHERE p.activo = 1';
        let wherePg = 'WHERE p.activo = 1';

        if (usuario.role === 'vendedor') {
            whereSqlite += " AND LOWER(COALESCE(p.vendedor_email, '')) = ?";
            wherePg += " AND LOWER(COALESCE(p.vendedor_email, '')) = $1";
            params.push(usuario.email);
        }

        const productos = await dbAll(sql(
            `SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                    p.creado_en, p.actualizado_en, p.origen_producto, p.vendedor_id, p.vendedor_email,
                    p.vendedor_nombre, p.aprobado, COALESCE(SUM(c.cantidad), 0) AS vendidos
             FROM productos p
             LEFT JOIN compras c ON c.producto_id = p.id
             ${whereSqlite}
             GROUP BY p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                      p.creado_en, p.actualizado_en, p.origen_producto, p.vendedor_id, p.vendedor_email,
                      p.vendedor_nombre, p.aprobado
             ORDER BY p.actualizado_en DESC, p.id DESC`,
            `SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                    p.creado_en, p.actualizado_en, p.origen_producto, p.vendedor_id, p.vendedor_email,
                    p.vendedor_nombre, p.aprobado, COALESCE(SUM(c.cantidad), 0) AS vendidos
             FROM productos p
             LEFT JOIN compras c ON c.producto_id = p.id
             ${wherePg}
             GROUP BY p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                      p.creado_en, p.actualizado_en, p.origen_producto, p.vendedor_id, p.vendedor_email,
                      p.vendedor_nombre, p.aprobado
             ORDER BY p.actualizado_en DESC, p.id DESC`
        ), params);

        res.json({
            ok: true,
            alcance: usuario.role,
            productos: productos.map(mapearProducto)
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo cargar el catalogo de gestion.');
    }
});

app.post('/api/productos', async (req, res) => {
    const actorEmail = req.body?.actorEmail || req.body?.adminEmail;
    const nombreFinal = String(req.body?.nombre || '').trim();
    const categoriaFinal = String(req.body?.categoria || '').trim() || 'General';
    const descripcionFinal = String(req.body?.descripcion || '').trim();
    const precioFinal = Number(req.body?.precio || 0);
    const imagenFinal = String(req.body?.imagen_url || '').trim();
    const stockFinal = Math.max(0, parseInt(req.body?.stock, 10) || 0);

    if (!nombreFinal || precioFinal <= 0) {
        res.status(400).json({ ok: false, mensaje: 'Completa al menos nombre y precio.' });
        return;
    }

    try {
        const usuario = await autenticarRequest(req, ['admin', 'vendedor'], actorEmail);
        const origenProducto = usuario.role === 'admin' ? 'tienda' : 'vendedor';
        const vendedorId = usuario.role === 'vendedor' ? usuario.id : null;
        const vendedorEmail = usuario.role === 'vendedor' ? usuario.email : '';
        const vendedorNombre = usuario.role === 'vendedor' ? usuario.nombre : '';

        const resultado = await dbExecute(
            sql(
                `INSERT INTO productos (
                    nombre, categoria, descripcion, precio, imagen_url, stock, activo, origen_producto,
                    vendedor_id, vendedor_email, vendedor_nombre, aprobado, actualizado_en
                )
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
                `INSERT INTO productos (
                    nombre, categoria, descripcion, precio, imagen_url, stock, activo, origen_producto,
                    vendedor_id, vendedor_email, vendedor_nombre, aprobado, actualizado_en
                )
                VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, 1, CURRENT_TIMESTAMP)
                RETURNING id`
            ),
            [
                nombreFinal,
                categoriaFinal,
                descripcionFinal,
                precioFinal,
                imagenFinal,
                stockFinal,
                origenProducto,
                vendedorId,
                vendedorEmail,
                vendedorNombre
            ]
        );

        res.status(201).json({
            ok: true,
            mensaje: usuario.role === 'admin' ? 'Producto de la tienda creado correctamente.' : 'Producto del vendedor creado correctamente.',
            id: resultado.lastID
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo crear el producto.');
    }
});

app.put('/api/productos/:id', async (req, res) => {
    const actorEmail = req.body?.actorEmail || req.body?.adminEmail;
    const productoId = parseInt(req.params.id, 10);

    if (!productoId) {
        res.status(400).json({ ok: false, mensaje: 'Producto invalido.' });
        return;
    }

    try {
        const usuario = await autenticarRequest(req, ['admin', 'vendedor'], actorEmail);
        const producto = await obtenerProductoPorId(productoId);

        if (!producto) {
            res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
            return;
        }

        if (!puedeGestionarProducto(usuario, producto)) {
            res.status(403).json({ ok: false, mensaje: 'No puedes editar este producto.' });
            return;
        }

        const resultado = await dbExecute(
            sql(
                `UPDATE productos
                 SET nombre = ?, categoria = ?, descripcion = ?, precio = ?, imagen_url = ?, stock = ?, actualizado_en = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                `UPDATE productos
                 SET nombre = $1, categoria = $2, descripcion = $3, precio = $4, imagen_url = $5, stock = $6, actualizado_en = CURRENT_TIMESTAMP
                 WHERE id = $7
                 RETURNING id`
            ),
            [
                String(req.body?.nombre || '').trim(),
                String(req.body?.categoria || '').trim() || 'General',
                String(req.body?.descripcion || '').trim(),
                Number(req.body?.precio || 0),
                String(req.body?.imagen_url || '').trim(),
                Math.max(0, parseInt(req.body?.stock, 10) || 0),
                productoId
            ]
        );

        if (!resultado.changes) {
            res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
            return;
        }

        res.json({ ok: true, mensaje: 'Producto actualizado correctamente.' });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo actualizar el producto.');
    }
});

app.delete('/api/productos/:id', async (req, res) => {
    const productoId = parseInt(req.params.id, 10);
    const actorEmail = req.query.email || req.query.adminEmail || req.headers['x-user-email'] || req.headers['x-admin-email'];

    if (!productoId) {
        res.status(400).json({ ok: false, mensaje: 'Producto invalido.' });
        return;
    }

    try {
        const usuario = await autenticarRequest(req, ['admin', 'vendedor'], actorEmail);
        const producto = await obtenerProductoPorId(productoId);

        if (!producto) {
            res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
            return;
        }

        if (!puedeGestionarProducto(usuario, producto)) {
            res.status(403).json({ ok: false, mensaje: 'No puedes eliminar este producto.' });
            return;
        }

        const resultado = await dbExecute(
            sql(
                'UPDATE productos SET activo = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
                'UPDATE productos SET activo = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id'
            ),
            [productoId]
        );

        if (!resultado.changes) {
            res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
            return;
        }

        res.json({ ok: true, mensaje: 'Producto eliminado correctamente.' });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo eliminar el producto.');
    }
});

app.post('/api/compras', async (req, res) => {
    const productoId = parseInt(req.body?.productoId, 10);
    const cantidad = Math.max(1, parseInt(req.body?.cantidad, 10) || 1);
    const compradorNombre = String(req.body?.nombreComprador || 'Cliente web').trim();
    const compradorEmail = String(req.body?.emailComprador || '').trim().toLowerCase();

    if (!productoId) {
        res.status(400).json({ ok: false, mensaje: 'Producto invalido.' });
        return;
    }

    try {
        const compra = await conTransaccion(async (query) => {
            const producto = await query.get(sql(
                `SELECT id, nombre, precio, stock, activo, aprobado
                 FROM productos
                 WHERE id = ? AND activo = 1 AND aprobado = 1
                 LIMIT 1`,
                `SELECT id, nombre, precio, stock, activo, aprobado
                 FROM productos
                 WHERE id = $1 AND activo = 1 AND aprobado = 1
                 LIMIT 1 FOR UPDATE`
            ), [productoId]);

            if (!producto) {
                throw crearErrorHttp(404, 'El producto ya no esta disponible.');
            }

            if (aNumero(producto.stock) < cantidad) {
                throw crearErrorHttp(400, 'No hay suficiente stock para esta compra.');
            }

            const total = Number(producto.precio || 0) * cantidad;

            const venta = await query.execute(sql(
                `INSERT INTO ventas (producto_id, producto_nombre, cantidad, total, comprador_nombre, comprador_email)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                `INSERT INTO ventas (producto_id, producto_nombre, cantidad, total, comprador_nombre, comprador_email)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id`
            ), [producto.id, producto.nombre, cantidad, total, compradorNombre, compradorEmail]);

            await query.execute(sql(
                `INSERT INTO compras (legacy_venta_id, producto_id, producto_nombre, cantidad, total, comprador_nombre, comprador_email)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                `INSERT INTO compras (legacy_venta_id, producto_id, producto_nombre, cantidad, total, comprador_nombre, comprador_email)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`
            ), [venta.lastID, producto.id, producto.nombre, cantidad, total, compradorNombre, compradorEmail]);

            const actualizacion = await query.execute(sql(
                'UPDATE productos SET stock = stock - ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
                'UPDATE productos SET stock = stock - $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id'
            ), [cantidad, producto.id]);

            if (!actualizacion.changes) {
                throw crearErrorHttp(500, 'No se pudo registrar la compra.');
            }

            return {
                nombre: producto.nombre,
                total
            };
        });

        res.status(201).json({
            ok: true,
            mensaje: `Compra registrada: ${compra.nombre}`,
            total: compra.total
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo registrar la compra.');
    }
});

app.get('/api/historial/ventas', async (req, res) => {
    try {
        const usuario = await autenticarRequest(req, ['admin', 'vendedor'], req.query.email || req.headers['x-user-email']);
        const params = [];
        let whereSqlite = 'WHERE p.activo = 1';
        let wherePg = 'WHERE p.activo = 1';

        if (usuario.role === 'vendedor') {
            whereSqlite += " AND LOWER(COALESCE(p.vendedor_email, '')) = ?";
            wherePg += " AND LOWER(COALESCE(p.vendedor_email, '')) = $1";
            params.push(usuario.email);
        }

        const ventas = await dbAll(sql(
            `SELECT v.id, v.producto_id, v.producto_nombre, v.cantidad, v.total, v.comprador_nombre, v.comprador_email,
                    v.fecha, p.origen_producto, p.vendedor_nombre, p.vendedor_email
             FROM ventas v
             INNER JOIN productos p ON p.id = v.producto_id
             ${whereSqlite}
             ORDER BY v.fecha DESC, v.id DESC
             LIMIT 100`,
            `SELECT v.id, v.producto_id, v.producto_nombre, v.cantidad, v.total, v.comprador_nombre, v.comprador_email,
                    v.fecha, p.origen_producto, p.vendedor_nombre, p.vendedor_email
             FROM ventas v
             INNER JOIN productos p ON p.id = v.producto_id
             ${wherePg}
             ORDER BY v.fecha DESC, v.id DESC
             LIMIT 100`
        ), params);

        res.json({ ok: true, ventas });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo cargar el historial de ventas.');
    }
});

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const actorEmail = req.query.email || req.headers['x-user-email'];
        let usuario = null;

        if (actorEmail) {
            usuario = await autenticarRequest(req, ['admin', 'vendedor'], actorEmail);
        } else if (obtenerTokenRequest(req)) {
            usuario = await autenticarRequest(req, ['admin', 'vendedor']);
        }

        const params = [];
        let filtroProductosSqlite = 'WHERE activo = 1';
        let filtroProductosPg = 'WHERE activo = 1';
        let fromComprasSqlite = 'FROM compras c INNER JOIN productos p ON p.id = c.producto_id WHERE p.activo = 1';
        let fromComprasPg = 'FROM compras c INNER JOIN productos p ON p.id = c.producto_id WHERE p.activo = 1';

        if (usuario?.role === 'vendedor') {
            filtroProductosSqlite += " AND LOWER(COALESCE(vendedor_email, '')) = ?";
            filtroProductosPg += " AND LOWER(COALESCE(vendedor_email, '')) = $1";
            fromComprasSqlite += " AND LOWER(COALESCE(p.vendedor_email, '')) = ?";
            fromComprasPg += " AND LOWER(COALESCE(p.vendedor_email, '')) = $1";
            params.push(usuario.email);
        }

        const totalProductosRow = await dbGet(sql(
            `SELECT COUNT(*) AS total FROM productos ${filtroProductosSqlite}`,
            `SELECT COUNT(*) AS total FROM productos ${filtroProductosPg}`
        ), params);

        const comprasTotalesRow = await dbGet(sql(
            `SELECT COALESCE(SUM(c.cantidad), 0) AS comprasTotales ${fromComprasSqlite}`,
            `SELECT COALESCE(SUM(c.cantidad), 0) AS comprasTotales ${fromComprasPg}`
        ), params);

        const productoMasComprado = await dbGet(sql(
            `SELECT c.producto_nombre, SUM(c.cantidad) AS total
             ${fromComprasSqlite}
             GROUP BY c.producto_nombre
             ORDER BY total DESC, c.producto_nombre ASC
             LIMIT 1`,
            `SELECT c.producto_nombre, SUM(c.cantidad) AS total
             ${fromComprasPg}
             GROUP BY c.producto_nombre
             ORDER BY total DESC, c.producto_nombre ASC
             LIMIT 1`
        ), params);

        const ventasPorDia = await dbAll(sql(
            `SELECT strftime('%Y-%m-%d', c.fecha, 'localtime') AS dia, SUM(c.cantidad) AS total
             ${fromComprasSqlite} AND datetime(c.fecha) >= datetime('now', '-6 days')
             GROUP BY strftime('%Y-%m-%d', c.fecha, 'localtime')
             ORDER BY dia ASC`,
            `SELECT TO_CHAR(c.fecha::date, 'YYYY-MM-DD') AS dia, SUM(c.cantidad) AS total
             ${fromComprasPg} AND c.fecha >= CURRENT_TIMESTAMP - INTERVAL '6 days'
             GROUP BY c.fecha::date
             ORDER BY c.fecha::date ASC`
        ), params);

        const productosTiendaRow = usuario?.role === 'vendedor'
            ? { total: 0 }
            : await dbGet(sql(
                `SELECT COUNT(*) AS total FROM productos ${filtroProductosSqlite} AND origen_producto = 'tienda'`,
                `SELECT COUNT(*) AS total FROM productos ${filtroProductosPg} AND origen_producto = 'tienda'`
            ), params);

        const productosVendedoresRow = await dbGet(sql(
            `SELECT COUNT(*) AS total FROM productos ${filtroProductosSqlite}${usuario?.role === 'vendedor' ? '' : " AND origen_producto = 'vendedor'"}`,
            `SELECT COUNT(*) AS total FROM productos ${filtroProductosPg}${usuario?.role === 'vendedor' ? '' : " AND origen_producto = 'vendedor'"}`
        ), params);

        const totalVendedoresRow = usuario?.role === 'admin'
            ? await dbGet(sql(
                "SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1 AND role = 'vendedor'",
                "SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1 AND role = 'vendedor'"
            ))
            : { total: usuario?.role === 'vendedor' ? 1 : 0 };

        res.json({
            ok: true,
            alcance: usuario?.role || 'publico',
            totalProductos: aNumero(totalProductosRow?.total),
            totalProductosTienda: aNumero(productosTiendaRow?.total),
            totalProductosVendedores: aNumero(productosVendedoresRow?.total),
            totalVendedores: aNumero(totalVendedoresRow?.total),
            comprasTotales: aNumero(comprasTotalesRow?.comprastotales ?? comprasTotalesRow?.comprasTotales),
            productoMasComprado: productoMasComprado
                ? { ...productoMasComprado, total: aNumero(productoMasComprado.total) }
                : null,
            ventasPorDia: ventasPorDia.map((venta) => ({
                dia: venta.dia,
                total: aNumero(venta.total)
            }))
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudieron cargar las metricas.');
    }
});

app.get('/api/kimbin-note', async (req, res) => {
    try {
        const nota = await dbGet(sql(
            'SELECT mensaje, autor_email, actualizado_en FROM notas_kimbin WHERE id = 1',
            'SELECT mensaje, autor_email, actualizado_en FROM notas_kimbin WHERE id = 1'
        ));

        res.json({
            ok: true,
            mensaje: nota?.mensaje || mensajeInicialKimbin,
            autor: nota?.autor_email || 'sistema@merkateck.com',
            actualizadoEn: nota?.actualizado_en || null
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo leer la nota');
    }
});

app.post('/api/kimbin-note', async (req, res) => {
    const { mensaje, email } = req.body || {};
    const texto = String(mensaje || '').trim();

    if (!texto) {
        res.status(400).json({ ok: false, mensaje: 'La nota no puede estar vacia.' });
        return;
    }

    try {
        const usuario = await autenticarRequest(req, ['admin', 'vendedor', 'cliente'], email);

        if (!usuario) {
            res.status(403).json({ ok: false, mensaje: 'Solo usuarios autorizados pueden guardar notas.' });
            return;
        }

        await dbExecute(sql(
            'UPDATE notas_kimbin SET mensaje = ?, autor_email = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1',
            'UPDATE notas_kimbin SET mensaje = $1, autor_email = $2, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1'
        ), [texto, usuario.email]);

        res.json({ ok: true, mensaje: 'Nota guardada correctamente.' });
    } catch (error) {
        manejarErrorRuta(res, error, 'No se pudo guardar la nota.');
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        res.status(400).json({ ok: false, mensaje: 'Correo y contrasena obligatorios' });
        return;
    }

    const correo = String(email).trim().toLowerCase();
    const clave = String(password).trim();

    if (!esEmailValido(correo)) {
        res.status(400).json({ ok: false, mensaje: 'Ingresa un correo valido.' });
        return;
    }

    try {
        const usuario = await obtenerUsuarioActivo(correo);

        if (!usuario) {
            res.status(403).json({ ok: false, mensaje: 'Ese correo no esta autorizado en la base de datos.' });
            return;
        }

        if (usuario.password_hash !== hashPassword(clave)) {
            res.status(401).json({ ok: false, mensaje: 'Contrasena incorrecta' });
            return;
        }

        await dbExecute(sql(
            'INSERT INTO accesos (email) VALUES (?)',
            'INSERT INTO accesos (email) VALUES ($1)'
        ), [correo]);

        res.json({
            ok: true,
            mensaje: 'Acceso correcto',
            sessionToken: crearTokenSesion(usuario),
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                role: normalizarRol(usuario.role)
            }
        });
    } catch (error) {
        manejarErrorRuta(res, error, 'Error interno');
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

async function cerrarBaseDeDatos() {
    if (pgPool) {
        await pgPool.end();
    }

    if (sqliteDb) {
        await new Promise((resolve, reject) => {
            sqliteDb.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }
}

async function iniciarServidor() {
    await inicializarBaseDeDatos();

    const resumen = obtenerResumenBaseDeDatos();
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en http://localhost:${PORT}`);
        console.log(`Base de datos lista en ${resumen.ubicacion} usando ${resumen.motor}`);
    });
}

process.on('SIGINT', () => {
    cerrarBaseDeDatos().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
    cerrarBaseDeDatos().finally(() => process.exit(0));
});

iniciarServidor().catch((error) => {
    console.error('No se pudo iniciar el servidor:', error);
    process.exit(1);
});
