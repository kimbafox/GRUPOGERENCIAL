const db = require("../db");

const ESTADOS = ["pendiente", "en preparación", "listo", "entregado"];

async function eliminarPedidoEntregado(client, pedidoId) {
  const notificationsResult = await client.query(
    "SELECT COUNT(*)::int AS total FROM notificaciones WHERE pedido_id = $1",
    [pedidoId]
  );
  const deletedNotifications = notificationsResult.rows[0]?.total || 0;

  const deletedOrder = await client.query(
    `DELETE FROM pedidos
     WHERE id = $1 AND estado = 'entregado'
     RETURNING id`,
    [pedidoId]
  );

  return {
    deleted: Boolean(deletedOrder.rows[0]),
    deletedNotifications
  };
}

exports.crearPedido = async (req, res) => {
  const { mesa, carrito } = req.body;

  if (!mesa || !Array.isArray(carrito) || carrito.length === 0) {
    return res.status(400).json({ error: "Mesa y carrito son obligatorios" });
  }

  const mesaData = await db.query(
    "SELECT * FROM mesas WHERE UPPER(codigo) = UPPER($1)",
    [mesa]
  );

  const mesaRow = mesaData.rows[0];
  if (!mesaRow) {
    return res.status(404).json({ error: "Mesa no encontrada" });
  }

  const pedido = await db.query(
    "INSERT INTO pedidos (mesa_id) VALUES ($1) RETURNING *",
    [mesaRow.id]
  );

  for (const item of carrito) {
    await db.query(
      "INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad) VALUES ($1,$2,$3)",
      [pedido.rows[0].id, item.producto_id, item.cantidad]
    );
  }

  await db.query(
    `INSERT INTO notificaciones (pedido_id, mensaje)
     VALUES ($1, $2)`,
    [pedido.rows[0].id, `Nuevo pedido de ${mesaRow.nombre || mesaRow.codigo}`]
  );

  res.status(201).json({ ok: true, pedido: pedido.rows[0] });
};

exports.obtenerPedidos = async (req, res) => {
  const { estado } = req.query;
  const params = [];
  let where = "";

  if (estado) {
    where = "WHERE p.estado = $1";
    params.push(estado);
  }

  const data = await db.query(
    `SELECT
       p.id,
       p.estado,
       p.fecha,
       m.id AS mesa_id,
       m.codigo AS mesa_codigo,
       m.nombre AS mesa_nombre,
       COALESCE(
         json_agg(
           json_build_object(
             'producto_id', mn.id,
             'nombre', mn.nombre,
             'precio', mn.precio,
             'imagen', mn.imagen,
             'cantidad', dp.cantidad,
             'subtotal', dp.cantidad * mn.precio
           )
         ) FILTER (WHERE mn.id IS NOT NULL),
         '[]'::json
       ) AS productos
     FROM pedidos p
     JOIN mesas m ON m.id = p.mesa_id
     LEFT JOIN detalle_pedido dp ON dp.pedido_id = p.id
     LEFT JOIN menu mn ON mn.id = dp.producto_id
     ${where}
     GROUP BY p.id, m.id
     ORDER BY p.fecha ASC`,
    params
  );

  res.json(data.rows);
};

exports.actualizarEstadoPedido = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: "Estado no válido" });
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const data = await client.query(
      `UPDATE pedidos
       SET estado = $1
       WHERE id = $2
       RETURNING *`,
      [estado, id]
    );

    if (!data.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    if (estado === "entregado") {
      const deletedResult = await eliminarPedidoEntregado(client, id);
      await client.query("COMMIT");

      return res.json({
        deleted: deletedResult.deleted,
        pedidoId: Number(id),
        deletedNotifications: deletedResult.deletedNotifications,
        message: "Pedido entregado eliminado junto con sus notificaciones"
      });
    }

    await client.query("COMMIT");
    return res.json(data.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

exports.limpiarPedidosEntregados = async (_req, res) => {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const pedidos = await client.query(
      `SELECT id
       FROM pedidos
       WHERE estado = 'entregado'`
    );

    let removedOrders = 0;
    let removedNotifications = 0;

    for (const pedido of pedidos.rows) {
      const result = await eliminarPedidoEntregado(client, pedido.id);
      if (result.deleted) {
        removedOrders += 1;
        removedNotifications += result.deletedNotifications;
      }
    }

    await client.query("COMMIT");
    res.json({ removedOrders, removedNotifications });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

exports.obtenerNotificaciones = async (_req, res) => {
  const data = await db.query(
    `SELECT n.*, p.estado, m.codigo AS mesa_codigo, m.nombre AS mesa_nombre
     FROM notificaciones n
     JOIN pedidos p ON p.id = n.pedido_id
     JOIN mesas m ON m.id = p.mesa_id
     ORDER BY n.created_at DESC`
  );
  res.json(data.rows);
};

exports.marcarNotificacionLeida = async (req, res) => {
  const { id } = req.params;
  const data = await db.query(
    `UPDATE notificaciones
     SET leida = TRUE
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  if (!data.rows[0]) {
    return res.status(404).json({ error: "Notificación no encontrada" });
  }

  res.json(data.rows[0]);
};