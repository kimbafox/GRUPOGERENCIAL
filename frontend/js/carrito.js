function formatoMoneda(valor) {
    const monto = Number(valor || 0);
    return `Bs ${new Intl.NumberFormat('es-BO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(monto)}`;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function obtenerCarritoCliente() {
    try {
        const data = JSON.parse(localStorage.getItem('merkateckCart') || '[]');
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
}

function guardarCarritoCliente(carrito) {
    localStorage.setItem('merkateckCart', JSON.stringify(carrito));
}

function obtenerResumenCarritoCliente() {
    const carrito = obtenerCarritoCliente();
    const items = carrito.reduce((acum, item) => acum + Number(item.cantidad || 0), 0);
    const subtotal = carrito.reduce((acum, item) => acum + (Number(item.precio || 0) * Number(item.cantidad || 0)), 0);

    return {
        items,
        subtotal,
        total: subtotal
    };
}

function actualizarContadoresCarritoCliente() {
    const resumen = obtenerResumenCarritoCliente();
    const ids = [
        ['client-cart-count', resumen.items],
        ['client-cart-badge', `${resumen.items} ${resumen.items === 1 ? 'item' : 'items'}`],
        ['cart-hero-items', `${resumen.items} ${resumen.items === 1 ? 'producto' : 'productos'}`],
        ['client-cart-subtotal', formatoMoneda(resumen.subtotal)],
        ['client-cart-total', formatoMoneda(resumen.total)],
        ['cart-hero-total', formatoMoneda(resumen.total)]
    ];

    ids.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = String(value);
        }
    });
}

function animarCarritoCliente() {
    const shell = document.getElementById('client-cart-summary-shell');
    if (!shell) {
        return;
    }

    shell.classList.remove('cart-bump');
    window.requestAnimationFrame(() => {
        shell.classList.add('cart-bump');
        window.setTimeout(() => shell.classList.remove('cart-bump'), 420);
    });
}

function renderCarritoCliente() {
    const itemsWrap = document.getElementById('client-cart-items');
    const carrito = obtenerCarritoCliente();

    if (!itemsWrap) {
        return;
    }

    if (!carrito.length) {
        itemsWrap.innerHTML = '<p class="catalog-loading">Tu carrito está vacío por ahora.</p>';
    } else {
        itemsWrap.innerHTML = carrito.map((item) => `
            <article class="client-cart-item">
                <div class="client-cart-item-media">
                    <img src="${escapeHtml(item.imagen_url || 'assets/M.png')}" alt="${escapeHtml(item.nombre)}">
                </div>
                <div class="client-cart-item-content">
                    <div>
                        <span class="catalog-category">${escapeHtml(item.categoria || 'General')}</span>
                        <h3>${escapeHtml(item.nombre)}</h3>
                        <p>${escapeHtml(item.origen_producto === 'vendedor' ? `Vendido por ${item.vendedor_nombre || 'vendedor registrado'}` : 'Venta directa de tienda')}</p>
                    </div>
                    <div class="client-cart-item-footer">
                        <div>
                            <strong>${formatoMoneda(item.precio)}</strong>
                            <small>Stock visible: ${Number(item.stock || 0)}</small>
                        </div>
                        <div class="client-cart-item-actions">
                            <div class="quantity-chip">
                                <button type="button" onclick="ajustarCantidadCliente(${item.id}, -1)">-</button>
                                <span>${Number(item.cantidad || 0)}</span>
                                <button type="button" onclick="ajustarCantidadCliente(${item.id}, 1)">+</button>
                            </div>
                            <strong>${formatoMoneda(Number(item.precio || 0) * Number(item.cantidad || 0))}</strong>
                            <button type="button" class="secondary-button" onclick="quitarProductoCliente(${item.id})">Quitar</button>
                        </div>
                    </div>
                </div>
            </article>
        `).join('');
    }

    actualizarContadoresCarritoCliente();
}

function ajustarCantidadCliente(id, delta) {
    const carrito = obtenerCarritoCliente();
    const item = carrito.find((actual) => Number(actual.id) === Number(id));
    const estado = document.getElementById('client-cart-status');

    if (!item) {
        return;
    }

    const nuevaCantidad = Number(item.cantidad || 0) + delta;

    if (nuevaCantidad <= 0) {
        guardarCarritoCliente(carrito.filter((actual) => Number(actual.id) !== Number(id)));
    } else if (nuevaCantidad > Number(item.stock || 0)) {
        if (estado) {
            estado.textContent = 'No puedes superar el stock visible del producto.';
        }
        return;
    } else {
        item.cantidad = nuevaCantidad;
        guardarCarritoCliente(carrito);
    }

    renderCarritoCliente();
    animarCarritoCliente();
}

function quitarProductoCliente(id) {
    guardarCarritoCliente(obtenerCarritoCliente().filter((item) => Number(item.id) !== Number(id)));
    renderCarritoCliente();
}

function vaciarCarritoCliente() {
    guardarCarritoCliente([]);
    const estado = document.getElementById('client-cart-status');
    if (estado) {
        estado.textContent = 'Tu carrito quedó vacío.';
    }
    renderCarritoCliente();
}

async function finalizarCompraCliente() {
    const carrito = obtenerCarritoCliente();
    const estado = document.getElementById('client-cart-status');

    if (!estado) {
        return;
    }

    if (!carrito.length) {
        estado.textContent = 'Tu carrito está vacío.';
        return;
    }

    const payload = {
        items: carrito.map((item) => ({ productoId: item.id, cantidad: item.cantidad })),
        nombreComprador: document.getElementById('client-cart-name')?.value?.trim() || 'Cliente web',
        emailComprador: document.getElementById('client-cart-email')?.value?.trim() || '',
        observaciones: document.getElementById('client-cart-notes')?.value?.trim() || ''
    };

    estado.textContent = 'Procesando compra...';

    try {
        const resultado = await API.comprarProducto(payload);
        estado.textContent = resultado.mensaje || 'Compra registrada.';

        if (resultado.ok) {
            guardarCarritoCliente([]);
            ['client-cart-name', 'client-cart-email', 'client-cart-notes'].forEach((id) => {
                const input = document.getElementById(id);
                if (input) {
                    input.value = '';
                }
            });

            renderCarritoCliente();
            estado.textContent = resultado.mensaje || 'Compra registrada.';
        }
    } catch (error) {
        estado.textContent = 'No se pudo completar la compra.';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderCarritoCliente();
});