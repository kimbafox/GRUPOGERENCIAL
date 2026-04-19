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

function crearUsuarioSiNoExiste(correo, clave = passwordBase) {
    if (!esEmailValido(correo)) {
        return;
    }

    const nombre = obtenerNombreDesdeCorreo(correo);
    const passwordHash = hashPassword(String(clave || passwordBase).trim());

    db.run(
        `INSERT OR IGNORE INTO usuarios (nombre, email, password_hash, activo) VALUES (?, ?, ?, 1)`,
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

        obtenerUsuariosSemilla().forEach((correo) => {
            crearUsuarioSiNoExiste(correo);
        });

        db.run(
            `INSERT OR IGNORE INTO notas_kimbin (id, mensaje, autor_email) VALUES (1, ?, 'sistema@merkateck.com')`,
            [mensajeInicialKimbin]
        );
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
            `UPDATE notas_kimbin SET mensaje = ?, autor_email = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1`,
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
