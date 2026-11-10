(() => {
  "use strict";

  const button = document.querySelector(".sopp-home-float");
  if (!button) return;

  // Le bouton n'apparaît que lorsque l'application est ouverte depuis SOPP Agents.
  const openedFromLibrary =
    new URLSearchParams(window.location.search).get("from") === "sopp-agents";

  if (!openedFromLibrary) return;

  button.style.setProperty("display", "grid", "important");
  button.setAttribute("aria-hidden", "false");
  button.removeAttribute("tabindex");

  const STORAGE_KEY = "sopp-agents-home-button-position-v1";
  const HOLD_DURATION = 1000;
  const MOVE_THRESHOLD = 10;
  const EDGE_PADDING = 8;

  // États visuels uniquement pendant le déplacement : le bouton conserve son design.
  const style = document.createElement("style");
  style.textContent = `
    .sopp-home-float {
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .sopp-home-float img {
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
    }
    .sopp-home-float.is-positioned {
      left: var(--sopp-home-float-left);
      top: var(--sopp-home-float-top);
      right: auto;
      bottom: auto;
      transform: none;
    }
    .sopp-home-float.is-positioned:hover {
      transform: scale(1.045);
    }
    .sopp-home-float.is-dragging,
    .sopp-home-float.is-dragging:hover {
      cursor: grabbing;
      transform: none;
      transition: none;
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
      // Le déplacement reste fonctionnel même si le navigateur bloque le stockage local.
    }
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        setPosition(saved.left, saved.top);
      }
    } catch (error) {
      // Une préférence absente ou illisible laisse le bouton à son emplacement initial.
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
      // Certains navigateurs peuvent refuser la capture ; le clic normal reste disponible.
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
      // Un mouvement avant les 2 secondes correspond à un geste normal, pas à un drag.
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
      // Le navigateur émet le clic juste après pointerup ; on ne bloque que celui-ci.
      window.setTimeout(() => { suppressNextClick = false; }, 0);
    }

    activePointerId = null;
    holdActivated = false;
    pressCancelled = false;
    pressedRect = null;
  }

  button.addEventListener("pointerup", (event) => finishPointer(event));
  button.addEventListener("pointercancel", (event) => finishPointer(event, true));
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
