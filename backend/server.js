const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'usuarios.db');

const correosPermitidos = [
    'kimba@coso.com',
    'guty@coso.com',
    'aylen@coso.com',
    'brayan@coso.com',
    'luz@coso.com',
    'vicha@coso.com'
];
const passwordBase = 'kimbamipapi';
const mensajeInicialKimbin = 'Escribe aquí la nota de KIMBIN desde el panel de administración.';

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

function hashPassword(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function obtenerNombreDesdeCorreo(correo) {
    return String(correo).split('@')[0];
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

        const stmt = db.prepare(`
            INSERT OR IGNORE INTO usuarios (nombre, email, password_hash, activo)
            VALUES (?, ?, ?, 1)
        `);

        correosPermitidos.forEach((correo) => {
            stmt.run(obtenerNombreDesdeCorreo(correo), correo, hashPassword(passwordBase));
        });

        stmt.finalize();

        db.run(
            `INSERT OR IGNORE INTO notas_kimbin (id, mensaje, autor_email) VALUES (1, ?, 'sistema@coso.com')`,
            [mensajeInicialKimbin]
        );
    });
}

inicializarBaseDeDatos();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/KIMBIN', express.static(path.join(__dirname, '..', 'KIMBIN')));

app.get('/api/health', (req, res) => {
    db.get('SELECT COUNT(*) AS total FROM usuarios', [], (error, row) => {
        if (error) {
            return res.status(500).json({ ok: false, mensaje: 'Error al leer la base de datos' });
        }

        res.json({
            ok: true,
            mensaje: 'Servidor activo',
            totalUsuarios: row.total,
            correosPermitidos
        });
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
            autor: nota?.autor_email || 'sistema@coso.com',
            actualizadoEn: nota?.actualizado_en || null
        });
    });
});

app.post('/api/kimbin-note', (req, res) => {
    const { mensaje, email } = req.body || {};
    const correo = String(email || '').trim().toLowerCase();
    const texto = String(mensaje || '').trim();

    if (!correosPermitidos.includes(correo)) {
        return res.status(403).json({ ok: false, mensaje: 'Solo usuarios permitidos pueden guardar notas.' });
    }

    if (!texto) {
        return res.status(400).json({ ok: false, mensaje: 'La nota no puede estar vacía.' });
    }

    db.run(
        `UPDATE notas_kimbin SET mensaje = ?, autor_email = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1`,
        [texto, correo],
        function(error) {
            if (error) {
                return res.status(500).json({ ok: false, mensaje: 'No se pudo guardar la nota.' });
            }

            res.json({ ok: true, mensaje: 'Nota guardada correctamente.' });
        }
    );
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña obligatorios' });
    }

    const correo = String(email).trim().toLowerCase();
    const clave = String(password).trim();
    const correoValido = /^[a-z]+@coso\.com$/.test(correo);

    if (!correoValido || !correosPermitidos.includes(correo)) {
        return res.status(403).json({ ok: false, mensaje: 'Solo se permiten los correos autorizados.' });
    }

    db.get(
        'SELECT id, nombre, email, password_hash, activo FROM usuarios WHERE email = ? LIMIT 1',
        [correo],
        (error, usuario) => {
            if (error) {
                return res.status(500).json({ ok: false, mensaje: 'Error interno' });
            }

            if (!usuario || usuario.activo !== 1) {
                return res.status(403).json({ ok: false, mensaje: 'Usuario no permitido' });
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
        }
    );
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Base de datos lista en ${dbPath}`);
});
