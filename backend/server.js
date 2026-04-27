const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_PUBLIC_URL;
const passwordBase = String(process.env.DEFAULT_USER_PASSWORD || 'KIMBAMIPAPI').trim();
const adminInicial = String(process.env.ADMIN_EMAIL || 'kimba@coso.com').trim().toLowerCase();
const correosBase = [
    'kimba@coso.com',
    'guty@coso.com',
    'aylen@coso.com',
    'brayan@coso.com',
    'luz@coso.com',
    'vicha@coso.com'
];
const mensajeInicialKimbin = 'Escribe aquí la nota de KIMBIN desde el panel de administración.';
const ACTIVO_SI = 1;
const ACTIVO_NO = 0;

if (!databaseUrl) {
    throw new Error('DATABASE_URL no está configurada. Este backend ahora requiere PostgreSQL.');
}

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) || process.env.PGSSLMODE === 'disable'
        ? false
        : { rejectUnauthorized: false }
});

function hashPassword(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function esEmailValido(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo || '').trim().toLowerCase());
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

function crearTokenSesion() {
    return crypto.randomBytes(32).toString('hex');
}

function obtenerTokenDesdeRequest(req) {
    const authorization = String(req.headers.authorization || '').trim();

    if (authorization.toLowerCase().startsWith('bearer ')) {
        return authorization.slice(7).trim();
    }

    return String(req.headers['x-auth-token'] || req.query.token || '').trim();
}

function estaActivo(valor) {
    return Number(valor) === ACTIVO_SI;
}

async function dbGet(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
}

async function dbAll(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
}

async function dbRun(text, params = []) {
    return pool.query(text, params);
}

async function limpiarTokenSesion(token) {
    if (!token) {
        return;
    }

    await dbRun('DELETE FROM sesiones WHERE token = $1', [token]);
}

async function crearUsuarioSiNoExiste(correo, clave = passwordBase, rol = 'vendor') {
    if (!esEmailValido(correo)) {
        return;
    }

    const nombre = obtenerNombreDesdeCorreo(correo);
    const passwordHash = hashPassword(String(clave || passwordBase).trim());
    const rolFinal = rol === 'admin' ? 'admin' : 'vendor';

    await dbRun(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email)
         DO UPDATE SET
            nombre = EXCLUDED.nombre,
            password_hash = EXCLUDED.password_hash,
            rol = EXCLUDED.rol,
            activo = $5`,
        [nombre, correo, passwordHash, rolFinal, ACTIVO_SI]
    );
}

async function obtenerUsuarioActivo(correo) {
    return dbGet(
        `SELECT id, nombre, email, password_hash, rol, activo
         FROM usuarios
         WHERE email = $1 AND activo = $2
         LIMIT 1`,
        [correo, ACTIVO_SI]
    );
}

async function obtenerSesionActiva(req, res) {
    const token = obtenerTokenDesdeRequest(req);

    if (!token) {
        res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión.' });
        return null;
    }

    const sesion = await dbGet(
        `SELECT s.token, s.expira_en, u.id, u.nombre, u.email, u.rol
         FROM sesiones s
         INNER JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token = $1 AND u.activo = $2
         LIMIT 1`,
        [token, ACTIVO_SI]
    );

    if (!sesion) {
        res.status(401).json({ ok: false, mensaje: 'Tu sesión ya no es válida.' });
        return null;
    }

    if (new Date(sesion.expira_en).getTime() <= Date.now()) {
        await limpiarTokenSesion(token);
        res.status(401).json({ ok: false, mensaje: 'Tu sesión expiró.' });
        return null;
    }

    return {
        token,
        usuario: {
            id: sesion.id,
            nombre: sesion.nombre,
            email: sesion.email,
            rol: sesion.rol
        }
    };
}

async function validarSesion(req, res) {
    return obtenerSesionActiva(req, res);
}

async function validarRol(rolesPermitidos, req, res) {
    const sesion = await obtenerSesionActiva(req, res);
    if (!sesion) {
        return null;
    }

    if (!rolesPermitidos.includes(sesion.usuario.rol)) {
        res.status(403).json({ ok: false, mensaje: 'No tienes permiso para esta acción.' });
        return null;
    }

    return sesion.usuario;
}

async function validarAdmin(req, res) {
    return validarRol(['admin'], req, res);
}

async function validarVendedorOAdmin(req, res) {
    return validarRol(['admin', 'vendor'], req, res);
}

function puedeGestionarProducto(usuario, producto) {
    if (!usuario || !producto) {
        return false;
    }

    if (usuario.rol === 'admin') {
        return true;
    }

    return String(producto.creado_por_email || '').trim().toLowerCase() === usuario.email;
}

async function obtenerProductoPorId(productoId) {
    return dbGet('SELECT * FROM productos WHERE id = $1 LIMIT 1', [productoId]);
}

async function migrarVentasLegacyACompras() {
    await dbRun(
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
            COALESCE(fecha, CURRENT_TIMESTAMP)
        FROM ventas
        ON CONFLICT (legacy_venta_id) DO NOTHING`
    );
}

async function migrarProductosLegacyAPropietario() {
    await dbRun(
        `UPDATE productos
         SET creado_por_email = $1
         WHERE creado_por_email IS NULL OR TRIM(creado_por_email) = ''`,
        [adminInicial]
    );
}

async function inicializarBaseDeDatos() {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL DEFAULT '',
            rol TEXT NOT NULL DEFAULT 'vendor',
            activo INTEGER NOT NULL DEFAULT 1,
            creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre TEXT`);
    await dbRun(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''`);
    await dbRun(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'vendor'`);
    await dbRun(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo INTEGER NOT NULL DEFAULT 1`);
    await dbRun(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS accesos (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS notas_kimbin (
            id INTEGER PRIMARY KEY,
            mensaje TEXT NOT NULL,
            autor_email TEXT,
            actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`ALTER TABLE notas_kimbin ADD COLUMN IF NOT EXISTS autor_email TEXT`);
    await dbRun(`ALTER TABLE notas_kimbin ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS productos (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            categoria TEXT NOT NULL DEFAULT 'General',
            descripcion TEXT NOT NULL DEFAULT '',
            precio NUMERIC(12, 2) NOT NULL DEFAULT 0,
            imagen_url TEXT DEFAULT '',
            stock INTEGER NOT NULL DEFAULT 0,
            creado_por_email TEXT DEFAULT '',
            activo INTEGER NOT NULL DEFAULT 1,
            creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'General'`);
    await dbRun(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS descripcion TEXT NOT NULL DEFAULT ''`);
    await dbRun(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio NUMERIC(12, 2) NOT NULL DEFAULT 0`);
    await dbRun(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagen_url TEXT DEFAULT ''`);
    await dbRun(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0`);
    await dbRun(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS creado_por_email TEXT DEFAULT ''`);
    await dbRun(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo INTEGER NOT NULL DEFAULT 1`);
    await dbRun(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);
    await dbRun(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS ventas (
            id SERIAL PRIMARY KEY,
            producto_id INTEGER,
            producto_nombre TEXT NOT NULL,
            cantidad INTEGER NOT NULL DEFAULT 1,
            total NUMERIC(12, 2) NOT NULL DEFAULT 0,
            comprador_nombre TEXT,
            comprador_email TEXT,
            fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS compras (
            id SERIAL PRIMARY KEY,
            legacy_venta_id INTEGER UNIQUE,
            producto_id INTEGER REFERENCES productos (id) ON DELETE SET NULL,
            producto_nombre TEXT NOT NULL,
            cantidad INTEGER NOT NULL DEFAULT 1,
            total NUMERIC(12, 2) NOT NULL DEFAULT 0,
            comprador_nombre TEXT,
            comprador_email TEXT,
            fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS legacy_venta_id INTEGER`);
    await dbRun(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);
    await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS compras_legacy_venta_id_idx ON compras (legacy_venta_id)`);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS sesiones (
            token TEXT PRIMARY KEY,
            usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
            creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            expira_en TIMESTAMPTZ NOT NULL
        )
    `);

    for (const correo of obtenerUsuariosSemilla()) {
        await crearUsuarioSiNoExiste(correo, passwordBase, correo === adminInicial ? 'admin' : 'vendor');
    }

    await dbRun(
        `INSERT INTO notas_kimbin (id, mensaje, autor_email)
         VALUES (1, $1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [mensajeInicialKimbin, 'sistema@merkateck.com']
    );

    await migrarProductosLegacyAPropietario();
    await migrarVentasLegacyACompras();
}

function asyncHandler(handler) {
    return (req, res) => {
        Promise.resolve(handler(req, res)).catch((error) => {
            console.error('Error no controlado:', error);
            if (!res.headersSent) {
                res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
            }
        });
    };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/KIMBIN', express.static(path.join(__dirname, '..', 'KIMBIN')));

app.get('/api/health', asyncHandler(async (req, res) => {
    const row = await dbGet('SELECT COUNT(*)::int AS total FROM usuarios WHERE activo = $1', [ACTIVO_SI]);
    res.json({
        ok: true,
        mensaje: 'Servidor activo',
        totalUsuarios: row?.total || 0,
        baseDeDatos: 'postgres'
    });
}));

app.get('/api/usuarios', asyncHandler(async (req, res) => {
    const admin = await validarAdmin(req, res);
    if (!admin) {
        return;
    }

    const usuarios = await dbAll(
        `SELECT id, nombre, email, rol, activo, creado_en
         FROM usuarios
         ORDER BY creado_en DESC, email ASC`
    );

    res.json({ ok: true, usuarios });
}));

app.post('/api/usuarios', asyncHandler(async (req, res) => {
    const admin = await validarAdmin(req, res);
    if (!admin) {
        return;
    }

    const { email, nombre, password, rol } = req.body || {};
    const correo = String(email || '').trim().toLowerCase();
    const nombreFinal = String(nombre || '').trim() || obtenerNombreDesdeCorreo(correo);
    const claveFinal = String(password || '').trim() || passwordBase;
    const rolFinal = rol === 'admin' ? 'admin' : 'vendor';

    if (!esEmailValido(correo)) {
        return res.status(400).json({ ok: false, mensaje: 'Ingresa un correo válido.' });
    }

    const existente = await dbGet('SELECT id FROM usuarios WHERE email = $1 LIMIT 1', [correo]);

    if (existente) {
        await dbRun(
            `UPDATE usuarios
             SET nombre = $1, password_hash = $2, rol = $3, activo = $4
             WHERE email = $5`,
            [nombreFinal, hashPassword(claveFinal), rolFinal, ACTIVO_SI, correo]
        );

        return res.json({ ok: true, mensaje: 'Usuario actualizado correctamente.' });
    }

    await dbRun(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
         VALUES ($1, $2, $3, $4, $5)`,
        [nombreFinal, correo, hashPassword(claveFinal), rolFinal, ACTIVO_SI]
    );

    res.status(201).json({ ok: true, mensaje: 'Usuario guardado correctamente.' });
}));

app.get('/api/productos', asyncHandler(async (req, res) => {
    const productos = await dbAll(
        `SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                p.creado_en, p.actualizado_en, p.creado_por_email, COALESCE(SUM(c.cantidad), 0)::int AS vendidos
         FROM productos p
         LEFT JOIN compras c ON c.producto_id = p.id
            WHERE p.activo = $1
         GROUP BY p.id
            ORDER BY p.actualizado_en DESC, p.id DESC`,
           [ACTIVO_SI]
    );

    res.json({ ok: true, productos });
}));

app.get('/api/mis-productos', asyncHandler(async (req, res) => {
    const usuario = await validarVendedorOAdmin(req, res);
    if (!usuario) {
        return;
    }

    const productos = await dbAll(
        `SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                p.creado_en, p.actualizado_en, p.creado_por_email, COALESCE(SUM(c.cantidad), 0)::int AS vendidos
         FROM productos p
         LEFT JOIN compras c ON c.producto_id = p.id
         WHERE p.activo = $1 AND p.creado_por_email = $2
         GROUP BY p.id
         ORDER BY p.actualizado_en DESC, p.id DESC`,
        [ACTIVO_SI, usuario.email]
    );

    res.json({ ok: true, productos });
}));

app.post('/api/productos', asyncHandler(async (req, res) => {
    const usuario = await validarVendedorOAdmin(req, res);
    if (!usuario) {
        return;
    }

    const { nombre, categoria, descripcion, precio, imagen_url, stock } = req.body || {};
    const nombreFinal = String(nombre || '').trim();
    const categoriaFinal = String(categoria || '').trim() || 'General';
    const descripcionFinal = String(descripcion || '').trim();
    const precioFinal = Number(precio || 0);
    const imagenFinal = String(imagen_url || '').trim();
    const stockFinal = Math.max(0, parseInt(stock, 10) || 0);

    if (!nombreFinal || !descripcionFinal || precioFinal <= 0) {
        return res.status(400).json({ ok: false, mensaje: 'Completa nombre, descripción y precio.' });
    }

    const result = await dbRun(
        `INSERT INTO productos (nombre, categoria, descripcion, precio, imagen_url, stock, creado_por_email, activo, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
         RETURNING id`,
        [nombreFinal, categoriaFinal, descripcionFinal, precioFinal, imagenFinal, stockFinal, usuario.email, ACTIVO_SI]
    );

    res.status(201).json({ ok: true, mensaje: 'Producto creado correctamente.', id: result.rows[0].id });
}));

app.put('/api/productos/:id', asyncHandler(async (req, res) => {
    const usuario = await validarVendedorOAdmin(req, res);
    if (!usuario) {
        return;
    }

    const productoId = parseInt(req.params.id, 10);
    const producto = await obtenerProductoPorId(productoId);

    if (!producto || !estaActivo(producto.activo)) {
        return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
    }

    if (!puedeGestionarProducto(usuario, producto)) {
        return res.status(403).json({ ok: false, mensaje: 'No puedes editar este producto.' });
    }

    const { nombre, categoria, descripcion, precio, imagen_url, stock } = req.body || {};
    const result = await dbRun(
        `UPDATE productos
         SET nombre = $1,
             categoria = $2,
             descripcion = $3,
             precio = $4,
             imagen_url = $5,
             stock = $6,
             actualizado_en = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [
            String(nombre || '').trim(),
            String(categoria || '').trim() || 'General',
            String(descripcion || '').trim(),
            Number(precio || 0),
            String(imagen_url || '').trim(),
            Math.max(0, parseInt(stock, 10) || 0),
            productoId
        ]
    );

    if (!result.rowCount) {
        return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
    }

    res.json({ ok: true, mensaje: 'Producto actualizado correctamente.' });
}));

app.delete('/api/productos/:id', asyncHandler(async (req, res) => {
    const usuario = await validarVendedorOAdmin(req, res);
    if (!usuario) {
        return;
    }

    const productoId = parseInt(req.params.id, 10);
    const producto = await obtenerProductoPorId(productoId);

    if (!producto || !estaActivo(producto.activo)) {
        return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
    }

    if (!puedeGestionarProducto(usuario, producto)) {
        return res.status(403).json({ ok: false, mensaje: 'No puedes eliminar este producto.' });
    }

    const result = await dbRun(
        `UPDATE productos
         SET activo = $1, actualizado_en = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [ACTIVO_NO, productoId]
    );

    if (!result.rowCount) {
        return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
    }

    res.json({ ok: true, mensaje: 'Producto eliminado correctamente.' });
}));

app.post('/api/compras', asyncHandler(async (req, res) => {
    const productoId = parseInt(req.body?.productoId, 10);
    const cantidad = Math.max(1, parseInt(req.body?.cantidad, 10) || 1);
    const compradorNombre = String(req.body?.nombreComprador || 'Cliente web').trim();
    const compradorEmail = String(req.body?.emailComprador || '').trim().toLowerCase();

    if (!productoId) {
        return res.status(400).json({ ok: false, mensaje: 'Producto inválido.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const productoResult = await client.query(
            'SELECT * FROM productos WHERE id = $1 AND activo = $2 LIMIT 1 FOR UPDATE',
            [productoId, ACTIVO_SI]
        );
        const producto = productoResult.rows[0];

        if (!producto) {
            await client.query('ROLLBACK');
            return res.status(404).json({ ok: false, mensaje: 'El producto ya no está disponible.' });
        }

        if (Number(producto.stock) < cantidad) {
            await client.query('ROLLBACK');
            return res.status(400).json({ ok: false, mensaje: 'No hay suficiente stock para esta compra.' });
        }

        const total = Number(producto.precio) * cantidad;

        await client.query(
            `INSERT INTO compras (producto_id, producto_nombre, cantidad, total, comprador_nombre, comprador_email)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [producto.id, producto.nombre, cantidad, total, compradorNombre, compradorEmail]
        );

        await client.query(
            `UPDATE productos
             SET stock = stock - $1, actualizado_en = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [cantidad, producto.id]
        );

        await client.query('COMMIT');

        res.status(201).json({
            ok: true,
            mensaje: `Compra registrada: ${producto.nombre}`,
            total
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

app.get('/api/dashboard/stats', asyncHandler(async (req, res) => {
    const admin = await validarAdmin(req, res);
    if (!admin) {
        return;
    }

    const totalProductos = await dbGet('SELECT COUNT(*)::int AS total FROM productos WHERE activo = $1', [ACTIVO_SI]);
    const comprasTotales = await dbGet('SELECT COALESCE(SUM(cantidad), 0)::int AS total FROM compras');
    const productoMasComprado = await dbGet(
        `SELECT producto_nombre, SUM(cantidad)::int AS total
         FROM compras
         GROUP BY producto_nombre
         ORDER BY total DESC, producto_nombre ASC
         LIMIT 1`
    );
    const ventasPorDia = await dbAll(
        `SELECT TO_CHAR(fecha::date, 'YYYY-MM-DD') AS dia, SUM(cantidad)::int AS total
         FROM compras
         WHERE fecha >= NOW() - INTERVAL '6 days'
         GROUP BY fecha::date
         ORDER BY fecha::date ASC`
    );

    res.json({
        ok: true,
        totalProductos: totalProductos?.total || 0,
        comprasTotales: comprasTotales?.total || 0,
        productoMasComprado: productoMasComprado || null,
        ventasPorDia: ventasPorDia || []
    });
}));

app.get('/api/dashboard/mis-stats', asyncHandler(async (req, res) => {
    const usuario = await validarVendedorOAdmin(req, res);
    if (!usuario) {
        return;
    }

    const totalProductos = await dbGet(
        'SELECT COUNT(*)::int AS total FROM productos WHERE activo = $1 AND creado_por_email = $2',
        [ACTIVO_SI, usuario.email]
    );
    const comprasTotales = await dbGet(
        `SELECT COALESCE(SUM(c.cantidad), 0)::int AS total
         FROM compras c
         INNER JOIN productos p ON p.id = c.producto_id
         WHERE p.creado_por_email = $1`,
        [usuario.email]
    );
    const productoMasComprado = await dbGet(
        `SELECT c.producto_nombre, SUM(c.cantidad)::int AS total
         FROM compras c
         INNER JOIN productos p ON p.id = c.producto_id
         WHERE p.creado_por_email = $1
         GROUP BY c.producto_nombre
         ORDER BY total DESC, c.producto_nombre ASC
         LIMIT 1`,
        [usuario.email]
    );
    const ventasPorDia = await dbAll(
        `SELECT TO_CHAR(c.fecha::date, 'YYYY-MM-DD') AS dia, SUM(c.cantidad)::int AS total
         FROM compras c
         INNER JOIN productos p ON p.id = c.producto_id
         WHERE p.creado_por_email = $1
           AND c.fecha >= NOW() - INTERVAL '6 days'
         GROUP BY c.fecha::date
         ORDER BY c.fecha::date ASC`,
        [usuario.email]
    );

    res.json({
        ok: true,
        totalProductos: totalProductos?.total || 0,
        comprasTotales: comprasTotales?.total || 0,
        productoMasComprado: productoMasComprado || null,
        ventasPorDia: ventasPorDia || []
    });
}));

app.get('/api/kimbin-note', asyncHandler(async (req, res) => {
    const nota = await dbGet(
        `SELECT mensaje, autor_email, actualizado_en
         FROM notas_kimbin
         WHERE id = 1`
    );

    res.json({
        ok: true,
        mensaje: nota?.mensaje || mensajeInicialKimbin,
        autor: nota?.autor_email || 'sistema@merkateck.com',
        actualizadoEn: nota?.actualizado_en || null
    });
}));

app.post('/api/kimbin-note', asyncHandler(async (req, res) => {
    const usuario = await validarAdmin(req, res);
    if (!usuario) {
        return;
    }

    const { mensaje } = req.body || {};
    const texto = String(mensaje || '').trim();

    if (!texto) {
        return res.status(400).json({ ok: false, mensaje: 'La nota no puede estar vacía.' });
    }

    await dbRun(
        `UPDATE notas_kimbin
         SET mensaje = $1, autor_email = $2, actualizado_en = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [texto, usuario.email]
    );

    res.json({ ok: true, mensaje: 'Nota guardada correctamente.' });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña obligatorios' });
    }

    const correo = String(email).trim().toLowerCase();
    const clave = String(password).trim();

    if (!esEmailValido(correo)) {
        return res.status(400).json({ ok: false, mensaje: 'Ingresa un correo válido.' });
    }

    const usuario = await obtenerUsuarioActivo(correo);

    if (!usuario) {
        return res.status(403).json({ ok: false, mensaje: 'Ese correo no está autorizado en la base de datos.' });
    }

    if (usuario.password_hash !== hashPassword(clave)) {
        return res.status(401).json({ ok: false, mensaje: 'Contraseña incorrecta' });
    }

    const token = crearTokenSesion();
    const expiraEn = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();

    await dbRun('INSERT INTO accesos (email) VALUES ($1)', [correo]);
    await dbRun(
        'INSERT INTO sesiones (token, usuario_id, expira_en) VALUES ($1, $2, $3)',
        [token, usuario.id, expiraEn]
    );

    res.json({
        ok: true,
        mensaje: 'Acceso correcto',
        token,
        usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            email: usuario.email,
            rol: usuario.rol
        }
    });
}));

app.get('/api/session', asyncHandler(async (req, res) => {
    const sesion = await validarSesion(req, res);
    if (!sesion) {
        return;
    }

    res.json({ ok: true, usuario: sesion.usuario });
}));

app.post('/api/logout', asyncHandler(async (req, res) => {
    const token = obtenerTokenDesdeRequest(req);
    await limpiarTokenSesion(token);
    res.json({ ok: true, mensaje: 'Sesión cerrada.' });
}));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

inicializarBaseDeDatos()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
            console.log('Base de datos lista en PostgreSQL');
        });
    })
    .catch((error) => {
        console.error('No se pudo inicializar PostgreSQL:', error);
        process.exit(1);
    });
