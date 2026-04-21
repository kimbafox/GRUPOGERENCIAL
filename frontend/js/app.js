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

function obtenerFiltrosCatalogo() {
    return {
        busqueda: document.getElementById('filtro-busqueda')?.value?.trim().toLowerCase() || '',
        categoria: document.getElementById('filtro-categoria')?.value || 'todas'
    };
}

function poblarFiltrosCatalogo(productos) {
    const categoriaSelect = document.getElementById('filtro-categoria');

    if (!categoriaSelect) {
        return;
    }

    const categorias = Array.from(new Set(productos.map((producto) => String(producto.categoria || '').trim()).filter(Boolean))).sort();

    categoriaSelect.innerHTML = ['<option value="todas">Todas las categorías</option>']
        .concat(categorias.map((categoria) => `<option value="${escaparHtml(categoria)}">${escaparHtml(categoria)}</option>`))
        .join('');
}

function filtrarProductos(productos) {
    const filtros = obtenerFiltrosCatalogo();

    return productos.filter((producto) => {
        const textoBase = `${producto.nombre || ''} ${producto.descripcion || ''} ${producto.categoria || ''}`.toLowerCase();
        const categoriaOk = filtros.categoria === 'todas' || String(producto.categoria || '') === filtros.categoria;
        const busquedaOk = !filtros.busqueda || textoBase.includes(filtros.busqueda);

        return categoriaOk && busquedaOk;
    });
}

function obtenerEstadoGrupoCatalogo(clave) {
    if (!window.catalogGroupsState) {
        window.catalogGroupsState = {
            tienda: true,
            vendedores: true
        };
    }

    return Boolean(window.catalogGroupsState[clave]);
}

function toggleCatalogGroup(clave) {
    if (!window.catalogGroupsState) {
        window.catalogGroupsState = {};
    }

    window.catalogGroupsState[clave] = !obtenerEstadoGrupoCatalogo(clave);
    renderCatalogo(filtrarProductos(window.catalogoProductosOriginal || []));
}

function renderCatalogo(productos) {
    const contenedor = document.getElementById('catalogo-grid');
    if (!contenedor) {
        return;
    }

    const productosTienda = productos.filter((producto) => producto.origen_producto === 'tienda');
    const productosVendedores = productos.filter((producto) => producto.origen_producto === 'vendedor');

    const renderGrupo = (clave, titulo, descripcion, items, mostrarVendedor) => `
        <section class="catalog-group ${obtenerEstadoGrupoCatalogo(clave) ? 'expanded' : 'collapsed'}">
            <button type="button" class="catalog-group-toggle" onclick="toggleCatalogGroup('${clave}')">
                <div class="catalog-group-heading">
                    <h3>${escaparHtml(titulo)}</h3>
                    <p>${escaparHtml(descripcion)}</p>
                </div>
                <span class="catalog-group-indicator">${obtenerEstadoGrupoCatalogo(clave) ? 'Ocultar' : 'Mostrar'} (${items.length})</span>
            </button>
            <div class="catalog-group-body ${obtenerEstadoGrupoCatalogo(clave) ? '' : 'oculto'}">
                <div class="catalog-group-scroll">
                    <div class="catalog-grid catalog-grid-inner">
                        ${items.length ? items.map((producto) => `
                            <article class="catalog-card compact-catalog-card">
                                <div class="catalog-image-wrap">
                                    <img src="${escaparHtml(producto.imagen_url || 'assets/M.png')}" alt="${escaparHtml(producto.nombre)}" class="catalog-image">
                                </div>
                                <div class="catalog-content">
                                    <div>
                                        <span class="catalog-category">${escaparHtml(producto.categoria)}</span>
                                        <h3>${escaparHtml(producto.nombre)}</h3>
                                        <p>${escaparHtml(producto.descripcion || 'Producto disponible.')}</p>
                                        ${mostrarVendedor ? `<small class="catalog-owner">Vendedor: ${escaparHtml(producto.vendedor_nombre || 'Vendedor registrado')}</small>` : ''}
                                    </div>
                                    <div class="catalog-footer">
                                        <div>
                                            <strong>${formatoMoneda(producto.precio)}</strong>
                                            <small>Stock: ${Number(producto.stock || 0)}</small>
                                        </div>
                                        <div class="catalog-actions">
                                            <button type="button" onclick="verDetalleProducto(${producto.id})">Ver detalle</button>
                                            <button type="button" onclick="comprarProducto(${producto.id})">Comprar</button>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        `).join('') : '<p class="catalog-loading">No hay productos en esta sección.</p>'}
                    </div>
                </div>
            </div>
        </section>
    `;

    if (!productos.length) {
        contenedor.innerHTML = '<p class="catalog-loading">No se encontraron productos con esos filtros.</p>';
        return;
    }

    contenedor.innerHTML = [
        renderGrupo('tienda', 'Productos de la tienda', 'Catálogo principal publicado directamente por la página.', productosTienda, false),
        renderGrupo('vendedores', 'Productos de vendedores', 'Publicaciones cargadas por vendedores autorizados dentro de la plataforma.', productosVendedores, true)
    ].join('');
}

function activarFiltrosCatalogo() {
    const ids = ['filtro-busqueda', 'filtro-categoria'];
    ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => renderCatalogo(filtrarProductos(window.catalogoProductosOriginal || [])));
            element.addEventListener('change', () => renderCatalogo(filtrarProductos(window.catalogoProductosOriginal || [])));
        }
    });
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
        window.catalogoProductosOriginal = productos;

        if (!resultado.ok || productos.length === 0) {
            contenedor.innerHTML = '<p class="catalog-loading">Aún no hay productos cargados. Súbelos desde el panel de admin.</p>';
            return;
        }

        poblarFiltrosCatalogo(productos);
        renderCatalogo(filtrarProductos(productos));
    } catch (error) {
        contenedor.innerHTML = '<p class="catalog-loading">No se pudo cargar el catálogo.</p>';
    }
}

function verDetalleProducto(id) {
    const producto = (window.catalogoProductos || []).find((item) => Number(item.id) === Number(id));
    if (!producto) {
        return;
    }

    const modal = document.getElementById('detalle-producto-modal');
    const imagen = document.getElementById('detalle-producto-imagen');
    const categoria = document.getElementById('detalle-producto-categoria');
    const nombre = document.getElementById('detalle-producto-nombre');
    const descripcion = document.getElementById('detalle-producto-descripcion');
    const precio = document.getElementById('detalle-producto-precio');
    const stock = document.getElementById('detalle-producto-stock');
    const origen = document.getElementById('detalle-producto-origen');
    const vendedor = document.getElementById('detalle-producto-vendedor');
    const comprar = document.getElementById('detalle-producto-comprar');

    if (!modal || !imagen || !categoria || !nombre || !descripcion || !precio || !stock || !origen || !vendedor || !comprar) {
        return;
    }

    imagen.src = producto.imagen_url || 'assets/M.png';
    imagen.alt = producto.nombre || 'Detalle del producto';
    categoria.textContent = producto.categoria || 'Sin categoría';
    nombre.textContent = producto.nombre || 'Producto';
    descripcion.textContent = producto.descripcion || 'Sin descripción detallada.';
    precio.textContent = formatoMoneda(producto.precio);
    stock.textContent = `Stock: ${Number(producto.stock || 0)}`;
    origen.textContent = `Origen: ${producto.origen_producto === 'vendedor' ? 'Vendedor' : 'Tienda'}`;

    if (producto.origen_producto === 'vendedor' && producto.vendedor_nombre) {
        vendedor.textContent = `Vendedor: ${producto.vendedor_nombre}`;
        vendedor.classList.remove('oculto');
    } else {
        vendedor.textContent = '';
        vendedor.classList.add('oculto');
    }

    comprar.onclick = () => comprarProducto(producto.id);
    modal.classList.remove('oculto');
}

function cerrarDetalleProducto() {
    const modal = document.getElementById('detalle-producto-modal');
    if (modal) {
        modal.classList.add('oculto');
    }
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
    activarFiltrosCatalogo();
    cargarCatalogoVentas();
});
