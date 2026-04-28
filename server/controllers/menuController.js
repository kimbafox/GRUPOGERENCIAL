const db = require("../db");

exports.obtenerMenu = async (_req, res) => {
	const data = await db.query(
		"SELECT * FROM menu ORDER BY disponible DESC, nombre ASC"
	);
	res.json(data.rows);
};

exports.crearProducto = async (req, res) => {
	const { nombre, precio, imagen, disponible = true } = req.body;

	if (!nombre || precio === undefined) {
		return res.status(400).json({ error: "Nombre y precio son obligatorios" });
	}

	const data = await db.query(
		`INSERT INTO menu (nombre, precio, imagen, disponible)
		 VALUES ($1, $2, $3, $4)
		 RETURNING *`,
		[nombre.trim(), Number(precio), imagen || "", Boolean(disponible)]
	);

	res.status(201).json(data.rows[0]);
};

exports.actualizarProducto = async (req, res) => {
	const { id } = req.params;
	const { nombre, precio, imagen, disponible } = req.body;

	const data = await db.query(
		`UPDATE menu
		 SET nombre = $1,
				 precio = $2,
				 imagen = $3,
				 disponible = $4
		 WHERE id = $5
		 RETURNING *`,
		[nombre.trim(), Number(precio), imagen || "", Boolean(disponible), id]
	);

	if (!data.rows[0]) {
		return res.status(404).json({ error: "Producto no encontrado" });
	}

	res.json(data.rows[0]);
};

exports.eliminarProducto = async (req, res) => {
	const { id } = req.params;
	const data = await db.query("DELETE FROM menu WHERE id = $1 RETURNING id", [id]);

	if (!data.rows[0]) {
		return res.status(404).json({ error: "Producto no encontrado" });
	}

	res.json({ ok: true });
};
