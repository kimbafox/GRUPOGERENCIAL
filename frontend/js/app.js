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
