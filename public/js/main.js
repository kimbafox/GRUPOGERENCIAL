const API = "";

const codigoInput = document.getElementById("codigo");
const entrarBtn = document.getElementById("entrar-btn");
const scanBtn = document.getElementById("scan-btn");
const closeScanBtn = document.getElementById("close-scan");
const duenoBtn = document.getElementById("dueno-btn");
const scanStatus = document.getElementById("scan-status");
const scanner = document.getElementById("scanner");
const scannerReader = document.getElementById("scanner-reader");
const helpToggleBtn = document.getElementById("help-toggle");
const helpOverlay = document.getElementById("help-overlay");
const helpTargets = Array.from(document.querySelectorAll("[data-help-text]"));

let qrScanner;
let scanning = false;
let helpVisible = false;

function obtenerCodigoDesdeQR(rawValue) {
  if (!rawValue) {
    return "";
  }

  try {
    const url = new URL(rawValue, window.location.origin);
    return url.searchParams.get("mesa") || rawValue;
  } catch (_error) {
    return rawValue;
  }
}

async function validarMesa(codigo) {
  const limpio = codigo.trim().toUpperCase();
  if (!limpio) {
    throw new Error("Ingresa un codigo de mesa");
  }

  const res = await fetch(`${API}/mesas/codigo/${encodeURIComponent(limpio)}`);
  if (!res.ok) {
    throw new Error("El codigo de mesa no existe");
  }

  return limpio;
}

async function entrarAlMenu() {
  try {
    const codigo = await validarMesa(codigoInput.value);
    window.location = `cliente.html?mesa=${encodeURIComponent(codigo)}`;
  } catch (error) {
    scanStatus.textContent = error.message;
  }
}

async function detenerEscaner() {
  scanning = false;
  scanner.classList.add("hidden");

  if (qrScanner) {
    try {
      await qrScanner.stop();
    } catch (_error) {
      // Ignora cierres dobles o estados intermedios del lector.
    }

    try {
      await qrScanner.clear();
    } catch (_error) {
      // Ignora limpieza redundante del contenedor.
    }

    qrScanner = null;
  }

  scannerReader.innerHTML = "";
}

async function procesarLecturaQR(decodedText) {
  if (!scanning) {
    return;
  }

  try {
    const codigo = obtenerCodigoDesdeQR(decodedText).trim().toUpperCase();
    if (codigo) {
      codigoInput.value = codigo;
      scanStatus.textContent = "QR detectado. Entrando al menu...";
      await detenerEscaner();
      await entrarAlMenu();
    }
  } catch (error) {
    scanStatus.textContent = error.message || "No se pudo procesar el QR.";
  }
}

async function iniciarCamara(config) {
  qrScanner = new Html5Qrcode("scanner-reader");
  await qrScanner.start(
    config,
    {
      fps: 10,
      qrbox: { width: 240, height: 240 },
      aspectRatio: 1
    },
    decodedText => {
      void procesarLecturaQR(decodedText);
    },
    () => {}
  );
}

async function iniciarEscaner() {
  if (scanning) {
    return;
  }

  scanStatus.textContent = "";

  if (!("Html5Qrcode" in window)) {
    scanStatus.textContent = "No se cargo el lector QR. Recarga la pagina o usa el codigo de mesa.";
    return;
  }

  scanner.classList.remove("hidden");
  scanStatus.textContent = "Abriendo camara...";

  try {
    await iniciarCamara({ facingMode: { exact: "environment" } });
    scanning = true;
    scanStatus.textContent = "Camara lista. Apunta al QR de tu mesa.";
  } catch (_primaryError) {
    try {
      await detenerEscaner();
      scanner.classList.remove("hidden");
      await iniciarCamara({ facingMode: "environment" });
      scanning = true;
      scanStatus.textContent = "Camara lista. Apunta al QR de tu mesa.";
    } catch (_fallbackError) {
      await detenerEscaner();
      scanStatus.textContent = "No se pudo abrir la camara. Revisa permisos o usa el codigo de mesa.";
    }
  }
}

function limpiarAyuda() {
  helpOverlay.innerHTML = "";
  helpTargets.forEach(target => target.classList.remove("help-highlight"));
}

function limitar(valor, min, max) {
  return Math.min(Math.max(valor, min), max);
}

function renderizarAyuda() {
  limpiarAyuda();

  const overlayWidth = 228;

  helpTargets.forEach(target => {
    const rect = target.getBoundingClientRect();
    const mostrarArriba = rect.top > window.innerHeight * 0.45;
    const bubbleTop = mostrarArriba ? rect.top - 94 : rect.bottom + 16;
    const bubbleLeft = limitar(rect.left + (rect.width / 2) - (overlayWidth / 2), 16, window.innerWidth - overlayWidth - 16);
    const arrowLeft = limitar(rect.left + (rect.width / 2) - bubbleLeft, 26, overlayWidth - 26);
    const bubble = document.createElement("div");

    bubble.className = `help-callout ${mostrarArriba ? "top" : "bottom"}`;
    bubble.style.top = `${bubbleTop}px`;
    bubble.style.left = `${bubbleLeft}px`;
    bubble.style.setProperty("--arrow-left", `${arrowLeft}px`);
    bubble.textContent = target.dataset.helpText || "";

    helpOverlay.appendChild(bubble);
    target.classList.add("help-highlight");
  });
}

function actualizarAyuda() {
  if (!helpVisible) {
    return;
  }

  renderizarAyuda();
}

function toggleAyuda() {
  helpVisible = !helpVisible;
  helpOverlay.classList.toggle("hidden", !helpVisible);
  helpToggleBtn.setAttribute("aria-pressed", String(helpVisible));
  helpToggleBtn.textContent = helpVisible ? "Ocultar ayuda" : "Ayuda";
  helpOverlay.setAttribute("aria-hidden", String(!helpVisible));

  if (helpVisible) {
    renderizarAyuda();
    return;
  }

  limpiarAyuda();
}

entrarBtn.addEventListener("click", entrarAlMenu);
codigoInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    entrarAlMenu();
  }
});
scanBtn.addEventListener("click", () => {
  void iniciarEscaner();
});
closeScanBtn.addEventListener("click", () => {
  void detenerEscaner();
});
duenoBtn.addEventListener("click", () => {
  window.location = "dueno.html";
});
helpToggleBtn.addEventListener("click", toggleAyuda);
window.addEventListener("resize", actualizarAyuda);
window.addEventListener("scroll", actualizarAyuda, { passive: true });