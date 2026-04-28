const router = require("express").Router();
const ctrl = require("../controllers/pedidosController");

router.get("/", ctrl.obtenerPedidos);
router.get("/notificaciones", ctrl.obtenerNotificaciones);
router.delete("/entregados", ctrl.limpiarPedidosEntregados);
router.post("/", ctrl.crearPedido);
router.put("/:id/estado", ctrl.actualizarEstadoPedido);
router.put("/notificaciones/:id/leida", ctrl.marcarNotificacionLeida);

module.exports = router;