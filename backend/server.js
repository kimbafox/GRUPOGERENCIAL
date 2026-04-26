const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const storageDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const dbPath = process.env.DB_PATH || path.join(storageDir, 'usuarios.db');
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

if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

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

function limpiarTokenSesion(token) {
    if (!token) {
        return;
    }

    db.run('DELETE FROM sesiones WHERE token = ?', [token]);
}

function crearUsuarioSiNoExiste(correo, clave = passwordBase, rol = 'vendor') {
    if (!esEmailValido(correo)) {
        return;
    }

    const nombre = obtenerNombreDesdeCorreo(correo);
    const passwordHash = hashPassword(String(clave || passwordBase).trim());
    const rolFinal = rol === 'admin' ? 'admin' : 'vendor';

    db.run(
        'INSERT OR IGNORE INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)',
        [nombre, correo, passwordHash, rolFinal]
    );

    db.run(
        'UPDATE usuarios SET nombre = ?, password_hash = ?, rol = ?, activo = 1 WHERE email = ?',
        [nombre, passwordHash, rolFinal, correo]
    );
}

function obtenerUsuarioActivo(correo, callback) {
    db.get(
        'SELECT id, nombre, email, password_hash, rol, activo FROM usuarios WHERE email = ? AND activo = 1 LIMIT 1',
        [correo],
        callback
    );
}

function obtenerSesionActiva(req, res, callback) {
    const token = obtenerTokenDesdeRequest(req);

    if (!token) {
        return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión.' });
    }

    db.get(
        `SELECT s.token, s.expira_en, u.id, u.nombre, u.email, u.rol, u.activo
         FROM sesiones s
         INNER JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.token = ? AND u.activo = 1
         LIMIT 1`,
        [token],
        (error, sesion) => {
            if (error) {
                return res.status(500).json({ ok: false, mensaje: 'No se pudo validar la sesión.' });
            }

            if (!sesion) {
                return res.status(401).json({ ok: false, mensaje: 'Tu sesión ya no es válida.' });
            }

            if (Date.parse(sesion.expira_en) <= Date.now()) {
                limpiarTokenSesion(token);
                return res.status(401).json({ ok: false, mensaje: 'Tu sesión expiró.' });
            }

            callback({
                token,
                usuario: {
                    id: sesion.id,
                    nombre: sesion.nombre,
                    email: sesion.email,
                    rol: sesion.rol
                }
            });
        }
    );
}

function validarSesion(req, res, callback) {
    obtenerSesionActiva(req, res, callback);
}

function validarRol(rolesPermitidos, req, res, callback) {
    obtenerSesionActiva(req, res, (sesion) => {
        if (!rolesPermitidos.includes(sesion.usuario.rol)) {
            return res.status(403).json({ ok: false, mensaje: 'No tienes permiso para esta acción.' });
        }

        callback(sesion.usuario);
    });
}

function validarAdmin(req, res, callback) {
    validarRol(['admin'], req, res, callback);
}

function validarVendedorOAdmin(req, res, callback) {
    validarRol(['admin', 'vendor'], req, res, callback);
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

function obtenerProductoPorId(productoId, callback) {
    db.get('SELECT * FROM productos WHERE id = ? LIMIT 1', [productoId], callback);
}

function validarAdminPorCorreo(correo, res, callback) {
    const email = String(correo || '').trim().toLowerCase();

    if (!esEmailValido(email)) {
        return res.status(401).json({ ok: false, mensaje: 'Debes iniciar sesión como administrador.' });
    }

    obtenerUsuarioActivo(email, (error, usuario) => {
        if (error) {
            return res.status(500).json({ ok: false, mensaje: 'No se pudo validar el administrador.' });
        }

        if (!usuario || usuario.rol !== 'admin') {
            return res.status(403).json({ ok: false, mensaje: 'Tu correo no tiene permisos para administrar.' });
        }

        callback(usuario);
    });
}

function migrarVentasLegacyACompras() {
    db.run(
        `INSERT OR IGNORE INTO compras (
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
        FROM ventas`
    );
}

function inicializarBaseDeDatos() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                rol TEXT NOT NULL DEFAULT 'vendor',
                activo INTEGER NOT NULL DEFAULT 1,
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'vendor'`, () => {});

        db.run(`
            CREATE TABLE IF NOT EXISTS accesos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                fecha TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS notas_kimbin (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                mensaje TEXT NOT NULL,
                autor_email TEXT,
                actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS productos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                categoria TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                precio REAL NOT NULL DEFAULT 0,
                imagen_url TEXT DEFAULT '',
                stock INTEGER NOT NULL DEFAULT 0,
                creado_por_email TEXT DEFAULT '',
                activo INTEGER NOT NULL DEFAULT 1,
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`ALTER TABLE productos ADD COLUMN creado_por_email TEXT DEFAULT ''`, () => {});

        db.run(`
            CREATE TABLE IF NOT EXISTS ventas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                producto_id INTEGER NOT NULL,
                producto_nombre TEXT NOT NULL,
                cantidad INTEGER NOT NULL DEFAULT 1,
                total REAL NOT NULL DEFAULT 0,
                comprador_nombre TEXT,
                comprador_email TEXT,
                fecha TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (producto_id) REFERENCES productos (id)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS compras (
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
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS sesiones (
                token TEXT PRIMARY KEY,
                usuario_id INTEGER NOT NULL,
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
                expira_en TEXT NOT NULL,
                FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
            )
        `);

        obtenerUsuariosSemilla().forEach((correo) => {
            crearUsuarioSiNoExiste(correo, passwordBase, correo === adminInicial ? 'admin' : 'vendor');
        });

        db.run(
            'INSERT OR IGNORE INTO notas_kimbin (id, mensaje, autor_email) VALUES (1, ?, ?)',
            [mensajeInicialKimbin, 'sistema@merkateck.com']
        );

        migrarVentasLegacyACompras();
    });
}

inicializarBaseDeDatos();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/KIMBIN', express.static(path.join(__dirname, '..', 'KIMBIN')));

app.get('/api/health', (req, res) => {
    db.get('SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1', [], (error, row) => {
        if (error) {
            return res.status(500).json({ ok: false, mensaje: 'Error al leer la base de datos' });
        }

        res.json({
            ok: true,
            mensaje: 'Servidor activo',
            totalUsuarios: row?.total || 0,
            baseDeDatos: path.basename(dbPath)
        });
    });
});

app.get('/api/usuarios', (req, res) => {
    validarAdmin(req, res, () => {
        db.all(
            'SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY creado_en DESC, email ASC',
            [],
            (error, usuarios) => {
                if (error) {
                    return res.status(500).json({ ok: false, mensaje: 'No se pudo listar los usuarios.' });
                }

                res.json({ ok: true, usuarios });
            }
        );
    });
});

app.post('/api/usuarios', (req, res) => {
    validarAdmin(req, res, () => {
        const { email, nombre, password, rol } = req.body || {};
        const correo = String(email || '').trim().toLowerCase();
        const nombreFinal = String(nombre || '').trim() || obtenerNombreDesdeCorreo(correo);
        const claveFinal = String(password || '').trim() || passwordBase;
        const rolFinal = rol === 'admin' ? 'admin' : 'vendor';

        if (!esEmailValido(correo)) {
            return res.status(400).json({ ok: false, mensaje: 'Ingresa un correo válido.' });
        }

        db.get('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [correo], (error, existente) => {
            if (error) {
                return res.status(500).json({ ok: false, mensaje: 'No se pudo validar el usuario.' });
            }

            if (existente) {
                db.run(
                    'UPDATE usuarios SET nombre = ?, password_hash = ?, rol = ?, activo = 1 WHERE email = ?',
                    [nombreFinal, hashPassword(claveFinal), rolFinal, correo],
                    function(updateError) {
                        if (updateError) {
                            return res.status(500).json({ ok: false, mensaje: 'No se pudo actualizar el usuario.' });
                        }

                        res.json({ ok: true, mensaje: 'Usuario actualizado correctamente.' });
                    }
                );

                return;
            }

            db.run(
                'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)',
                [nombreFinal, correo, hashPassword(claveFinal), rolFinal],
                function(insertError) {
                    if (insertError) {
                        return res.status(500).json({ ok: false, mensaje: 'No se pudo guardar el usuario.' });
                    }

                    res.status(201).json({ ok: true, mensaje: 'Usuario guardado correctamente.' });
                }
            );
        });
    });
});

app.get('/api/productos', (req, res) => {
    db.all(
        `SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                p.creado_en, p.actualizado_en, COALESCE(SUM(c.cantidad), 0) AS vendidos
         FROM productos p
         LEFT JOIN compras c ON c.producto_id = p.id
         WHERE p.activo = 1
         GROUP BY p.id
         ORDER BY p.actualizado_en DESC, p.id DESC`,
        [],
        (error, productos) => {
            if (error) {
                return res.status(500).json({ ok: false, mensaje: 'No se pudo cargar el catálogo.' });
            }

            res.json({ ok: true, productos });
        }
    );
});

app.get('/api/mis-productos', (req, res) => {
    validarVendedorOAdmin(req, res, (usuario) => {
        db.all(
            `SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                    p.creado_en, p.actualizado_en, p.creado_por_email, COALESCE(SUM(c.cantidad), 0) AS vendidos
             FROM productos p
             LEFT JOIN compras c ON c.producto_id = p.id
             WHERE p.activo = 1 AND p.creado_por_email = ?
             GROUP BY p.id
             ORDER BY p.actualizado_en DESC, p.id DESC`,
            [usuario.email],
            (error, productos) => {
                if (error) {
                    return res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar tus productos.' });
                }

                res.json({ ok: true, productos });
            }
        );
    });
});

app.post('/api/productos', (req, res) => {
    const { nombre, categoria, descripcion, precio, imagen_url, stock } = req.body || {};

    validarVendedorOAdmin(req, res, (usuario) => {
        const nombreFinal = String(nombre || '').trim();
        const categoriaFinal = String(categoria || '').trim() || 'General';
        const descripcionFinal = String(descripcion || '').trim();
        const precioFinal = Number(precio || 0);
        const imagenFinal = String(imagen_url || '').trim();
        const stockFinal = Math.max(0, parseInt(stock, 10) || 0);

        if (!nombreFinal || !descripcionFinal || precioFinal <= 0) {
            return res.status(400).json({ ok: false, mensaje: 'Completa nombre, descripción y precio.' });
        }

        db.run(
            `INSERT INTO productos (nombre, categoria, descripcion, precio, imagen_url, stock, creado_por_email, activo, actualizado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
            [nombreFinal, categoriaFinal, descripcionFinal, precioFinal, imagenFinal, stockFinal, usuario.email],
            function(error) {
                if (error) {
                    return res.status(500).json({ ok: false, mensaje: 'No se pudo crear el producto.' });
                }

                res.status(201).json({ ok: true, mensaje: 'Producto creado correctamente.', id: this.lastID });
            }
        );
    });
});

app.put('/api/productos/:id', (req, res) => {
    const { nombre, categoria, descripcion, precio, imagen_url, stock } = req.body || {};
    const productoId = parseInt(req.params.id, 10);

    validarVendedorOAdmin(req, res, (usuario) => {
        obtenerProductoPorId(productoId, (findError, producto) => {
            if (findError) {
                return res.status(500).json({ ok: false, mensaje: 'No se pudo validar el producto.' });
            }

            if (!producto || producto.activo !== 1) {
                return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
            }

            if (!puedeGestionarProducto(usuario, producto)) {
                return res.status(403).json({ ok: false, mensaje: 'No puedes editar este producto.' });
            }

            db.run(
                `UPDATE productos
                 SET nombre = ?, categoria = ?, descripcion = ?, precio = ?, imagen_url = ?, stock = ?, actualizado_en = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    String(nombre || '').trim(),
                    String(categoria || '').trim() || 'General',
                    String(descripcion || '').trim(),
                    Number(precio || 0),
                    String(imagen_url || '').trim(),
                    Math.max(0, parseInt(stock, 10) || 0),
                    productoId
                ],
                function(error) {
                    if (error) {
                        return res.status(500).json({ ok: false, mensaje: 'No se pudo actualizar el producto.' });
                    }

                    if (!this.changes) {
                        return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
                    }

                    res.json({ ok: true, mensaje: 'Producto actualizado correctamente.' });
                }
            );
        });
    });
});

app.delete('/api/productos/:id', (req, res) => {
    const productoId = parseInt(req.params.id, 10);

    validarVendedorOAdmin(req, res, (usuario) => {
        obtenerProductoPorId(productoId, (findError, producto) => {
            if (findError) {
                return res.status(500).json({ ok: false, mensaje: 'No se pudo validar el producto.' });
            }

            if (!producto || producto.activo !== 1) {
                return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
            }

            if (!puedeGestionarProducto(usuario, producto)) {
                return res.status(403).json({ ok: false, mensaje: 'No puedes eliminar este producto.' });
            }

            db.run(
                'UPDATE productos SET activo = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
                [productoId],
                function(error) {
                    if (error) {
                        return res.status(500).json({ ok: false, mensaje: 'No se pudo eliminar el producto.' });
                    }

                    if (!this.changes) {
                        return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
                    }

                    res.json({ ok: true, mensaje: 'Producto eliminado correctamente.' });
                }
            );
        });
    });
});

app.post('/api/compras', (req, res) => {
    const productoId = parseInt(req.body?.productoId, 10);
    const cantidad = Math.max(1, parseInt(req.body?.cantidad, 10) || 1);
    const compradorNombre = String(req.body?.nombreComprador || 'Cliente web').trim();
    const compradorEmail = String(req.body?.emailComprador || '').trim().toLowerCase();

    if (!productoId) {
        return res.status(400).json({ ok: false, mensaje: 'Producto inválido.' });
    }

    db.get('SELECT * FROM productos WHERE id = ? AND activo = 1 LIMIT 1', [productoId], (error, producto) => {
        if (error) {
            return res.status(500).json({ ok: false, mensaje: 'No se pudo validar el producto.' });
        }

        if (!producto) {
            return res.status(404).json({ ok: false, mensaje: 'El producto ya no está disponible.' });
        }

        if (producto.stock < cantidad) {
            return res.status(400).json({ ok: false, mensaje: 'No hay suficiente stock para esta compra.' });
        }

        const total = Number(producto.precio) * cantidad;

        db.serialize(() => {
            db.run(
                `INSERT INTO compras (producto_id, producto_nombre, cantidad, total, comprador_nombre, comprador_email)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [producto.id, producto.nombre, cantidad, total, compradorNombre, compradorEmail]
            );

            db.run(
                'UPDATE productos SET stock = stock - ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
                [cantidad, producto.id],
                (updateError) => {
                    if (updateError) {
                        return res.status(500).json({ ok: false, mensaje: 'No se pudo registrar la compra.' });
                    }

                    res.status(201).json({
                        ok: true,
                        mensaje: `Compra registrada: ${producto.nombre}`,
                        total
                    });
                }
            );
        });
    });
});

app.get('/api/dashboard/stats', (req, res) => {
    validarAdmin(req, res, () => {
        const respuesta = {
            ok: true,
            totalProductos: 0,
            comprasTotales: 0,
            productoMasComprado: null,
            ventasPorDia: []
        };

        db.get('SELECT COUNT(*) AS total FROM productos WHERE activo = 1', [], (errorProductos, rowProductos) => {
            if (errorProductos) {
                return res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar las métricas.' });
            }

            respuesta.totalProductos = rowProductos?.total || 0;

            db.get('SELECT COALESCE(SUM(cantidad), 0) AS comprasTotales FROM compras', [], (errorCompras, rowCompras) => {
                if (errorCompras) {
                    return res.status(500).json({ ok: false, mensaje: 'No se pudo contar las compras.' });
                }

                respuesta.comprasTotales = rowCompras?.comprasTotales || 0;

                db.get(
                    `SELECT producto_nombre, SUM(cantidad) AS total
                     FROM compras
                     GROUP BY producto_nombre
                     ORDER BY total DESC, producto_nombre ASC
                     LIMIT 1`,
                    [],
                    (errorTop, rowTop) => {
                        if (errorTop) {
                            return res.status(500).json({ ok: false, mensaje: 'No se pudo calcular el producto más comprado.' });
                        }

                        respuesta.productoMasComprado = rowTop || null;

                        db.all(
                            `SELECT strftime('%Y-%m-%d', fecha, 'localtime') AS dia, SUM(cantidad) AS total
                             FROM compras
                             WHERE datetime(fecha) >= datetime('now', '-6 days')
                             GROUP BY strftime('%Y-%m-%d', fecha, 'localtime')
                             ORDER BY dia ASC`,
                            [],
                            (errorGrafica, ventasPorDia) => {
                                if (errorGrafica) {
                                    return res.status(500).json({ ok: false, mensaje: 'No se pudo generar la gráfica.' });
                                }

                                respuesta.ventasPorDia = ventasPorDia || [];
                                res.json(respuesta);
                            }
                        );
                    }
                );
            });
        });
    });
});

app.get('/api/dashboard/mis-stats', (req, res) => {
    validarVendedorOAdmin(req, res, (usuario) => {
        const respuesta = {
            ok: true,
            totalProductos: 0,
            comprasTotales: 0,
            productoMasComprado: null,
            ventasPorDia: []
        };

        db.get(
            'SELECT COUNT(*) AS total FROM productos WHERE activo = 1 AND creado_por_email = ?',
            [usuario.email],
            (errorProductos, rowProductos) => {
                if (errorProductos) {
                    return res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar tus métricas.' });
                }

                respuesta.totalProductos = rowProductos?.total || 0;

                db.get(
                    `SELECT COALESCE(SUM(c.cantidad), 0) AS comprasTotales
                     FROM compras c
                     INNER JOIN productos p ON p.id = c.producto_id
                     WHERE p.creado_por_email = ?`,
                    [usuario.email],
                    (errorCompras, rowCompras) => {
                        if (errorCompras) {
                            return res.status(500).json({ ok: false, mensaje: 'No se pudo contar tus compras.' });
                        }

                        respuesta.comprasTotales = rowCompras?.comprasTotales || 0;

                        db.get(
                            `SELECT c.producto_nombre, SUM(c.cantidad) AS total
                             FROM compras c
                             INNER JOIN productos p ON p.id = c.producto_id
                             WHERE p.creado_por_email = ?
                             GROUP BY c.producto_nombre
                             ORDER BY total DESC, c.producto_nombre ASC
                             LIMIT 1`,
                            [usuario.email],
                            (errorTop, rowTop) => {
                                if (errorTop) {
                                    return res.status(500).json({ ok: false, mensaje: 'No se pudo calcular tu producto más comprado.' });
                                }

                                respuesta.productoMasComprado = rowTop || null;

                                db.all(
                                    `SELECT strftime('%Y-%m-%d', c.fecha, 'localtime') AS dia, SUM(c.cantidad) AS total
                                     FROM compras c
                                     INNER JOIN productos p ON p.id = c.producto_id
                                     WHERE p.creado_por_email = ?
                                       AND datetime(c.fecha) >= datetime('now', '-6 days')
                                     GROUP BY strftime('%Y-%m-%d', c.fecha, 'localtime')
                                     ORDER BY dia ASC`,
                                    [usuario.email],
                                    (errorGrafica, ventasPorDia) => {
                                        if (errorGrafica) {
                                            return res.status(500).json({ ok: false, mensaje: 'No se pudo generar tu gráfica.' });
                                        }

                                        respuesta.ventasPorDia = ventasPorDia || [];
                                        res.json(respuesta);
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

app.get('/api/kimbin-note', (req, res) => {
    db.get('SELECT mensaje, autor_email, actualizado_en FROM notas_kimbin WHERE id = 1', [], (error, nota) => {
        if (error) {
            return res.status(500).json({ ok: false, mensaje: 'No se pudo leer la nota' });
        }

        res.json({
            ok: true,
            mensaje: nota?.mensaje || mensajeInicialKimbin,
            autor: nota?.autor_email || 'sistema@merkateck.com',
            actualizadoEn: nota?.actualizado_en || null
        });
    });
});

app.post('/api/kimbin-note', (req, res) => {
    const { mensaje } = req.body || {};
    const texto = String(mensaje || '').trim();

    if (!texto) {
        return res.status(400).json({ ok: false, mensaje: 'La nota no puede estar vacía.' });
    }

    validarAdmin(req, res, (usuario) => {
        db.run(
            'UPDATE notas_kimbin SET mensaje = ?, autor_email = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1',
            [texto, usuario.email],
            function(updateError) {
                if (updateError) {
                    return res.status(500).json({ ok: false, mensaje: 'No se pudo guardar la nota.' });
                }

                res.json({ ok: true, mensaje: 'Nota guardada correctamente.' });
            }
        );
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña obligatorios' });
    }

    const correo = String(email).trim().toLowerCase();
    const clave = String(password).trim();

    if (!esEmailValido(correo)) {
        return res.status(400).json({ ok: false, mensaje: 'Ingresa un correo válido.' });
    }

    obtenerUsuarioActivo(correo, (error, usuario) => {
        if (error) {
            return res.status(500).json({ ok: false, mensaje: 'Error interno' });
        }

        if (!usuario) {
            return res.status(403).json({ ok: false, mensaje: 'Ese correo no está autorizado en la base de datos.' });
        }

        if (usuario.password_hash !== hashPassword(clave)) {
            return res.status(401).json({ ok: false, mensaje: 'Contraseña incorrecta' });
        }

        const token = crearTokenSesion();
        const expiraEn = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();

        db.run('INSERT INTO accesos (email) VALUES (?)', [correo]);

        db.run(
            'INSERT INTO sesiones (token, usuario_id, expira_en) VALUES (?, ?, ?)',
            [token, usuario.id, expiraEn],
            (sessionError) => {
                if (sessionError) {
                    return res.status(500).json({ ok: false, mensaje: 'No se pudo crear la sesión.' });
                }

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
            }
        });
    });
});

app.get('/api/session', (req, res) => {
    validarSesion(req, res, (sesion) => {
        res.json({ ok: true, usuario: sesion.usuario });
    });
});

app.post('/api/logout', (req, res) => {
    const token = obtenerTokenDesdeRequest(req);

    if (token) {
        limpiarTokenSesion(token);
    }

    res.json({ ok: true, mensaje: 'Sesión cerrada.' });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Base de datos lista en ${dbPath}`);
});
