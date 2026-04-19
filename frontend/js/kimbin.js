function crearImagenKimbin() {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1f3c88';
    ctx.beginPath();
    ctx.arc(90, 90, 86, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 82px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('K', 90, 98);

    return canvas.toDataURL('image/png');
}

async function cargarNotaKimbin() {
    try {
        const response = await fetch('/api/kimbin-note');
        const data = await response.json();
        return data.mensaje || 'Sin nota por ahora.';
    } catch (error) {
        return 'Sin nota por ahora.';
    }
}

async function guardarNotaKimbin() {
    const textarea = document.getElementById('kimbin-mensaje');
    const estado = document.getElementById('kimbin-estado');
    const email = sessionStorage.getItem('usuarioEmail');

    if (!textarea || !email) {
        return;
    }

    const mensaje = textarea.value.trim();

    try {
        const response = await fetch('/api/kimbin-note', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mensaje, email })
        });

        const data = await response.json();
        estado.textContent = data.mensaje;

        if (data.ok) {
            const bubbleText = document.querySelector('.kimbin-bubble p');
            if (bubbleText) {
                bubbleText.textContent = mensaje;
            }
        }
    } catch (error) {
        estado.textContent = 'No se pudo guardar la nota.';
    }
}

function toggleNotaGrupo() {
    const panel = document.getElementById('notaGrupoPanel');
    if (panel) {
        panel.classList.toggle('oculto');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const widget = document.createElement('div');
    widget.className = 'kimbin-widget';
    widget.innerHTML = `
        <button class="kimbin-toggle" type="button" aria-label="Abrir comentario de KIMBIN">
            <img src="assets/kimbin.png" alt="KIMBIN">
        </button>
        <div class="kimbin-bubble visible">
            <h3>KIMBIN</h3>
            <p>Cargando nota...</p>
        </div>
    `;

    document.body.appendChild(widget);

    const toggle = widget.querySelector('.kimbin-toggle');
    const bubble = widget.querySelector('.kimbin-bubble');
    const image = widget.querySelector('img');
    const bubbleText = widget.querySelector('.kimbin-bubble p');
    const notaActual = await cargarNotaKimbin();
    bubbleText.textContent = notaActual;

    const textarea = document.getElementById('kimbin-mensaje');
    if (textarea) {
        textarea.value = notaActual;
    }

    image.addEventListener('error', () => {
        image.src = crearImagenKimbin();
    }, { once: true });

    toggle.addEventListener('click', () => {
        bubble.classList.toggle('visible');
    });
});
