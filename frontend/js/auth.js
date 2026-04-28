function guardarSesion(usuario, token) {
    sessionStorage.setItem('authToken', token);
    sessionStorage.setItem('usuarioNombre', usuario.nombre);
    sessionStorage.setItem('usuarioEmail', usuario.email);
    sessionStorage.setItem('usuarioRol', usuario.rol);
}

function limpiarSesionLocal() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('usuarioNombre');
    sessionStorage.removeItem('usuarioEmail');
    sessionStorage.removeItem('usuarioRol');
}

function obtenerRutaPanelPorRol(rol) {
    return rol === 'admin' ? 'admin.html' : 'vendedor.html';
}

function redirigirSegunRol(rol) {
    window.location.href = obtenerRutaPanelPorRol(rol);
}

async function login() {
    const correo = document.getElementById('correo')?.value?.trim().toLowerCase();
    const password = document.getElementById('password')?.value?.trim();

    if (!correo || !password) {
        alert('Completa correo y contraseña.');
        return;
    }

    try {
        const resultado = await API.login(correo, password);

        if (!resultado.ok || !resultado.token || !resultado.usuario) {
            alert(resultado.mensaje || 'No se pudo iniciar sesión.');
            return;
        }

        guardarSesion(resultado.usuario, resultado.token);
        redirigirSegunRol(resultado.usuario.rol);
    } catch (error) {
        alert('Error de conexión con el servidor.');
    }
}

async function registrarUsuario() {
    const nombre = document.getElementById('registro-nombre')?.value?.trim();
    const correo = document.getElementById('registro-correo')?.value?.trim().toLowerCase();
    const password = document.getElementById('registro-password')?.value?.trim();
    const confirmacion = document.getElementById('registro-password-confirmacion')?.value?.trim();

    if (!nombre || !correo || !password || !confirmacion) {
        alert('Completa nombre, correo, contraseña y confirmación.');
        return;
    }

    if (password !== confirmacion) {
        alert('Las contraseñas no coinciden.');
        return;
    }

    try {
        const resultado = await API.register({ nombre, email: correo, password });

        if (!resultado.ok || !resultado.token || !resultado.usuario) {
            alert(resultado.mensaje || 'No se pudo completar el registro.');
            return;
        }

        guardarSesion(resultado.usuario, resultado.token);
        cerrarRegistro();
        redirigirSegunRol(resultado.usuario.rol);
    } catch (error) {
        alert('Error de conexión con el servidor.');
    }
}

async function verificarAuth(rolEsperado) {
    const token = sessionStorage.getItem('authToken');

    if (!token) {
        limpiarSesionLocal();
        window.location.href = 'index.html';
        return null;
    }

    try {
        const resultado = await API.obtenerSesion();

        if (!resultado.ok || !resultado.usuario) {
            limpiarSesionLocal();
            window.location.href = 'index.html';
            return null;
        }

        guardarSesion(resultado.usuario, token);

        if (rolEsperado && resultado.usuario.rol !== rolEsperado) {
            redirigirSegunRol(resultado.usuario.rol);
            return null;
        }

        const info = document.getElementById('usuario-info');
        if (info) {
            info.textContent = `${resultado.usuario.nombre} | ${resultado.usuario.email}`;
        }

        return resultado.usuario;
    } catch (error) {
        limpiarSesionLocal();
        window.location.href = 'index.html';
        return null;
    }
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

    if (!tbody) {
        return;
    }

    tbody.innerHTML = '<tr><td colspan="4">Cargando usuarios...</td></tr>';

    try {
        const resultado = await API.obtenerUsuarios();
        const usuarios = Array.isArray(resultado.usuarios) ? resultado.usuarios : [];

        if (!resultado.ok || usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No hay usuarios.</td></tr>';
            return;
        }

        tbody.innerHTML = usuarios.map((usuario) => `
            <tr>
                <td>${escapeHtml(usuario.nombre)}</td>
                <td>${escapeHtml(usuario.email)}</td>
                <td>${usuario.rol === 'admin' ? 'Admin' : 'Vendedor'}</td>
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
    const rolInput = document.getElementById('nuevo-rol');
    const estado = document.getElementById('usuarios-estado');

    if (!emailInput || !estado) {
        return;
    }

    const payload = {
        nombre: nombreInput?.value?.trim(),
        email: emailInput.value.trim().toLowerCase(),
        password: passwordInput?.value?.trim(),
        rol: rolInput?.value === 'admin' ? 'admin' : 'vendor'
    };

    if (!payload.email) {
        estado.textContent = 'Ingresa un correo.';
        return;
    }

    try {
        const resultado = await API.guardarUsuario(payload);
        estado.textContent = resultado.mensaje || 'Proceso completado.';

        if (resultado.ok) {
            if (nombreInput) nombreInput.value = '';
            emailInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (rolInput) rolInput.value = 'vendor';
            cargarUsuariosAutorizados();
        }
    } catch (error) {
        estado.textContent = 'No se pudo guardar el usuario.';
    }
}

async function cargarProductosPanel() {
    const tbody = document.getElementById('productos-body');
    if (!tbody) {
        return;
    }

    const esPanelVendedor = document.body.dataset.panel === 'vendor';
    tbody.innerHTML = '<tr><td colspan="5">Cargando productos...</td></tr>';

    try {
        const resultado = esPanelVendedor ? await API.obtenerMisProductos() : await API.obtenerProductos();
        const productos = Array.isArray(resultado.productos) ? resultado.productos : [];
        window.panelProductos = productos;

        if (!resultado.ok || productos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No hay productos.</td></tr>';
            return;
        }

        tbody.innerHTML = productos.map((producto) => `
            <tr>
                <td>${escapeHtml(producto.nombre)}</td>
                <td>${escapeHtml(producto.categoria)}</td>
                <td>${Number(producto.stock || 0)}</td>
                <td>${Number(producto.vendidos || 0)}</td>
                <td>
                    <button type="button" onclick="editarProducto(${producto.id})">Editar</button>
                    <button type="button" onclick="eliminarProductoPanel(${producto.id})">Eliminar</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5">No se pudo cargar el panel.</td></tr>';
    }
}

function actualizarPreviewProducto() {
    const nombre = document.getElementById('producto-nombre')?.value?.trim() || 'Nombre del producto';
    const categoria = document.getElementById('producto-categoria')?.value?.trim() || 'Categoría';
    const precio = document.getElementById('producto-precio')?.value?.trim() || '0';
    const imagen = document.getElementById('producto-imagen')?.value?.trim() || 'assets/M.png';
    const stock = document.getElementById('producto-stock')?.value?.trim() || '0';
    const descripcion = document.getElementById('producto-descripcion')?.value?.trim() || 'Sin resumen.';

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

    if (!panel) {
        return;
    }

    panel.classList.toggle('oculto');

    if (boton) {
        boton.textContent = panel.classList.contains('oculto') ? 'Abrir carga' : 'Cerrar carga';
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
        estado.textContent = 'Formulario limpio.';
    }
}

function editarProducto(id) {
    const producto = (window.panelProductos || []).find((item) => Number(item.id) === Number(id));
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

    const payload = {
        id: document.getElementById('producto-id')?.value?.trim(),
        nombre: document.getElementById('producto-nombre')?.value?.trim(),
        categoria: document.getElementById('producto-categoria')?.value?.trim(),
        precio: document.getElementById('producto-precio')?.value?.trim(),
        imagen_url: document.getElementById('producto-imagen')?.value?.trim(),
        stock: document.getElementById('producto-stock')?.value?.trim(),
        descripcion: document.getElementById('producto-descripcion')?.value?.trim()
    };

    if (!payload.nombre || !payload.descripcion || !payload.precio) {
        estado.textContent = 'Completa nombre, descripción y precio.';
        return;
    }

    try {
        const resultado = await API.guardarProducto(payload);
        estado.textContent = resultado.mensaje || 'Proceso completado.';

        if (resultado.ok) {
            resetProductoForm();
            await cargarProductosPanel();
            await cargarDashboardPanel();
        }
    } catch (error) {
        estado.textContent = 'No se pudo guardar el producto.';
    }
}

async function eliminarProductoPanel(id) {
    const estado = document.getElementById('productos-estado');

    if (!window.confirm('¿Eliminar este producto?')) {
        return;
    }

    try {
        const resultado = await API.eliminarProducto(id);
        estado.textContent = resultado.mensaje || 'Producto eliminado.';

        if (resultado.ok) {
            await cargarProductosPanel();
            await cargarDashboardPanel();
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
        chart.innerHTML = '<p class="chart-empty">Sin movimientos.</p>';
        resumen.textContent = 'Sin datos recientes.';
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
    resumen.textContent = `Últimos 7 días: ${totalSemana}`;
}

async function cargarDashboardPanel() {
    try {
        const esPanelVendedor = document.body.dataset.panel === 'vendor';
        const resultado = esPanelVendedor ? await API.obtenerMiDashboard() : await API.obtenerDashboard();

        if (!resultado.ok) {
            return;
        }

        const totalProductos = document.getElementById('metric-total-productos');
        const comprasTotales = document.getElementById('metric-compras-totales');
        const productoTop = document.getElementById('metric-producto-top');

        if (totalProductos) totalProductos.textContent = Number(resultado.totalProductos || 0);
        if (comprasTotales) comprasTotales.textContent = Number(resultado.comprasTotales || 0);

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

async function initAdminPanel() {
    const usuario = await verificarAuth('admin');
    if (!usuario) {
        return;
    }

    await cargarUsuariosAutorizados();
    await cargarProductosPanel();
    await cargarDashboardPanel();
    iniciarPreviewProducto();
}

async function initVendedorPanel() {
    const usuario = await verificarAuth('vendor');
    if (!usuario) {
        return;
    }

    await cargarProductosPanel();
    await cargarDashboardPanel();
    iniciarPreviewProducto();
}

async function logout() {
    try {
        await API.logout();
    } catch (error) {
    }

    limpiarSesionLocal();
    window.location.href = 'index.html';
}
