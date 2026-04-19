function mostrarLogin() {
    const modal = document.getElementById('login');
    if (modal) {
        modal.classList.remove('oculto');
    }
}

function cerrarLogin() {
    const modal = document.getElementById('login');
    if (modal) {
        modal.classList.add('oculto');
    }
}

function formatoMoneda(valor) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(Number(valor || 0));
}

function escaparHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function iniciarCarruselPromos() {
    const track = document.getElementById('promoTrack');
    if (!track) {
        return;
    }

    const slides = Array.from(track.querySelectorAll('.carousel-slide'));
    const dots = Array.from(document.querySelectorAll('.carousel-dot'));
    const prev = document.querySelector('.carousel-control.prev');
    const next = document.querySelector('.carousel-control.next');
    let index = 0;

    function render() {
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === index);
        });

        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });
    }

    function goTo(newIndex) {
        index = (newIndex + slides.length) % slides.length;
        render();
    }

    if (prev) {
        prev.addEventListener('click', () => goTo(index - 1));
    }

    if (next) {
        next.addEventListener('click', () => goTo(index + 1));
    }

    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => goTo(i));
    });

    render();
    setInterval(() => goTo(index + 1), 7000);
}

async function cargarCatalogoVentas() {
    const contenedor = document.getElementById('catalogo-grid');
    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = '<p class="catalog-loading">Cargando categorías de venta...</p>';

    try {
        const resultado = await API.obtenerProductos();
        const productos = Array.isArray(resultado.productos) ? resultado.productos : [];
        window.catalogoProductos = productos;

        if (!resultado.ok || productos.length === 0) {
            contenedor.innerHTML = '<p class="catalog-loading">Aún no hay productos cargados. Súbelos desde el panel de admin.</p>';
            return;
        }

        contenedor.innerHTML = productos.map((producto) => `
            <article class="catalog-card">
                <div class="catalog-image-wrap">
                    <img src="${escaparHtml(producto.imagen_url || 'assets/M.png')}" alt="${escaparHtml(producto.nombre)}" class="catalog-image">
                </div>
                <div class="catalog-content">
                    <div>
                        <span class="catalog-category">${escaparHtml(producto.categoria)}</span>
                        <h3>${escaparHtml(producto.nombre)}</h3>
                        <p>${escaparHtml(producto.descripcion)}</p>
                    </div>
                    <div class="catalog-footer">
                        <div>
                            <strong>${formatoMoneda(producto.precio)}</strong>
                            <small>Stock disponible: ${Number(producto.stock || 0)}</small>
                        </div>
                        <div class="catalog-actions">
                            <button type="button" onclick="verDetalleProducto(${producto.id})">Ver detalle</button>
                            <button type="button" onclick="comprarProducto(${producto.id})">Comprar</button>
                        </div>
                    </div>
                </div>
            </article>
        `).join('');
    } catch (error) {
        contenedor.innerHTML = '<p class="catalog-loading">No se pudo cargar el catálogo.</p>';
    }
}

function verDetalleProducto(id) {
    const producto = (window.catalogoProductos || []).find((item) => Number(item.id) === Number(id));
    if (!producto) {
        return;
    }

    alert(
        `${producto.nombre}\n\nCategoría: ${producto.categoria}\nPrecio: ${formatoMoneda(producto.precio)}\nStock: ${producto.stock}\n\n${producto.descripcion}`
    );
}

async function comprarProducto(id) {
    const producto = (window.catalogoProductos || []).find((item) => Number(item.id) === Number(id));
    if (!producto) {
        alert('No se encontró el producto.');
        return;
    }

    const cantidadTexto = window.prompt(`¿Cuántas unidades de ${producto.nombre} deseas comprar?`, '1');
    if (cantidadTexto === null) {
        return;
    }

    const cantidad = Math.max(1, parseInt(cantidadTexto, 10) || 1);
    const nombreComprador = window.prompt('Nombre del comprador:', 'Cliente web') || 'Cliente web';
    const emailComprador = window.prompt('Correo del comprador (opcional):', '') || '';

    try {
        const resultado = await API.comprarProducto({
            productoId: id,
            cantidad,
            nombreComprador,
            emailComprador
        });

        alert(resultado.mensaje || 'Compra procesada.');

        if (resultado.ok) {
            await cargarCatalogoVentas();
        }
    } catch (error) {
        alert('No se pudo registrar la compra.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    iniciarCarruselPromos();
    cargarCatalogoVentas();
});
