const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Rutas
app.use("/mesas", require("./routes/mesasRoutes"));
app.use("/menu", require("./routes/menuRoutes"));
app.use("/pedidos", require("./routes/pedidosRoutes"));

// Crear tablas si no existen
async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mesas (
      id SERIAL PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT,
      qr_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS menu (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      precio NUMERIC(10,2) NOT NULL,
      imagen TEXT,
      disponible BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      mesa_id INTEGER REFERENCES mesas(id) ON DELETE RESTRICT,
      estado TEXT DEFAULT 'pendiente',
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS detalle_pedido (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
      producto_id INTEGER REFERENCES menu(id) ON DELETE RESTRICT,
      cantidad INTEGER NOT NULL CHECK (cantidad > 0)
    );

    CREATE TABLE IF NOT EXISTS notificaciones (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
      mensaje TEXT NOT NULL,
      leida BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    ALTER TABLE mesas ADD COLUMN IF NOT EXISTS nombre TEXT;
    ALTER TABLE mesas ADD COLUMN IF NOT EXISTS qr_url TEXT;
    ALTER TABLE mesas ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE menu ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT TRUE;
    ALTER TABLE menu ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE pedidos
    ADD CONSTRAINT pedidos_estado_check
    CHECK (estado IN ('pendiente', 'en preparación', 'listo', 'entregado'));
  `).catch(async error => {
    if (error.code !== "42710") {
      throw error;
    }
  });

  await db.query(
    `INSERT INTO mesas (codigo, nombre, qr_url)
     VALUES
       ('MESA1', 'Mesa', '/cliente.html?mesa=MESA1'),
       ('MESA2', 'Mesa 2', '/cliente.html?mesa=MESA2')
     ON CONFLICT (codigo) DO NOTHING`
  );
}

initDB().catch(error => {
  console.error("No se pudo inicializar la base de datos", error);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});