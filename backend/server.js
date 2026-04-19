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
const catalogoSemilla = [
    {
        nombre: 'Plan Marketing Digital',
        categoria: 'Marketing',
        descripcion: 'Impulsa tus ventas con campañas, diseño visual y acompañamiento comercial para tu marca.',
        precio: 120000,
        imagen_url: 'assets/TU%20MEJOR%20OPCIONES.png',
        stock: 20
    },
    {
        nombre: 'Diseño Corporativo',
        categoria: 'Branding',
        descripcion: 'Creamos piezas gráficas, identidad visual y presencia profesional para tu empresa.',
        precio: 95000,
        imagen_url: 'assets/QUIENES.png',
        stock: 15
    },
    {
        nombre: 'Gestión de Cuentas',
        categoria: 'Administración',
        descripcion: 'Organiza clientes, pagos y seguimiento comercial con una solución rápida y clara.',
        precio: 78000,
        imagen_url: 'assets/CUENTA.png',
        stock: 30
    },
    {
        nombre: 'Campaña Premium',
        categoria: 'Ventas',
        descripcion: 'Servicio integral para destacar productos, mejorar conversiones y mantener flujo de ventas diario.',
        precio: 160000,
        imagen_url: 'assets/ALGUN%20DIA.png',
        stock: 12
    }
];

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

function crearUsuarioSiNoExiste(correo, clave = passwordBase) {
    if (!esEmailValido(correo)) {
        return;
    }

    const nombre = obtenerNombreDesdeCorreo(correo);
    const passwordHash = hashPassword(String(clave || passwordBase).trim());

    db.run(
        'INSERT OR IGNORE INTO usuarios (nombre, email, password_hash, activo) VALUES (?, ?, ?, 1)',
        [nombre, correo, passwordHash]
    );

    db.run(
        'UPDATE usuarios SET nombre = ?, password_hash = ?, activo = 1 WHERE email = ?',
        [nombre, passwordHash, correo]
    );
}

function obtenerUsuarioActivo(correo, callback) {
    db.get(
        'SELECT id, nombre, email, password_hash, activo FROM usuarios WHERE email = ? AND activo = 1 LIMIT 1',
        [correo],
        callback
    );
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

        if (!usuario) {
            return res.status(403).json({ ok: false, mensaje: 'Tu correo no tiene permisos para administrar.' });
        }

        callback(usuario);
    });
}

function sembrarProductosSiHaceFalta() {
    db.get('SELECT COUNT(*) AS total FROM productos', [], (error, row) => {
        if (error || (row?.total || 0) > 0) {
            return;
        }

        catalogoSemilla.forEach((producto) => {
            db.run(
                `INSERT INTO productos (nombre, categoria, descripcion, precio, imagen_url, stock, activo)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [
                    producto.nombre,
                    producto.categoria,
                    producto.descripcion,
                    producto.precio,
                    producto.imagen_url,
                    producto.stock
                ]
            );
        });
    });
}

function inicializarBaseDeDatos() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                activo INTEGER NOT NULL DEFAULT 1,
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

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
                activo INTEGER NOT NULL DEFAULT 1,
                creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

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

        obtenerUsuariosSemilla().forEach((correo) => {
            crearUsuarioSiNoExiste(correo);
        });

        db.run(
            'INSERT OR IGNORE INTO notas_kimbin (id, mensaje, autor_email) VALUES (1, ?, ?)',
            [mensajeInicialKimbin, 'sistema@merkateck.com']
        );

        sembrarProductosSiHaceFalta();
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
    db.all(
        'SELECT id, nombre, email, activo, creado_en FROM usuarios ORDER BY creado_en DESC, email ASC',
        [],
        (error, usuarios) => {
            if (error) {
                return res.status(500).json({ ok: false, mensaje: 'No se pudo listar los usuarios.' });
            }

            res.json({ ok: true, usuarios });
        }
    );
});

app.post('/api/usuarios', (req, res) => {
    const { email, nombre, password } = req.body || {};
    const correo = String(email || '').trim().toLowerCase();
    const nombreFinal = String(nombre || '').trim() || obtenerNombreDesdeCorreo(correo);
    const claveFinal = String(password || '').trim() || passwordBase;

    if (!esEmailValido(correo)) {
        return res.status(400).json({ ok: false, mensaje: 'Ingresa un correo válido.' });
    }

    db.get('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [correo], (error, existente) => {
        if (error) {
            return res.status(500).json({ ok: false, mensaje: 'No se pudo validar el usuario.' });
        }

        if (existente) {
            db.run(
                'UPDATE usuarios SET nombre = ?, password_hash = ?, activo = 1 WHERE email = ?',
                [nombreFinal, hashPassword(claveFinal), correo],
                function(updateError) {
                    if (updateError) {
                        return res.status(500).json({ ok: false, mensaje: 'No se pudo actualizar el usuario.' });
                    }

                    res.json({ ok: true, mensaje: 'Correo actualizado en la base de datos.' });
                }
            );

            return;
        }

        db.run(
            'INSERT INTO usuarios (nombre, email, password_hash, activo) VALUES (?, ?, ?, 1)',
            [nombreFinal, correo, hashPassword(claveFinal)],
            function(insertError) {
                if (insertError) {
                    return res.status(500).json({ ok: false, mensaje: 'No se pudo guardar el correo.' });
                }

                res.status(201).json({ ok: true, mensaje: 'Correo autorizado guardado correctamente.' });
            }
        );
    });
});

app.get('/api/productos', (req, res) => {
    db.all(
        `SELECT p.id, p.nombre, p.categoria, p.descripcion, p.precio, p.imagen_url, p.stock, p.activo,
                p.creado_en, p.actualizado_en, COALESCE(SUM(v.cantidad), 0) AS vendidos
         FROM productos p
         LEFT JOIN ventas v ON v.producto_id = p.id
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

app.post('/api/productos', (req, res) => {
    const { nombre, categoria, descripcion, precio, imagen_url, stock, adminEmail } = req.body || {};

    validarAdminPorCorreo(adminEmail, res, () => {
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
            `INSERT INTO productos (nombre, categoria, descripcion, precio, imagen_url, stock, activo, actualizado_en)
             VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
            [nombreFinal, categoriaFinal, descripcionFinal, precioFinal, imagenFinal, stockFinal],
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
    const { nombre, categoria, descripcion, precio, imagen_url, stock, adminEmail } = req.body || {};
    const productoId = parseInt(req.params.id, 10);

    validarAdminPorCorreo(adminEmail, res, () => {
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

app.delete('/api/productos/:id', (req, res) => {
    const productoId = parseInt(req.params.id, 10);
    const adminEmail = req.query.adminEmail || req.headers['x-admin-email'];

    validarAdminPorCorreo(adminEmail, res, () => {
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
                `INSERT INTO ventas (producto_id, producto_nombre, cantidad, total, comprador_nombre, comprador_email)
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
    const respuesta = {
        ok: true,
        totalProductos: 0,
        ventasHoy: 0,
        ingresosHoy: 0,
        ventasPorDia: [],
        ventasRecientes: []
    };

    db.get('SELECT COUNT(*) AS total FROM productos WHERE activo = 1', [], (errorProductos, rowProductos) => {
        if (errorProductos) {
            return res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar las métricas.' });
        }

        respuesta.totalProductos = rowProductos?.total || 0;

        db.get(
            `SELECT COUNT(*) AS ventasHoy, COALESCE(SUM(total), 0) AS ingresosHoy
             FROM ventas
             WHERE date(fecha, 'localtime') = date('now', 'localtime')`,
            [],
            (errorVentasHoy, rowVentasHoy) => {
                if (errorVentasHoy) {
                    return res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar las ventas del día.' });
                }

                respuesta.ventasHoy = rowVentasHoy?.ventasHoy || 0;
                respuesta.ingresosHoy = rowVentasHoy?.ingresosHoy || 0;

                db.all(
                    `SELECT strftime('%Y-%m-%d', fecha, 'localtime') AS dia, SUM(cantidad) AS total
                     FROM ventas
                     WHERE datetime(fecha) >= datetime('now', '-6 days')
                     GROUP BY strftime('%Y-%m-%d', fecha, 'localtime')
                     ORDER BY dia ASC`,
                    [],
                    (errorGrafica, ventasPorDia) => {
                        if (errorGrafica) {
                            return res.status(500).json({ ok: false, mensaje: 'No se pudo generar la gráfica.' });
                        }

                        respuesta.ventasPorDia = ventasPorDia || [];

                        db.all(
                            `SELECT producto_nombre, cantidad, total, comprador_nombre, fecha
                             FROM ventas
                             ORDER BY datetime(fecha) DESC
                             LIMIT 8`,
                            [],
                            (errorRecientes, ventasRecientes) => {
                                if (errorRecientes) {
                                    return res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar las ventas recientes.' });
                                }

                                respuesta.ventasRecientes = ventasRecientes || [];
                                res.json(respuesta);
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
    const { mensaje, email } = req.body || {};
    const correo = String(email || '').trim().toLowerCase();
    const texto = String(mensaje || '').trim();

    if (!texto) {
        return res.status(400).json({ ok: false, mensaje: 'La nota no puede estar vacía.' });
    }

    obtenerUsuarioActivo(correo, (error, usuario) => {
        if (error) {
            return res.status(500).json({ ok: false, mensaje: 'No se pudo validar el usuario.' });
        }

        if (!usuario) {
            return res.status(403).json({ ok: false, mensaje: 'Solo usuarios autorizados pueden guardar notas.' });
        }

        db.run(
            'UPDATE notas_kimbin SET mensaje = ?, autor_email = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1',
            [texto, correo],
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

        db.run('INSERT INTO accesos (email) VALUES (?)', [correo]);

        res.json({
            ok: true,
            mensaje: 'Acceso correcto',
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email
            }
        });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Base de datos lista en ${dbPath}`);
});
