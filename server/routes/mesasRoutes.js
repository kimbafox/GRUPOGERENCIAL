const router = require("express").Router();
const ctrl = require("../controllers/mesasController");

router.post("/", ctrl.crearMesa);
router.get("/", ctrl.obtenerMesas);
router.get("/codigo/:codigo", ctrl.obtenerMesaPorCodigo);
router.put("/:id", ctrl.actualizarMesa);
router.delete("/:id", ctrl.eliminarMesa);

module.exports = router;