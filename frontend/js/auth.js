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

function logout() {
    sessionStorage.removeItem('auth');
    sessionStorage.removeItem('usuarioNombre');
    sessionStorage.removeItem('usuarioEmail');
    window.location.href = 'index.html';
}
