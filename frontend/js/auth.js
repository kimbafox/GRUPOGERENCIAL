async function login() {
    const correo = document.getElementById('correo')?.value?.trim().toLowerCase();
    const password = document.getElementById('password')?.value?.trim();

    if (!correo || !password) {
        alert('Completa correo y contraseña.');
        return;
    }

    try {
        const resultado = await API.login(correo, password);

        if (!resultado.ok) {
            alert(resultado.mensaje || 'No se pudo iniciar sesión.');
            return;
        }

        sessionStorage.setItem('auth', 'ok');
        sessionStorage.setItem('sessionToken', resultado.sessionToken || '');
        sessionStorage.setItem('usuarioId', resultado.usuario.id);
        sessionStorage.setItem('usuarioNombre', resultado.usuario.nombre);
        sessionStorage.setItem('usuarioEmail', resultado.usuario.email);
        sessionStorage.setItem('usuarioRole', resultado.usuario.role || 'cliente');
        window.location.href = 'admin.html';
    } catch (error) {
        alert('Error de conexión con el servidor.');
    }
}

function obtenerUsuarioSesion() {
    return {
        id: sessionStorage.getItem('usuarioId'),
        nombre: sessionStorage.getItem('usuarioNombre'),
        email: sessionStorage.getItem('usuarioEmail'),
        role: sessionStorage.getItem('usuarioRole') || 'cliente',
        sessionToken: sessionStorage.getItem('sessionToken') || ''
    };
}

function usuarioEsAdmin() {
    return obtenerUsuarioSesion().role === 'admin';
}

function formatearFecha(fecha) {
    if (!fecha) {
        return 'Sin fecha';
    }

    const value = new Date(fecha);
    if (Number.isNaN(value.getTime())) {
        return String(fecha);
    }

    return new Intl.DateTimeFormat('es-BO', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(value);
}

function normalizarFechaISO(fecha) {
    if (!fecha) {
        return '';
    }

    const value = new Date(fecha);
    if (Number.isNaN(value.getTime())) {
        return '';
    }

    return value.toISOString().slice(0, 10);
}

function activarPanelTab(tabId) {
    const secciones = document.querySelectorAll('.panel-section');
    const tabs = document.querySelectorAll('.panel-tab');

    secciones.forEach((seccion) => {
        seccion.classList.toggle('oculto', seccion.id !== tabId);
        seccion.classList.toggle('active', seccion.id === tabId);
    });

    tabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.panelTab === tabId);
    });
}

function aplicarVistaPorRol() {
    const usuario = obtenerUsuarioSesion();
    const titulo = document.getElementById('panel-title');
    const subtitulo = document.getElementById('panel-subtitle');
    const badge = document.getElementById('usuario-role-badge');
    const adminOnly = document.querySelectorAll('[data-admin-only="true"]');

    if (titulo) {
        titulo.textContent = usuario.role === 'admin' ? 'Panel de administración' : 'Panel de vendedor';
    }

    if (subtitulo) {
        subtitulo.textContent = usuario.role === 'admin'
            ? 'Gestiona productos propios, vendedores y accesos del sistema.'
            : 'Gestiona tus productos publicados dentro de la plataforma.';
    }

    if (badge) {
        badge.textContent = usuario.role === 'admin' ? 'Administrador' : 'Vendedor';
    }

    adminOnly.forEach((elemento) => {
        elemento.classList.toggle('oculto', !usuarioEsAdmin());
    });

    if (!usuarioEsAdmin()) {
        activarPanelTab('resumen');
    }
}

function verificarAuth() {
    if (sessionStorage.getItem('auth') !== 'ok') {
        alert('Debes iniciar sesión primero.');
        window.location.href = 'index.html';
        return;
    }

    const { nombre, email, role } = obtenerUsuarioSesion();
    const info = document.getElementById('usuario-info');

    if (info && nombre && email) {
        info.textContent = `Usuario activo: ${nombre} (${email}) - Rol: ${role}`;
    }

    aplicarVistaPorRol();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatoMoneda(valor) {
    const monto = Number(valor || 0);
    return `Bs ${new Intl.NumberFormat('es-BO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(monto)}`;
}

async function cargarUsuariosAutorizados() {
    const tbody = document.getElementById('usuarios-body');
    const usuario = obtenerUsuarioSesion();

    if (!tbody || !usuarioEsAdmin()) {
        return;
    }

    tbody.innerHTML = '<tr><td colspan="4">Cargando usuarios...</td></tr>';

    try {
        const resultado = await API.obtenerUsuarios(usuario.email);
        const usuarios = Array.isArray(resultado.usuarios) ? resultado.usuarios : [];

        if (!resultado.ok || usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No hay usuarios registrados todavía.</td></tr>';
            return;
        }

        tbody.innerHTML = usuarios.map((usuario) => `
            <tr>
                <td>${escapeHtml(usuario.nombre)}</td>
                <td>${escapeHtml(usuario.email)}</td>
                <td>${escapeHtml(usuario.role || 'cliente')}</td>
                <td>${usuario.activo === 1 ? 'Activo' : 'Inactivo'}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4">No se pudo cargar la lista.</td></tr>';
    }
}

async function guardarUsuarioAutorizado() {
    const nombreInput = document.getElementById('nuevo-nombre');
    const emailInput = document.getElementById('nuevo-email');
    const passwordInput = document.getElementById('nuevo-password');
    const roleInput = document.getElementById('nuevo-role');
    const estado = document.getElementById('usuarios-estado');
    const usuario = obtenerUsuarioSesion();

    if (!emailInput || !estado || !usuarioEsAdmin()) {
        return;
    }

    const payload = {
        nombre: nombreInput?.value?.trim(),
        email: emailInput.value.trim().toLowerCase(),
        password: passwordInput?.value?.trim(),
        role: roleInput?.value || 'vendedor',
        adminEmail: usuario.email
    };

    if (!payload.email) {
        estado.textContent = 'Ingresa un correo para autorizar.';
        return;
    }

    try {
        const resultado = await API.guardarUsuario(payload);
        estado.textContent = resultado.mensaje || 'Proceso completado.';

        if (resultado.ok) {
            if (nombreInput) nombreInput.value = '';
            emailInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (roleInput) roleInput.value = 'vendedor';
            cargarUsuariosAutorizados();
        }
    } catch (error) {
        estado.textContent = 'No se pudo guardar el usuario.';
    }
}

async function cargarProductosAdmin() {
    const tbody = document.getElementById('productos-body');
    const usuario = obtenerUsuarioSesion();
    if (!tbody) {
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7">Cargando productos...</td></tr>';

    try {
        const resultado = await API.obtenerProductosGestion(usuario.email);
        const productos = Array.isArray(resultado.productos) ? resultado.productos : [];
        window.adminProductos = productos;

        if (!resultado.ok || productos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No hay productos creados.</td></tr>';
            return;
        }

        tbody.innerHTML = productos.map((producto) => `
            <tr>
                <td>${escapeHtml(producto.nombre)}</td>
                <td>${escapeHtml(producto.categoria)}</td>
                <td>${producto.origen_producto === 'vendedor' ? 'Vendedor' : 'Tienda'}</td>
                <td>${escapeHtml(producto.vendedor_nombre || (producto.origen_producto === 'tienda' ? 'Merkateck' : 'Sin asignar'))}</td>
                <td>${Number(producto.stock || 0)}</td>
                <td>${Number(producto.vendidos || 0)}</td>
                <td>
                    <button type="button" onclick="editarProducto(${producto.id})">Editar</button>
                    <button type="button" onclick="eliminarProductoAdmin(${producto.id})">Eliminar</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="7">No se pudo cargar el catálogo de gestión.</td></tr>';
    }
}

async function cargarHistorialVentas() {
    const tbody = document.getElementById('ventas-body');
    if (!tbody) {
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6">Cargando ventas...</td></tr>';

    try {
        const resultado = await API.obtenerHistorialVentas(obtenerUsuarioSesion().email);
        const ventas = Array.isArray(resultado.ventas) ? resultado.ventas : [];
        window.historialVentas = ventas;

        if (!resultado.ok || ventas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay ventas registradas todavía.</td></tr>';
            return;
        }

        renderHistorialVentas();
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6">No se pudo cargar el historial de ventas.</td></tr>';
    }
}

function obtenerVentasFiltradas() {
    const ventas = Array.isArray(window.historialVentas) ? window.historialVentas : [];
    const desde = document.getElementById('ventas-filtro-desde')?.value || '';
    const hasta = document.getElementById('ventas-filtro-hasta')?.value || '';
    const producto = document.getElementById('ventas-filtro-producto')?.value?.trim().toLowerCase() || '';
    const origen = document.getElementById('ventas-filtro-origen')?.value || 'todos';

    return ventas.filter((venta) => {
        const fechaIso = normalizarFechaISO(venta.fecha);
        const texto = `${venta.producto_nombre || ''} ${venta.comprador_nombre || ''} ${venta.comprador_email || ''}`.toLowerCase();
        const cumpleDesde = !desde || (fechaIso && fechaIso >= desde);
        const cumpleHasta = !hasta || (fechaIso && fechaIso <= hasta);
        const cumpleTexto = !producto || texto.includes(producto);
        const cumpleOrigen = origen === 'todos' || venta.origen_producto === origen;

        return cumpleDesde && cumpleHasta && cumpleTexto && cumpleOrigen;
    });
}

function renderHistorialVentas() {
    const tbody = document.getElementById('ventas-body');
    if (!tbody) {
        return;
    }

    const ventas = obtenerVentasFiltradas();

    if (!ventas.length) {
        tbody.innerHTML = '<tr><td colspan="6">No hay ventas para esos filtros.</td></tr>';
        return;
    }

    tbody.innerHTML = ventas.map((venta) => `
            <tr>
                <td>${escapeHtml(formatearFecha(venta.fecha))}</td>
                <td>${escapeHtml(venta.producto_nombre)}</td>
                <td>${venta.origen_producto === 'vendedor' ? 'Vendedor' : 'Tienda'}</td>
                <td>${escapeHtml(venta.comprador_nombre || venta.comprador_email || 'Cliente web')}</td>
                <td>${Number(venta.cantidad || 0)}</td>
                <td>${formatoMoneda(venta.total || 0)}</td>
            </tr>
        `).join('');
}

function activarFiltrosVentas() {
    ['ventas-filtro-desde', 'ventas-filtro-hasta', 'ventas-filtro-producto', 'ventas-filtro-origen'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', renderHistorialVentas);
            element.addEventListener('change', renderHistorialVentas);
        }
    });
}

function exportarVentasCsv() {
    const ventas = obtenerVentasFiltradas();

    if (!ventas.length) {
        alert('No hay ventas para exportar con esos filtros.');
        return;
    }

    const rows = [
        ['fecha', 'producto', 'origen', 'comprador', 'email_comprador', 'cantidad', 'total']
    ].concat(ventas.map((venta) => ([
        formatearFecha(venta.fecha),
        venta.producto_nombre || '',
        venta.origen_producto || '',
        venta.comprador_nombre || '',
        venta.comprador_email || '',
        Number(venta.cantidad || 0),
        Number(venta.total || 0)
    ])));

    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ventas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function cargarHistorialUsuarios() {
    const tbody = document.getElementById('historial-usuarios-body');
    if (!tbody || !usuarioEsAdmin()) {
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5">Cargando historial...</td></tr>';

    try {
        const resultado = await API.obtenerHistorialUsuarios(obtenerUsuarioSesion().email);
        const historial = Array.isArray(resultado.historial) ? resultado.historial : [];

        if (!resultado.ok || historial.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No hay eventos de usuarios registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = historial.map((evento) => `
            <tr>
                <td>${escapeHtml(formatearFecha(evento.fecha))}</td>
                <td>${escapeHtml(String(evento.accion || '').replace(/_/g, ' '))}</td>
                <td>${escapeHtml(evento.nombre)}<br><small>${escapeHtml(evento.email)}</small></td>
                <td>${escapeHtml(evento.role || 'cliente')}</td>
                <td>${escapeHtml(evento.actor_email || 'sistema')}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5">No se pudo cargar el historial de usuarios.</td></tr>';
    }
}

function actualizarPreviewProducto() {
    const nombre = document.getElementById('producto-nombre')?.value?.trim() || 'Nombre del producto';
    const categoria = document.getElementById('producto-categoria')?.value?.trim() || 'Categoría';
    const precio = document.getElementById('producto-precio')?.value?.trim() || '0';
    const imagen = document.getElementById('producto-imagen')?.value?.trim() || 'assets/M.png';
    const stock = document.getElementById('producto-stock')?.value?.trim() || '0';
    const descripcion = document.getElementById('producto-descripcion')?.value?.trim() || 'Descripción opcional para ampliar la información del producto.';

    const nombrePreview = document.getElementById('preview-nombre');
    const categoriaPreview = document.getElementById('preview-categoria');
    const precioPreview = document.getElementById('preview-precio');
    const descripcionPreview = document.getElementById('preview-descripcion');
    const stockPreview = document.getElementById('preview-stock');
    const imagenPreview = document.getElementById('preview-imagen');

    if (nombrePreview) nombrePreview.textContent = nombre;
    if (categoriaPreview) categoriaPreview.textContent = categoria;
    if (precioPreview) precioPreview.textContent = formatoMoneda(precio);
    if (descripcionPreview) descripcionPreview.textContent = descripcion;
    if (stockPreview) stockPreview.textContent = `Stock: ${stock}`;
    if (imagenPreview) {
        imagenPreview.src = imagen;
        imagenPreview.onerror = () => {
            imagenPreview.src = 'assets/M.png';
        };
    }
}

function iniciarPreviewProducto() {
    const ids = ['producto-nombre', 'producto-categoria', 'producto-precio', 'producto-imagen', 'producto-stock', 'producto-descripcion'];
    ids.forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', actualizarPreviewProducto);
        }
    });

    actualizarPreviewProducto();
}

function toggleProductoPanel() {
    const panel = document.getElementById('panel-productos');
    const boton = document.getElementById('toggle-producto-btn');

    if (panel) {
        panel.classList.toggle('oculto');

        if (boton) {
            boton.textContent = panel.classList.contains('oculto')
                ? 'Abrir ventana de carga'
                : 'Cerrar ventana de carga';
        }
    }
}

function resetProductoForm() {
    const ids = ['producto-id', 'producto-nombre', 'producto-categoria', 'producto-precio', 'producto-imagen', 'producto-stock', 'producto-descripcion'];
    ids.forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
        }
    });

    actualizarPreviewProducto();

    const estado = document.getElementById('productos-estado');
    if (estado) {
        estado.textContent = 'Formulario listo para un nuevo producto.';
    }
}

function editarProducto(id) {
    const producto = (window.adminProductos || []).find((item) => Number(item.id) === Number(id));
    if (!producto) {
        return;
    }

    const panel = document.getElementById('panel-productos');
    if (panel) {
        panel.classList.remove('oculto');
    }

    document.getElementById('producto-id').value = producto.id;
    document.getElementById('producto-nombre').value = producto.nombre || '';
    document.getElementById('producto-categoria').value = producto.categoria || '';
    document.getElementById('producto-precio').value = producto.precio || 0;
    document.getElementById('producto-imagen').value = producto.imagen_url || '';
    document.getElementById('producto-stock').value = producto.stock || 0;
    document.getElementById('producto-descripcion').value = producto.descripcion || '';

    actualizarPreviewProducto();

    const estado = document.getElementById('productos-estado');
    if (estado) {
        estado.textContent = `Editando: ${producto.nombre}`;
    }
}

async function guardarProductoAdmin() {
    const estado = document.getElementById('productos-estado');
    const usuario = obtenerUsuarioSesion();

    const payload = {
        id: document.getElementById('producto-id')?.value?.trim(),
        nombre: document.getElementById('producto-nombre')?.value?.trim(),
        categoria: document.getElementById('producto-categoria')?.value?.trim(),
        precio: document.getElementById('producto-precio')?.value?.trim(),
        imagen_url: document.getElementById('producto-imagen')?.value?.trim(),
        stock: document.getElementById('producto-stock')?.value?.trim(),
        descripcion: document.getElementById('producto-descripcion')?.value?.trim(),
        actorEmail: usuario.email
    };

    if (!payload.nombre || !payload.precio) {
        estado.textContent = 'Completa al menos nombre y precio.';
        return;
    }

    try {
        const resultado = await API.guardarProducto(payload);
        estado.textContent = resultado.mensaje || 'Proceso completado.';

        if (resultado.ok) {
            resetProductoForm();
            await cargarProductosAdmin();
            await cargarDashboardAdmin();
        }
    } catch (error) {
        estado.textContent = 'No se pudo guardar el producto.';
    }
}

async function eliminarProductoAdmin(id) {
    const usuario = obtenerUsuarioSesion();
    const estado = document.getElementById('productos-estado');

    if (!window.confirm('¿Seguro que deseas eliminar este producto?')) {
        return;
    }

    try {
        const resultado = await API.eliminarProducto(id, usuario.email);
        estado.textContent = resultado.mensaje || 'Producto eliminado.';

        if (resultado.ok) {
            await cargarProductosAdmin();
            await cargarDashboardAdmin();
        }
    } catch (error) {
        estado.textContent = 'No se pudo eliminar el producto.';
    }
}

function renderGraficaVentas(ventasPorDia) {
    const chart = document.getElementById('ventasChart');
    const resumen = document.getElementById('ventasResumen');

    if (!chart || !resumen) {
        return;
    }

    const ventas = Array.isArray(ventasPorDia) ? ventasPorDia : [];

    if (!ventas.length) {
        chart.innerHTML = '<p class="chart-empty">Aún no hay ventas registradas.</p>';
        resumen.textContent = 'Cuando se compren productos, aquí verás el movimiento diario.';
        return;
    }

    const maximo = Math.max(...ventas.map((item) => Number(item.total || 0)), 1);

    chart.innerHTML = ventas.map((item) => {
        const total = Number(item.total || 0);
        const alto = Math.max(18, Math.round((total / maximo) * 120));
        const etiqueta = String(item.dia || '').slice(5);
        return `
            <div class="chart-col">
                <div class="chart-bar" style="height:${alto}px">
                    <span>${total}</span>
                </div>
                <small>${escapeHtml(etiqueta)}</small>
            </div>
        `;
    }).join('');

    const totalSemana = ventas.reduce((acum, item) => acum + Number(item.total || 0), 0);
    resumen.textContent = `Últimos días registrados: ${totalSemana} productos vendidos.`;
}

async function cargarDashboardAdmin() {
    try {
        const resultado = await API.obtenerDashboard(obtenerUsuarioSesion().email);
        if (!resultado.ok) {
            return;
        }

        const totalProductos = document.getElementById('metric-total-productos');
        const comprasTotales = document.getElementById('metric-compras-totales');
        const productoTop = document.getElementById('metric-producto-top');
        const productosTienda = document.getElementById('metric-productos-tienda');
        const productosVendedores = document.getElementById('metric-productos-vendedores');

        if (totalProductos) totalProductos.textContent = Number(resultado.totalProductos || 0);
        if (comprasTotales) comprasTotales.textContent = Number(resultado.comprasTotales || 0);
        if (productosTienda) productosTienda.textContent = Number(resultado.totalProductosTienda || 0);
        if (productosVendedores) productosVendedores.textContent = Number(resultado.totalProductosVendedores || 0);

        if (productoTop) {
            productoTop.textContent = resultado.productoMasComprado
                ? `${resultado.productoMasComprado.producto_nombre} (${Number(resultado.productoMasComprado.total || 0)})`
                : 'Sin datos';
        }

        renderGraficaVentas(resultado.ventasPorDia || []);
    } catch (error) {
        console.error('No se pudo cargar el dashboard', error);
    }
}

document.addEventListener('DOMContentLoaded', iniciarPreviewProducto);
document.addEventListener('DOMContentLoaded', activarFiltrosVentas);

function logout() {
    sessionStorage.removeItem('auth');
    sessionStorage.removeItem('sessionToken');
    sessionStorage.removeItem('usuarioId');
    sessionStorage.removeItem('usuarioNombre');
    sessionStorage.removeItem('usuarioEmail');
    sessionStorage.removeItem('usuarioRole');
    window.location.href = 'index.html';
}
