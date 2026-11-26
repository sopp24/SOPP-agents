(() => {
  "use strict";

  // Le bouton est actif uniquement pour les applications ouvertes depuis SOPP Agents.
  const openedFromLibrary =
    new URLSearchParams(window.location.search).get("from") === "sopp-agents";
  if (!openedFromLibrary) return;

  const HUB_URL = "https://sopp24.github.io/SOPP-agents/";
  const LOGO_URL = "https://sopp24.github.io/SOPP-agents/assets/brand-mark.webp";
  const STORAGE_KEY = "sopp-agents-home-button-position-v1";
  const HOLD_DURATION = 700;
  const MOVE_THRESHOLD = 10;
  const EDGE_PADDING = 8;

  // Le script ajoute lui-même le bouton si une application ne fournit pas déjà son lien.
  let button = document.querySelector(".sopp-home-float");
  if (!button) {
    button = document.createElement("a");
    button.className = "sopp-home-float";
    button.href = HUB_URL;
    button.innerHTML = '<img src="' + LOGO_URL + '" alt="" aria-hidden="true">';
    document.body.appendChild(button);
  } else if (!button.querySelector("img")) {
    const image = document.createElement("img");
    image.src = LOGO_URL;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    button.appendChild(image);
  }

  button.href = HUB_URL;
  button.title = "Retour à SOPP Agents · maintenir 0,7 s pour déplacer";
  button.setAttribute("aria-label", "Retour à SOPP Agents. Maintenir 0,7 seconde pour déplacer le bouton.");
  button.setAttribute("aria-hidden", "false");
  button.setAttribute("aria-grabbed", "false");
  button.removeAttribute("tabindex");
  button.style.setProperty("display", "grid", "important");
  button.style.setProperty("visibility", "visible", "important");
  button.style.setProperty("pointer-events", "auto", "important");

  // Une apparence commune, indépendante des styles propres à chaque application.
  const style = document.createElement("style");
  style.textContent = `
    .sopp-home-float {
      position: fixed !important;
      z-index: 99999 !important;
      right: max(14px, env(safe-area-inset-right)) !important;
      bottom: max(14px, env(safe-area-inset-bottom)) !important;
      left: auto !important;
      top: auto !important;
      width: 56px !important;
      height: 56px !important;
      display: grid !important;
      place-items: center !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      border: 1px solid rgba(16,25,30,.14) !important;
      border-radius: 50% !important;
      background: #fff !important;
      box-shadow: 0 8px 28px rgba(0,0,0,.28), 0 2px 7px rgba(0,0,0,.13) !important;
      transform: none !important;
      text-decoration: none !important;
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
      transition: transform .2s ease, box-shadow .2s ease;
    }
    .sopp-home-float img {
      display: block !important;
      width: 78% !important;
      height: 78% !important;
      object-fit: contain !important;
      pointer-events: none !important;
      user-select: none;
      -webkit-user-drag: none;
    }
    .sopp-home-float:hover {
      transform: scale(1.045) !important;
      box-shadow: 0 12px 34px rgba(0,0,0,.34), 0 0 0 5px rgba(255,255,255,.12) !important;
    }
    .sopp-home-float.is-positioned {
      right: auto !important;
      bottom: auto !important;
      left: var(--sopp-home-float-left) !important;
      top: var(--sopp-home-float-top) !important;
      transform: none !important;
    }
    .sopp-home-float.is-positioned:hover {
      transform: scale(1.045) !important;
    }
    .sopp-home-float.is-dragging,
    .sopp-home-float.is-dragging:hover {
      cursor: grabbing;
      transform: none !important;
      transition: none !important;
      box-shadow: 0 10px 30px rgba(0,0,0,.32) !important;
    }
    .sopp-home-float:focus-visible {
      outline: 3px solid #7fd4e8 !important;
      outline-offset: 4px !important;
    }
    @media (max-width: 760px) {
      /* Laisse la place aux barres de navigation inférieures des applications. */
      .sopp-home-float:not(.is-positioned) {
        bottom: calc(86px + env(safe-area-inset-bottom)) !important;
      }
    }
    @media (max-width: 420px) {
      .sopp-home-float { width: 52px !important; height: 52px !important; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sopp-home-float { transition: none !important; }
    }
  `;
  document.head.appendChild(style);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function setPosition(left, top) {
    const rect = button.getBoundingClientRect();
    const maxLeft = Math.max(EDGE_PADDING, window.innerWidth - rect.width - EDGE_PADDING);
    const maxTop = Math.max(EDGE_PADDING, window.innerHeight - rect.height - EDGE_PADDING);
    const safeLeft = clamp(Number.isFinite(left) ? left : rect.left, EDGE_PADDING, maxLeft);
    const safeTop = clamp(Number.isFinite(top) ? top : rect.top, EDGE_PADDING, maxTop);

    button.style.setProperty("--sopp-home-float-left", `${safeLeft}px`);
    button.style.setProperty("--sopp-home-float-top", `${safeTop}px`);
    button.classList.add("is-positioned");
  }

  function persistPosition() {
    if (!button.classList.contains("is-positioned")) return;
    const rect = button.getBoundingClientRect();
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) })
      );
    } catch (error) {
      // Le bouton reste déplaçable même si le stockage local est indisponible.
    }
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        setPosition(saved.left, saved.top);
      }
    } catch (error) {
      // Une préférence absente ou illisible laisse le bouton en bas à droite.
    }
  }

  restorePosition();

  let activePointerId = null;
  let holdTimer = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;
  let pressedRect = null;
  let holdActivated = false;
  let pressCancelled = false;
  let suppressNextClick = false;

  button.addEventListener("pointerdown", (event) => {
    if (activePointerId !== null || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    activePointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pressedRect = button.getBoundingClientRect();
    pointerOffsetX = pointerStartX - pressedRect.left;
    pointerOffsetY = pointerStartY - pressedRect.top;
    holdActivated = false;
    pressCancelled = false;
    suppressNextClick = false;

    try {
      button.setPointerCapture(event.pointerId);
    } catch (error) {
      // Le clic normal reste disponible si la capture n'est pas prise en charge.
    }

    holdTimer = window.setTimeout(() => {
      if (activePointerId !== event.pointerId || pressCancelled) return;
      holdActivated = true;
      setPosition(pressedRect.left, pressedRect.top);
      button.classList.add("is-dragging");
      button.setAttribute("aria-grabbed", "true");
    }, HOLD_DURATION);
  });

  button.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointerId) return;

    const deltaX = event.clientX - pointerStartX;
    const deltaY = event.clientY - pointerStartY;

    if (!holdActivated) {
      // Un déplacement trop important avant 0,7 s annule le maintien, pas le clic.
      if (Math.hypot(deltaX, deltaY) > MOVE_THRESHOLD) {
        pressCancelled = true;
        window.clearTimeout(holdTimer);
      }
      return;
    }

    event.preventDefault();
    setPosition(event.clientX - pointerOffsetX, event.clientY - pointerOffsetY);
  }, { passive: false });

  function finishPointer(event, cancelled = false) {
    if (event.pointerId !== activePointerId) return;
    window.clearTimeout(holdTimer);

    if (holdActivated) {
      persistPosition();
      button.classList.remove("is-dragging");
      button.setAttribute("aria-grabbed", "false");
    }

    if (!cancelled && (holdActivated || pressCancelled)) {
      suppressNextClick = true;
      window.setTimeout(() => { suppressNextClick = false; }, 0);
    }

    activePointerId = null;
    holdActivated = false;
    pressCancelled = false;
    pressedRect = null;
  }

  button.addEventListener("pointerup", (event) => finishPointer(event));
  button.addEventListener("pointercancel", (event) => finishPointer(event, true));
  button.addEventListener("lostpointercapture", (event) => finishPointer(event, true));
  button.addEventListener("dragstart", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  });

  window.addEventListener("resize", () => {
    if (!button.classList.contains("is-positioned")) return;
    const rect = button.getBoundingClientRect();
    setPosition(rect.left, rect.top);
    persistPosition();
  });
})();
