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

document.addEventListener('DOMContentLoaded', iniciarCarruselPromos);
