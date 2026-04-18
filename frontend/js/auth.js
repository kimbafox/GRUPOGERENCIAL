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

function logout() {
    sessionStorage.removeItem('auth');
    sessionStorage.removeItem('usuarioNombre');
    sessionStorage.removeItem('usuarioEmail');
    window.location.href = 'index.html';
}
