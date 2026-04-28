function mostrarLogin() {
    cerrarRegistro();
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

function mostrarRegistro() {
    cerrarLogin();
    const modal = document.getElementById('registro');
    if (modal) {
        modal.classList.remove('oculto');
    }
}

function cerrarRegistro() {
    const modal = document.getElementById('registro');
    if (modal) {
        modal.classList.add('oculto');
    }
}

function abrirCompraModal(producto) {
    const modal = document.getElementById('compra-modal');
    if (!modal || !producto) {
        return;
    }

    window.productoCompraActual = producto;

    const nombre = document.getElementById('compra-producto-nombre');
    const resumen = document.getElementById('compra-producto-resumen');
    const imagen = document.getElementById('compra-producto-imagen');
    const categoria = document.getElementById('compra-producto-categoria');
    const precio = document.getElementById('compra-producto-precio');
    const stock = document.getElementById('compra-producto-stock');
    const toggleDescripcion = document.getElementById('compra-toggle-descripcion');
    const cantidad = document.getElementById('compra-cantidad');
    const nombreComprador = document.getElementById('compra-nombre');
    const emailComprador = document.getElementById('compra-email');
    const estado = document.getElementById('compra-estado');

    if (nombre) nombre.textContent = producto.nombre || 'Producto';
    if (resumen) {
        const descripcion = producto.descripcion || 'Completa tus datos para confirmar la compra.';
        resumen.textContent = descripcion;
        resumen.classList.add('compra-copy-collapsed');
    }
    if (toggleDescripcion) {
        const descripcion = String(producto.descripcion || '').trim();
        const necesitaToggle = descripcion.length > 110;
        toggleDescripcion.classList.toggle('oculto', !necesitaToggle);
        toggleDescripcion.textContent = 'Ver mas';
        toggleDescripcion.setAttribute('aria-expanded', 'false');
    }
    if (imagen) {
        imagen.src = producto.imagen_url || 'assets/M.png';
        imagen.alt = producto.nombre || 'Producto';
        imagen.onerror = () => {
            imagen.src = 'assets/M.png';
        };
    }
    if (categoria) categoria.textContent = producto.categoria || 'General';
    if (precio) precio.textContent = formatoMoneda(producto.precio);
    if (stock) stock.textContent = `Stock disponible: ${Number(producto.stock || 0)}`;
    if (cantidad) {
        cantidad.value = '1';
        cantidad.max = String(Math.max(1, Number(producto.stock || 1)));
    }
    if (nombreComprador) nombreComprador.value = 'Cliente web';
    if (emailComprador) emailComprador.value = '';
    if (estado) estado.textContent = '';

    modal.classList.remove('oculto');
}

function toggleCompraDescripcion() {
    const resumen = document.getElementById('compra-producto-resumen');
    const toggle = document.getElementById('compra-toggle-descripcion');
    if (!resumen || !toggle) {
        return;
    }

    const expandido = resumen.classList.toggle('compra-copy-collapsed') === false;
    toggle.textContent = expandido ? 'Ver menos' : 'Ver mas';
    toggle.setAttribute('aria-expanded', expandido ? 'true' : 'false');
}

function cerrarCompraModal() {
    const modal = document.getElementById('compra-modal');
    if (modal) {
        modal.classList.add('oculto');
    }

    window.productoCompraActual = null;
}

function aplicarTema(nombreTema) {
    const tema = nombreTema === 'ink' ? 'ink' : 'dark';
    document.body.classList.toggle('theme-ink', tema === 'ink');
    document.body.dataset.theme = tema;

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        const siguiente = tema === 'ink' ? 'nocturno' : 'tinta';
        toggle.setAttribute('aria-label', `Cambiar al tema ${siguiente}`);
        toggle.setAttribute('title', `Cambiar al tema ${siguiente}`);
    }

    localStorage.setItem('merkateck-theme', tema);
}

function alternarTema() {
    const temaActual = document.body.dataset.theme === 'ink' ? 'ink' : 'dark';
    aplicarTema(temaActual === 'ink' ? 'dark' : 'ink');
}

function iniciarTema() {
    const temaGuardado = localStorage.getItem('merkateck-theme') || 'dark';
    aplicarTema(temaGuardado);

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
        toggle.addEventListener('click', alternarTema);
    }
}

function formatoMoneda(valor) {
    const monto = Number(valor || 0);
    return `Bs ${new Intl.NumberFormat('es-BO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(monto)}`;
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

function obtenerCategoriasCatalogo(productos) {
    return Array.from(new Set(
        productos
            .map((producto) => String(producto.categoria || '').trim())
            .filter(Boolean)
    )).sort((categoriaA, categoriaB) => categoriaA.localeCompare(categoriaB, 'es'));
}

function actualizarOpcionesCategoria(productos) {
    const select = document.getElementById('filtrar-categoria');
    if (!select) {
        return;
    }

    const valorActual = select.value;
    const categorias = obtenerCategoriasCatalogo(productos);

    select.innerHTML = [
        '<option value="">Todas las categorías</option>',
        ...categorias.map((categoria) => `<option value="${escaparHtml(categoria)}">${escaparHtml(categoria)}</option>`)
    ].join('');

    if (categorias.includes(valorActual)) {
        select.value = valorActual;
    }
}

function renderizarCatalogoVentas(productos) {
    const contenedor = document.getElementById('catalogo-grid');
    if (!contenedor) {
        return;
    }

    if (!productos.length) {
        contenedor.innerHTML = '<p class="catalog-loading">No hay productos que coincidan con tu búsqueda.</p>';
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
                        <button type="button" onclick="comprarProducto(${producto.id})">Comprar</button>
                    </div>
                </div>
            </div>
        </article>
    `).join('');
}

function aplicarFiltrosCatalogo() {
    const productos = Array.isArray(window.catalogoProductos) ? window.catalogoProductos : [];
    const termino = document.getElementById('buscar-producto')?.value?.trim().toLowerCase() || '';
    const categoria = document.getElementById('filtrar-categoria')?.value?.trim() || '';

    const filtrados = productos.filter((producto) => {
        const coincideNombre = !termino || String(producto.nombre || '').toLowerCase().includes(termino);
        const coincideCategoria = !categoria || String(producto.categoria || '').trim() === categoria;
        return coincideNombre && coincideCategoria;
    });

    renderizarCatalogoVentas(filtrados);
}

function iniciarFiltrosCatalogo() {
    const buscar = document.getElementById('buscar-producto');
    const categoria = document.getElementById('filtrar-categoria');

    if (buscar) {
        buscar.addEventListener('input', aplicarFiltrosCatalogo);
    }

    if (categoria) {
        categoria.addEventListener('change', aplicarFiltrosCatalogo);
    }
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
            actualizarOpcionesCategoria([]);
            return;
        }

        actualizarOpcionesCategoria(productos);
        aplicarFiltrosCatalogo();
    } catch (error) {
        contenedor.innerHTML = '<p class="catalog-loading">No se pudo cargar el catálogo.</p>';
    }
}

async function comprarProducto(id) {
    const producto = (window.catalogoProductos || []).find((item) => Number(item.id) === Number(id));
    if (!producto) {
        alert('No se encontró el producto.');
        return;
    }

    abrirCompraModal(producto);
}

async function confirmarCompraProducto() {
    const producto = window.productoCompraActual;
    const estado = document.getElementById('compra-estado');
    if (!producto) {
        if (estado) {
            estado.textContent = 'No se encontró el producto seleccionado.';
        }
        return;
    }

    const cantidad = Math.max(1, parseInt(document.getElementById('compra-cantidad')?.value, 10) || 1);
    const nombreComprador = document.getElementById('compra-nombre')?.value?.trim() || 'Cliente web';
    const emailComprador = document.getElementById('compra-email')?.value?.trim() || '';

    if (cantidad > Number(producto.stock || 0)) {
        if (estado) {
            estado.textContent = 'La cantidad supera el stock disponible.';
        }
        return;
    }

    if (estado) {
        estado.textContent = 'Procesando compra...';
    }

    try {
        const resultado = await API.comprarProducto({
            productoId: producto.id,
            cantidad,
            nombreComprador,
            emailComprador
        });

        if (resultado.ok) {
            if (estado) {
                estado.textContent = resultado.mensaje || 'Compra procesada.';
            }
            await cargarCatalogoVentas();
            window.setTimeout(() => {
                cerrarCompraModal();
            }, 900);
            return;
        }

        if (estado) {
            estado.textContent = resultado.mensaje || 'No se pudo procesar la compra.';
        }
    } catch (error) {
        if (estado) {
            estado.textContent = 'No se pudo registrar la compra.';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    iniciarTema();
    iniciarCarruselPromos();
    iniciarFiltrosCatalogo();
    cargarCatalogoVentas();
});
