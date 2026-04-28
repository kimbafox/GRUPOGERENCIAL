const API = "";

const mesaCodigo = new URLSearchParams(location.search).get("mesa");
const menuCont = document.getElementById("menu");
const carritoCont = document.getElementById("carrito");
const totalEl = document.getElementById("total");
const estadoEl = document.getElementById("pedido-status");
const mesaTitulo = document.getElementById("mesa-titulo");
const mesaSubtitulo = document.getElementById("mesa-subtitulo");
const pedirBtn = document.getElementById("pedir-btn");

let menu = [];
let carrito = [];

function formatoMonto(valor) {
  return `Bs ${Number(valor).toFixed(2)}`;
}

function totalCarrito() {
  return carrito.reduce((acumulado, item) => {
    const producto = menu.find(product => product.id === item.producto_id);
    return acumulado + (producto ? Number(producto.precio) * item.cantidad : 0);
  }, 0);
}

function renderCarrito() {
  if (carrito.length === 0) {
    carritoCont.innerHTML = '<p class="empty-state">Todavia no agregaste productos.</p>';
    totalEl.textContent = formatoMonto(0);
    pedirBtn.disabled = true;
    return;
  }

  carritoCont.innerHTML = carrito
    .map(item => {
      const producto = menu.find(product => product.id === item.producto_id);
      const subtotal = producto ? Number(producto.precio) * item.cantidad : 0;

      return `
        <article class="cart-item">
          <div>
            <strong>${producto?.nombre || "Producto"}</strong>
            <p>${item.cantidad} x ${formatoMonto(producto?.precio || 0)}</p>
          </div>
          <div class="qty-controls">
            <button type="button" onclick="cambiarCantidad(${item.producto_id}, -1)">-</button>
            <span>${item.cantidad}</span>
            <button type="button" onclick="cambiarCantidad(${item.producto_id}, 1)">+</button>
          </div>
          <strong>${formatoMonto(subtotal)}</strong>
        </article>
      `;
    })
    .join("");

  totalEl.textContent = formatoMonto(totalCarrito());
  pedirBtn.disabled = false;
}

function renderMenu() {
  const disponibles = menu.filter(producto => producto.disponible);

  if (disponibles.length === 0) {
    menuCont.innerHTML = '<p class="empty-state">No hay productos disponibles por ahora.</p>';
    return;
  }

  menuCont.innerHTML = disponibles
    .map(producto => `
      <article class="menu-card">
        <img src="${producto.imagen || 'img/logo.png'}" alt="${producto.nombre}">
        <div class="menu-card-body">
          <div>
            <h3>${producto.nombre}</h3>
            <p>${formatoMonto(producto.precio)}</p>
          </div>
          <button type="button" onclick="agregar(${producto.id})">Agregar</button>
        </div>
      </article>
    `)
    .join("");
}

async function cargarMenu() {
  const res = await fetch(API + "/menu");
  menu = await res.json();
  renderMenu();
}

function agregar(id) {
  const existente = carrito.find(item => item.producto_id === id);

  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({ producto_id: id, cantidad: 1 });
  }

  estadoEl.textContent = "";
  renderCarrito();
}

function cambiarCantidad(id, delta) {
  carrito = carrito
    .map(item => item.producto_id === id ? { ...item, cantidad: item.cantidad + delta } : item)
    .filter(item => item.cantidad > 0);

  renderCarrito();
}

async function cargarMesa() {
  if (!mesaCodigo) {
    mesaTitulo.textContent = "Mesa no encontrada";
    mesaSubtitulo.textContent = "Vuelve al inicio e ingresa un codigo valido.";
    pedirBtn.disabled = true;
    return;
  }

  const res = await fetch(`${API}/mesas/codigo/${encodeURIComponent(mesaCodigo)}`);
  if (!res.ok) {
    mesaTitulo.textContent = "Mesa no encontrada";
    mesaSubtitulo.textContent = "El codigo recibido no existe en el sistema.";
    pedirBtn.disabled = true;
    return;
  }

  const mesa = await res.json();
  mesaTitulo.textContent = mesa.nombre || `Mesa ${mesa.codigo}`;
  mesaSubtitulo.textContent = `Codigo ${mesa.codigo}`;
}

async function pedir() {
  if (carrito.length === 0) {
    estadoEl.textContent = "Agrega al menos un producto antes de confirmar.";
    return;
  }

  await fetch(API + "/pedidos", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ mesa: mesaCodigo, carrito })
  });

  carrito = [];
  estadoEl.textContent = "Pedido enviado al restaurante.";
  renderCarrito();
}

pedirBtn.addEventListener("click", pedir);
window.agregar = agregar;
window.cambiarCantidad = cambiarCantidad;

cargarMesa();
cargarMenu();
renderCarrito();