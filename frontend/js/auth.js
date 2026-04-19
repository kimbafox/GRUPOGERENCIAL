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
        sessionStorage.setItem('usuarioNombre', resultado.usuario.nombre);
        sessionStorage.setItem('usuarioEmail', resultado.usuario.email);
        window.location.href = 'admin.html';
    } catch (error) {
        alert('Error de conexión con el servidor.');
    }
}

function verificarAuth() {
    if (sessionStorage.getItem('auth') !== 'ok') {
        alert('Debes iniciar sesión primero.');
        window.location.href = 'index.html';
        return;
    }

    const nombre = sessionStorage.getItem('usuarioNombre');
    const email = sessionStorage.getItem('usuarioEmail');
    const info = document.getElementById('usuario-info');

    if (info && nombre && email) {
        info.textContent = `Usuario activo: ${nombre} (${email})`;
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

function formatoCOP(valor) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(Number(valor || 0));
}

async function cargarUsuariosAutorizados() {
    const tbody = document.getElementById('usuarios-body');

    if (!tbody) {
        return;
    }

    tbody.innerHTML = '<tr><td colspan="3">Cargando correos...</td></tr>';

    try {
        const resultado = await API.obtenerUsuarios();
        const usuarios = Array.isArray(resultado.usuarios) ? resultado.usuarios : [];

        if (!resultado.ok || usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">No hay correos autorizados todavía.</td></tr>';
            return;
        }

        tbody.innerHTML = usuarios.map((usuario) => `
            <tr>
                <td>${escapeHtml(usuario.nombre)}</td>
                <td>${escapeHtml(usuario.email)}</td>
                <td>${usuario.activo === 1 ? 'Activo' : 'Inactivo'}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="3">No se pudo cargar la lista.</td></tr>';
    }
}

async function guardarUsuarioAutorizado() {
    const nombreInput = document.getElementById('nuevo-nombre');
    const emailInput = document.getElementById('nuevo-email');
    const passwordInput = document.getElementById('nuevo-password');
    const estado = document.getElementById('usuarios-estado');

    if (!emailInput || !estado) {
        return;
    }

    const payload = {
        nombre: nombreInput?.value?.trim(),
        email: emailInput.value.trim().toLowerCase(),
        password: passwordInput?.value?.trim()
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
            cargarUsuariosAutorizados();
        }
    } catch (error) {
        estado.textContent = 'No se pudo guardar el correo.';
    }
}

async function cargarProductosAdmin() {
    const tbody = document.getElementById('productos-body');
    if (!tbody) {
        return;
    }

    tbody.innerHTML = '<tr><td colspan="6">Cargando productos...</td></tr>';

    try {
        const resultado = await API.obtenerProductos();
        const productos = Array.isArray(resultado.productos) ? resultado.productos : [];
        window.adminProductos = productos;

        if (!resultado.ok || productos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay productos creados.</td></tr>';
            return;
        }

        tbody.innerHTML = productos.map((producto) => `
            <tr>
                <td>${escapeHtml(producto.nombre)}</td>
                <td>${escapeHtml(producto.categoria)}</td>
                <td>${formatoCOP(producto.precio)}</td>
                <td>${Number(producto.stock || 0)}</td>
                <td>${Number(producto.vendidos || 0)}</td>
                <td>
                    <button type="button" onclick="editarProducto(${producto.id})">Editar</button>
                    <button type="button" onclick="eliminarProductoAdmin(${producto.id})">Eliminar</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6">No se pudo cargar el catálogo admin.</td></tr>';
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

    document.getElementById('producto-id').value = producto.id;
    document.getElementById('producto-nombre').value = producto.nombre || '';
    document.getElementById('producto-categoria').value = producto.categoria || '';
    document.getElementById('producto-precio').value = producto.precio || 0;
    document.getElementById('producto-imagen').value = producto.imagen_url || '';
    document.getElementById('producto-stock').value = producto.stock || 0;
    document.getElementById('producto-descripcion').value = producto.descripcion || '';

    const estado = document.getElementById('productos-estado');
    if (estado) {
        estado.textContent = `Editando: ${producto.nombre}`;
    }
}

async function guardarProductoAdmin() {
    const estado = document.getElementById('productos-estado');
    const adminEmail = sessionStorage.getItem('usuarioEmail');

    const payload = {
        id: document.getElementById('producto-id')?.value?.trim(),
        nombre: document.getElementById('producto-nombre')?.value?.trim(),
        categoria: document.getElementById('producto-categoria')?.value?.trim(),
        precio: document.getElementById('producto-precio')?.value?.trim(),
        imagen_url: document.getElementById('producto-imagen')?.value?.trim(),
        stock: document.getElementById('producto-stock')?.value?.trim(),
        descripcion: document.getElementById('producto-descripcion')?.value?.trim(),
        adminEmail
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
            await cargarProductosAdmin();
            await cargarDashboardAdmin();
        }
    } catch (error) {
        estado.textContent = 'No se pudo guardar el producto.';
    }
}

async function eliminarProductoAdmin(id) {
    const adminEmail = sessionStorage.getItem('usuarioEmail');
    const estado = document.getElementById('productos-estado');

    if (!window.confirm('¿Seguro que deseas eliminar este producto?')) {
        return;
    }

    try {
        const resultado = await API.eliminarProducto(id, adminEmail);
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
        const resultado = await API.obtenerDashboard();
        if (!resultado.ok) {
            return;
        }

        const totalProductos = document.getElementById('metric-total-productos');
        const ventasHoy = document.getElementById('metric-ventas-hoy');
        const ingresosHoy = document.getElementById('metric-ingresos-hoy');
        const listaVentas = document.getElementById('ventas-recientes');

        if (totalProductos) totalProductos.textContent = Number(resultado.totalProductos || 0);
        if (ventasHoy) ventasHoy.textContent = Number(resultado.ventasHoy || 0);
        if (ingresosHoy) ingresosHoy.textContent = formatoCOP(resultado.ingresosHoy || 0);

        renderGraficaVentas(resultado.ventasPorDia || []);

        if (listaVentas) {
            const ventas = Array.isArray(resultado.ventasRecientes) ? resultado.ventasRecientes : [];
            listaVentas.innerHTML = ventas.length
                ? ventas.map((venta) => `
                    <li>
                        <strong>${escapeHtml(venta.producto_nombre)}</strong>
                        <span>${Number(venta.cantidad || 0)} und. · ${formatoCOP(venta.total || 0)} · ${escapeHtml(venta.comprador_nombre || 'Cliente')}</span>
                    </li>
                `).join('')
                : '<li>No hay ventas recientes todavía.</li>';
        }
    } catch (error) {
        console.error('No se pudo cargar el dashboard', error);
    }
}

function logout() {
    sessionStorage.removeItem('auth');
    sessionStorage.removeItem('usuarioNombre');
    sessionStorage.removeItem('usuarioEmail');
    window.location.href = 'index.html';
}
