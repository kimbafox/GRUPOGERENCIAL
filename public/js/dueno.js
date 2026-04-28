const API = "";
const estados = ["pendiente", "en preparación", "listo", "entregado"];

const menuForm = document.getElementById("menu-form");
const menuResetBtn = document.getElementById("menu-reset");
const mesaForm = document.getElementById("mesa-form");
const banner = document.getElementById("pedido-banner");
const qrToggleBtn = document.getElementById("toggle-qr-btn");
const qrGaleriaWrap = document.getElementById("qr-galeria-wrap");

let notificationBaselineLoaded = false;
let notificationIdsSeen = new Set();
let bannerTimeoutId;
let panelBootstrapped = false;

function formatoMonto(valor) {
  return `Bs ${Number(valor).toFixed(2)}`;
}

async function cargarMenuAdmin() {
  const res = await fetch(API + "/menu");
  const data = await res.json();
  const cont = document.getElementById("menu-admin");

  cont.innerHTML = data.length
    ? data.map(producto => `
      <article class="admin-item">
        <div>
          <strong>${producto.nombre}</strong>
          <p>${formatoMonto(producto.precio)} · ${producto.disponible ? "Disponible" : "Oculto"}</p>
        </div>
        <div class="inline-actions">
          <button type="button" onclick='editarProducto(${JSON.stringify({
            id: producto.id,
            nombre: producto.nombre,
            precio: producto.precio,
            imagen: producto.imagen || "",
            disponible: producto.disponible
          }).replace(/'/g, "&#39;")})'>Editar</button>
          <button type="button" class="secondary-btn" onclick="eliminarProducto(${producto.id})">Eliminar</button>
        </div>
      </article>
    `).join("")
    : '<p class="empty-state">No hay productos registrados.</p>';
}

async function guardarProducto(event) {
  event.preventDefault();

  const id = document.getElementById("producto-id").value;
  const payload = {
    nombre: document.getElementById("producto-nombre").value,
    precio: document.getElementById("producto-precio").value,
    imagen: document.getElementById("producto-imagen").value,
    disponible: document.getElementById("producto-disponible").checked
  };

  await fetch(id ? `${API}/menu/${id}` : `${API}/menu`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  menuForm.reset();
  document.getElementById("producto-id").value = "";
  document.getElementById("producto-disponible").checked = true;
  cargarMenuAdmin();
}

function editarProducto(producto) {
  document.getElementById("producto-id").value = producto.id;
  document.getElementById("producto-nombre").value = producto.nombre;
  document.getElementById("producto-precio").value = producto.precio;
  document.getElementById("producto-imagen").value = producto.imagen;
  document.getElementById("producto-disponible").checked = producto.disponible;
}

async function eliminarProducto(id) {
  await fetch(`${API}/menu/${id}`, { method: "DELETE" });
  cargarMenuAdmin();
}

async function cargarMesas() {
  const res = await fetch(API + "/mesas");
  const data = await res.json();
  const cont = document.getElementById("mesas");
  const qrGaleria = document.getElementById("qr-galeria");

  cont.innerHTML = data.length
    ? data.map(mesa => `
      <article class="admin-item">
        <div class="mesa-info-block">
          <strong>${mesa.nombre || mesa.codigo}</strong>
          <p>Codigo ${mesa.codigo}</p>
          <a href="${mesa.acceso_url}" target="_blank" rel="noreferrer">Abrir menu</a>
          <a href="${mesa.qr_imagen}" download="mesa-${mesa.codigo}.png">Descargar QR</a>
        </div>
        <div class="mesa-qr-preview">
          <img src="${mesa.qr_imagen}" alt="QR mesa ${mesa.codigo}">
        </div>
        <div class="inline-actions">
          <button type="button" onclick="renombrarMesa(${mesa.id}, '${(mesa.nombre || "").replace(/'/g, "&#39;")}')">Renombrar</button>
          <button type="button" class="secondary-btn" onclick="eliminarMesa(${mesa.id})">Eliminar</button>
        </div>
      </article>
    `).join("")
    : '<p class="empty-state">No hay mesas creadas.</p>';

  qrGaleria.innerHTML = data.length
    ? data.map(mesa => `
      <article class="qr-card">
        <img src="${mesa.qr_imagen}" alt="QR visible de ${mesa.nombre || mesa.codigo}">
        <div class="qr-card-body">
          <strong>${mesa.nombre || mesa.codigo}</strong>
          <p>Codigo ${mesa.codigo}</p>
          <a href="${mesa.acceso_url}" target="_blank" rel="noreferrer">Abrir menu</a>
        </div>
      </article>
    `).join("")
    : '<p class="empty-state">Aun no hay QR para mostrar.</p>';
}

async function crearMesa(event) {
  event.preventDefault();
  const nombre = document.getElementById("mesa-nombre").value;

  await fetch(API + "/mesas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre })
  });

  mesaForm.reset();
  cargarMesas();
}

async function renombrarMesa(id, nombreActual) {
  const nombre = window.prompt("Nuevo nombre de mesa", nombreActual);
  if (!nombre) {
    return;
  }

  await fetch(`${API}/mesas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre })
  });

  cargarMesas();
}

async function eliminarMesa(id) {
  const res = await fetch(`${API}/mesas/${id}`, { method: "DELETE" });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    window.alert(data.error || "No se pudo eliminar la mesa");
    return;
  }

  cargarMesas();
}

async function verPedidos() {
  const res = await fetch(API + "/pedidos");
  const data = await res.json();

  const cont = document.getElementById("pedidos");

  cont.innerHTML = data.length
    ? data.map(pedido => {
      const total = pedido.productos.reduce((suma, item) => suma + Number(item.subtotal), 0);
      const opciones = estados
        .map(estado => `<option value="${estado}" ${pedido.estado === estado ? "selected" : ""}>${estado}</option>`)
        .join("");

      return `
        <article class="order-card ${pedido.estado.replace(/\s+/g, '-')}">
          <div class="order-head">
            <div>
              <p class="eyebrow">${pedido.mesa_nombre || pedido.mesa_codigo}</p>
              <h3>Pedido #${pedido.id}</h3>
            </div>
            <select onchange="actualizarEstado(${pedido.id}, this.value)">${opciones}</select>
          </div>
          <div class="order-items">
            ${pedido.productos.map(item => `
              <div class="order-item-row">
                <span>${item.cantidad} x ${item.nombre}</span>
                <strong>${formatoMonto(item.subtotal)}</strong>
              </div>
            `).join("")}
          </div>
          <div class="order-foot">
            <span>${new Date(pedido.fecha).toLocaleString()}</span>
            <strong>${formatoMonto(total)}</strong>
          </div>
        </article>
      `;
    }).join("")
    : '<p class="empty-state">No hay pedidos registrados.</p>';
}

async function limpiarPedidosEntregadosSilencioso() {
  const res = await fetch(`${API}/pedidos/entregados`, { method: "DELETE" });

  if (!res.ok) {
    return { removedOrders: 0, removedNotifications: 0 };
  }

  return res.json();
}

async function actualizarEstado(id, estado) {
  if (estado === "entregado") {
    const confirmar = window.confirm("Este pedido se marcara como entregado y se borrara junto con su notificacion. Deseas continuar?");
    if (!confirmar) {
      verPedidos();
      return;
    }
  }

  const res = await fetch(`${API}/pedidos/${id}/estado`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    window.alert(data.error || "No se pudo actualizar el pedido");
    verPedidos();
    return;
  }

  const data = await res.json();

  if (data.deleted) {
    const mensaje = `Pedido #${data.pedidoId} eliminado. Se borraron ${data.deletedNotifications} notificaciones.`;
    mostrarBanner(mensaje);
    mostrarNotificacionSistema("Pedido cerrado", mensaje);
  }

  verPedidos();
  cargarNotificaciones();
}

async function cargarNotificaciones() {
  const res = await fetch(`${API}/pedidos/notificaciones`);
  const data = await res.json();
  const cont = document.getElementById("notificaciones");
  const unreadNotifications = data.filter(item => !item.leida);
  const unreadIds = new Set(unreadNotifications.map(item => item.id));

  if (!notificationBaselineLoaded) {
    notificationIdsSeen = unreadIds;
    notificationBaselineLoaded = true;
  } else {
    const nuevas = unreadNotifications.filter(item => !notificationIdsSeen.has(item.id));

    if (nuevas.length > 0) {
      alertarNuevoPedido(nuevas[0], nuevas.length);
    }

    notificationIdsSeen = unreadIds;
  }

  cont.innerHTML = data.length
    ? data.map(item => `
      <article class="notification-item ${item.leida ? 'read' : 'unread'}">
        <div>
          <strong>${item.mensaje}</strong>
          <p>${item.mesa_nombre || item.mesa_codigo} · ${item.estado}</p>
          <span>${new Date(item.created_at).toLocaleString()}</span>
        </div>
        ${item.leida ? '' : `<button type="button" class="secondary-btn" onclick="marcarLeida(${item.id})">Marcar leida</button>`}
      </article>
    `).join("")
    : '<p class="empty-state">Sin notificaciones por ahora.</p>';
}

async function marcarLeida(id) {
  await fetch(`${API}/pedidos/notificaciones/${id}/leida`, { method: "PUT" });
  cargarNotificaciones();
}

function mostrarBanner(mensaje) {
  banner.textContent = mensaje;
  banner.classList.remove("hidden");
  banner.classList.add("visible");

  if (bannerTimeoutId) {
    window.clearTimeout(bannerTimeoutId);
  }

  bannerTimeoutId = window.setTimeout(() => {
    banner.classList.remove("visible");
    banner.classList.add("hidden");
  }, 5000);
}

function sonarTimbre() {
  const AudioContextRef = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextRef) {
    return;
  }

  const context = new AudioContextRef();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(660, now + 0.12);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.45);
  oscillator.onended = () => context.close();
}

async function mostrarNotificacionSistema(titulo, cuerpo) {
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission === "granted") {
    new Notification(titulo, { body: cuerpo });
  }
}

function alertarNuevoPedido(notificacion, cantidad) {
  const mesa = notificacion.mesa_nombre || notificacion.mesa_codigo;
  const mensaje = cantidad > 1
    ? `Llegaron ${cantidad} pedidos nuevos. Revisa la cola.`
    : `Nuevo pedido recibido para ${mesa}.`;

  mostrarBanner(mensaje);
  sonarTimbre();
  mostrarNotificacionSistema("Nuevo pedido", mensaje);
}

function toggleQrGaleria() {
  const expandido = qrToggleBtn.getAttribute("aria-expanded") === "true";
  const siguienteEstado = !expandido;

  qrToggleBtn.setAttribute("aria-expanded", String(siguienteEstado));
  qrToggleBtn.textContent = siguienteEstado ? "Ocultar QR" : "Mostrar QR";
  qrGaleriaWrap.classList.toggle("hidden", !siguienteEstado);
}

async function iniciarPanel() {
  if (!panelBootstrapped) {
    panelBootstrapped = true;
    document.getElementById("pedidos").innerHTML = '<p class="empty-state">Cargando pedidos...</p>';
    document.getElementById("notificaciones").innerHTML = '<p class="empty-state">Cargando notificaciones...</p>';
  }

  const cleanup = await limpiarPedidosEntregadosSilencioso();

  if (cleanup.removedOrders > 0) {
    mostrarBanner(`Se limpiaron ${cleanup.removedOrders} pedidos entregados y ${cleanup.removedNotifications} notificaciones.`);
  }

  await Promise.all([verPedidos(), cargarNotificaciones()]);

  window.setTimeout(() => {
    void cargarMenuAdmin();
    void cargarMesas();
  }, 0);
}

menuForm.addEventListener("submit", guardarProducto);
menuResetBtn.addEventListener("click", () => {
  menuForm.reset();
  document.getElementById("producto-id").value = "";
  document.getElementById("producto-disponible").checked = true;
});
mesaForm.addEventListener("submit", crearMesa);

window.editarProducto = editarProducto;
window.eliminarProducto = eliminarProducto;
window.renombrarMesa = renombrarMesa;
window.eliminarMesa = eliminarMesa;
window.actualizarEstado = actualizarEstado;
window.marcarLeida = marcarLeida;

qrToggleBtn.addEventListener("click", toggleQrGaleria);

void iniciarPanel();
setInterval(() => {
  void Promise.all([verPedidos(), cargarNotificaciones()]);
}, 5000);