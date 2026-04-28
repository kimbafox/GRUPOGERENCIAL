const db = require("../db");
const QRCode = require("qrcode");

function generarCodigoMesa() {
	return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function buildPublicBaseUrl(req) {
	const forwardedProto = req.headers["x-forwarded-proto"];
	const protocol = forwardedProto || req.protocol;
	return `${protocol}://${req.get("host")}`;
}

async function enrichMesa(req, mesa) {
	const accesoUrl = mesa.qr_url?.startsWith("http")
		? mesa.qr_url
		: `${buildPublicBaseUrl(req)}${mesa.qr_url}`;

	return {
		...mesa,
		acceso_url: accesoUrl,
		qr_imagen: await QRCode.toDataURL(accesoUrl, {
			margin: 1,
			width: 240,
			color: {
				dark: "#1d2939",
				light: "#ffffff"
			}
		})
	};
	}

exports.obtenerMesas = async (_req, res) => {
	const data = await db.query("SELECT * FROM mesas ORDER BY id ASC");
	const mesas = await Promise.all(data.rows.map(mesa => enrichMesa(res.req, mesa)));
	res.json(mesas);
};

exports.obtenerMesaPorCodigo = async (req, res) => {
	const { codigo } = req.params;
	const data = await db.query(
		"SELECT * FROM mesas WHERE UPPER(codigo) = UPPER($1)",
		[codigo]
	);

	if (!data.rows[0]) {
		return res.status(404).json({ error: "Mesa no encontrada" });
	}

	res.json(await enrichMesa(req, data.rows[0]));
};

exports.crearMesa = async (req, res) => {
	const { nombre } = req.body || {};

	let codigo = generarCodigoMesa();
	let existente = await db.query("SELECT id FROM mesas WHERE codigo = $1", [codigo]);

	while (existente.rows.length > 0) {
		codigo = generarCodigoMesa();
		existente = await db.query("SELECT id FROM mesas WHERE codigo = $1", [codigo]);
	}

	const qrUrl = `/cliente.html?mesa=${codigo}`;
	const data = await db.query(
		`INSERT INTO mesas (codigo, nombre, qr_url)
		 VALUES ($1, $2, $3)
		 RETURNING *`,
		[codigo, (nombre || `Mesa ${codigo}`).trim(), qrUrl]
	);

	res.status(201).json(await enrichMesa(req, data.rows[0]));
};

exports.actualizarMesa = async (req, res) => {
	const { id } = req.params;
	const { nombre } = req.body;
	const data = await db.query(
		`UPDATE mesas
		 SET nombre = $1
		 WHERE id = $2
		 RETURNING *`,
		[nombre.trim(), id]
	);

	if (!data.rows[0]) {
		return res.status(404).json({ error: "Mesa no encontrada" });
	}

	res.json(await enrichMesa(req, data.rows[0]));
};

exports.eliminarMesa = async (req, res) => {
	const { id } = req.params;

	try {
		const data = await db.query("DELETE FROM mesas WHERE id = $1 RETURNING id", [id]);

		if (!data.rows[0]) {
			return res.status(404).json({ error: "Mesa no encontrada" });
		}

		res.json({ ok: true });
	} catch (error) {
		if (error.code === "23001" || error.code === "23503") {
			return res.status(409).json({
				error: "No se puede eliminar la mesa porque ya tiene pedidos asociados"
			});
		}

		console.error("Error al eliminar mesa", error);
		res.status(500).json({ error: "No se pudo eliminar la mesa" });
	}
};
