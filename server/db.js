const { Pool } = require("pg");
require("dotenv").config();

function getPoolConfig() {
  if (process.env.DATABASE_URL) {
    const databaseUrl = new URL(process.env.DATABASE_URL);
    return {
      host: databaseUrl.hostname,
      port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
      user: decodeURIComponent(databaseUrl.username || ""),
      password: decodeURIComponent(databaseUrl.password || ""),
      database: databaseUrl.pathname.replace(/^\//, ""),
      ssl: databaseUrl.searchParams.get("sslmode") === "require"
        ? { rejectUnauthorized: false }
        : undefined
    };
  }

  if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGDATABASE) {
    throw new Error(
      "Falta configurar PostgreSQL. Define DATABASE_URL o bien PGHOST, PGUSER, PGPASSWORD y PGDATABASE en .env"
    );
  }

  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD || "",
    database: process.env.PGDATABASE
  };
}

const pool = new Pool(getPoolConfig());

module.exports = pool;
