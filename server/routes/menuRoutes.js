const router = require("express").Router();
const ctrl = require("../controllers/menuController");

router.get("/", ctrl.obtenerMenu);
router.post("/", ctrl.crearProducto);
router.put("/:id", ctrl.actualizarProducto);
router.delete("/:id", ctrl.eliminarProducto);

module.exports = router;