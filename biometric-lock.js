(() => {
  "use strict";

  // Adresse du Worker d'authentification `sopp-agents-auth` (voir cloudflare-auth/).
  // Vide : mode local (par défaut) — la clé biométrique est créée et vérifiée sur
  // l'appareil. Renseignée : la signature est vérifiée par le Worker, qui délivre le
  // jeton d'accès aux applications (c'est le seul mode réellement infalsifiable).
  const AUTH_URL = "";

  const STORAGE_KEY = "sopp-agents-biometric-credential-v1";
  const ACCESS_KEY = "soppAgentsAccess.v1";
  const LOCAL_ACCESS_MS = 8 * 60 * 60 * 1000;
  const SERVER_MODE = AUTH_URL !== "";
  const API = AUTH_URL.replace(/\/+$/, "");

  const root = document.documentElement;
  const action = document.getElementById("biometric-lock-action");
  const status = document.getElementById("biometric-lock-status");
  const codeInput = document.getElementById("biometric-lock-code");
  const enrollLink = document.getElementById("biometric-lock-enroll");

  if (!root || !action || !status) return;

  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const isMacDesktop = /Mac/i.test(platform) && navigator.maxTouchPoints <= 1;
  const isWindowsDesktop = /Win/i.test(platform);
  const BIOMETRIC_METHOD = isMacDesktop
    ? "Touch ID"
    : (isWindowsDesktop ? "Windows Hello" : "Face ID");

  let credentialRecord = readCredential();
  let enrollmentNeeded = false;
  let userBusy = false;
  let activeController = null;
  // Après un échec de la création « stricte », le clic suivant utilise un mode compatible.
  let relaxedEnrollment = false;
  // Après l'échec de la clé enregistrée, le clic suivant ouvre la liste des clés d'accès du site.
  let useDiscoverable = false;
  // Mode serveur : saisie du code d'inscription, puis création de la clé en deux clics.
  let serverEnrollment = null; // { challengeId, options, code }
  let enrollmentRequested = false;
  let prefetched = null; // Promise<{ challengeId, options, at } | null>

  /* ---------- Utilitaires ---------- */

  function readCredential() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && saved.version === 1 && typeof saved.id === "string") return saved;
    } catch (error) {
      // Le stockage sera vérifié lors de l'enregistrement.
    }
    return null;
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    return bytes;
  }

  function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return window.btoa(binary)
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/g, "");
  }

  function base64UrlToBuffer(value) {
    let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  function checkWebAuthnSupport() {
    if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
      throw new Error("WEBAUTHN_UNAVAILABLE");
    }
  }

  function userVerified(response) {
    const data = new Uint8Array(response.authenticatorData);
    return data.length >= 33 && (data[32] & 0x04) !== 0;
  }

  /* ---------- Jeton d'accès transmis aux applications ---------- */

  function storeAccess(token, expiresAt) {
    const record = JSON.stringify({ v: 1, t: token, e: expiresAt, a: Date.now() });
    try { window.sessionStorage.setItem(ACCESS_KEY, record); } catch (error) { /* stockage indisponible */ }
    try { window.localStorage.setItem(ACCESS_KEY, record); } catch (error) { /* stockage indisponible */ }
  }

  function issueLocalAccess() {
    storeAccess("local." + bufferToBase64Url(randomBytes(24)), Date.now() + LOCAL_ACCESS_MS);
  }

  /* ---------- Interface ---------- */

  function setActionLabel() {
    if (SERVER_MODE && enrollmentRequested) {
      action.textContent = serverEnrollment
        ? `Créer la clé ${BIOMETRIC_METHOD}`
        : "Valider le code";
      return;
    }
    const known = SERVER_MODE ? !enrollmentNeeded : (credentialRecord && !enrollmentNeeded);
    action.textContent = known
      ? `Déverrouiller avec ${BIOMETRIC_METHOD}`
      : `Activer ${BIOMETRIC_METHOD}`;
  }

  function showEnrollmentUi(visible) {
    if (codeInput) codeInput.hidden = !(visible && !serverEnrollment);
    if (enrollLink) enrollLink.hidden = !SERVER_MODE || visible;
  }

  function setLocked() {
    root.classList.add("biometric-locked");
    setActionLabel();
    if (SERVER_MODE) {
      status.textContent = "Ta bibliothèque est verrouillée. Authentifie-toi pour continuer.";
    } else {
      status.textContent = credentialRecord
        ? "Ta bibliothèque est verrouillée. Authentifie-toi pour continuer."
        : "Première utilisation : active la protection biométrique sur cet appareil.";
    }
  }

  function unlock(message) {
    root.classList.remove("biometric-locked");
    status.textContent = message || "Accès autorisé.";
  }

  /* ---------- Requêtes WebAuthn : une seule à la fois ---------- */

  function beginRequest() {
    // Une demande déjà ouverte (par ex. la demande automatique au chargement) est annulée :
    // deux requêtes WebAuthn simultanées font échouer la seconde avec une AbortError.
    if (activeController) activeController.abort();
    activeController = new AbortController();
    return activeController;
  }

  /* ---------- Mode local ---------- */

  function createLocalCredential(signal) {
    // Aucun await avant cet appel : le navigateur conserve le geste utilisateur.
    const relaxed = relaxedEnrollment;
    return navigator.credentials.create({
      signal,
      publicKey: {
        challenge: randomBytes(32),
        rp: { id: window.location.hostname, name: "SOPP Agents" },
        // Identifiant aléatoire par appareil : Face ID (iPhone) et Touch ID (Mac) ne s'écrasent
        // plus dans le trousseau iCloud, qui remplace une passkey de même site et de même utilisateur.
        user: {
          id: randomBytes(16),
          name: "sopp-agents",
          displayName: `SOPP Agents · ${BIOMETRIC_METHOD}`
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 }
        ],
        authenticatorSelection: relaxed
          ? { residentKey: "preferred", userVerification: "required" }
          : { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
        timeout: 120000,
        attestation: "none"
      }
    });
  }

  async function activateLocal(signal) {
    checkWebAuthnSupport();
    const credential = await createLocalCredential(signal);
    if (!credential || !credential.rawId) throw new Error("EMPTY_CREDENTIAL");

    const newRecord = { version: 1, id: bufferToBase64Url(credential.rawId) };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newRecord));
    } catch (error) {
      throw new Error("STORAGE_UNAVAILABLE");
    }

    credentialRecord = newRecord;
    enrollmentNeeded = false;
    relaxedEnrollment = false;
    useDiscoverable = false;
    issueLocalAccess();
    unlock(`La clé ${BIOMETRIC_METHOD} est créée. Ta bibliothèque est déverrouillée.`);
    setActionLabel();
  }

  function requestLocalAssertion(signal) {
    const publicKey = {
      challenge: randomBytes(32),
      rpId: window.location.hostname,
      userVerification: "required",
      timeout: 120000
    };
    if (credentialRecord && !useDiscoverable) {
      publicKey.allowCredentials = [{
        type: "public-key",
        id: base64UrlToBuffer(credentialRecord.id),
        transports: ["internal"]
      }];
    }
    return navigator.credentials.get({ signal, publicKey });
  }

  async function authenticateLocal(signal) {
    checkWebAuthnSupport();
    if (!credentialRecord) throw new Error("CREDENTIAL_MISSING");

    const assertion = await requestLocalAssertion(signal);
    if (!assertion || !assertion.rawId) throw new Error("EMPTY_CREDENTIAL");

    const returnedId = bufferToBase64Url(assertion.rawId);
    if (!useDiscoverable && returnedId !== credentialRecord.id) throw new Error("CREDENTIAL_MISMATCH");
    if (!userVerified(assertion.response)) throw new Error("USER_VERIFICATION_MISSING");

    if (useDiscoverable) {
      // Clé choisie dans la liste des passkeys du site : on la mémorise pour cet appareil.
      credentialRecord = { version: 1, id: returnedId };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credentialRecord)); } catch (error) { /* ignoré */ }
      useDiscoverable = false;
    }
    issueLocalAccess();
    unlock(`Accès autorisé avec ${BIOMETRIC_METHOD}. Bienvenue dans SOPP Agents.`);
  }

  /* ---------- Mode serveur (Worker sopp-agents-auth) ---------- */

  async function api(path, { body, code } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (code) headers["X-Enrollment-Code"] = code;
    let response;
    try {
      response = await window.fetch(API + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body || {}),
        cache: "no-store"
      });
    } catch (error) {
      throw new Error("SERVER_UNREACHABLE");
    }
    let data = null;
    try { data = await response.json(); } catch (error) { /* corps vide */ }
    if (!response.ok) {
      const failure = new Error((data && data.error) || "SERVER_ERROR");
      failure.status = response.status;
      throw failure;
    }
    return data;
  }

  function decodeDescriptors(list) {
    return (list || []).map(item => ({ ...item, id: base64UrlToBuffer(item.id) }));
  }

  function encodeCredential(credential) {
    const response = credential.response;
    const out = {
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
      authenticatorAttachment: credential.authenticatorAttachment || undefined,
      response: { clientDataJSON: bufferToBase64Url(response.clientDataJSON) }
    };
    if (response.attestationObject) {
      out.response.attestationObject = bufferToBase64Url(response.attestationObject);
      out.response.transports = response.getTransports ? response.getTransports() : [];
    } else {
      out.response.authenticatorData = bufferToBase64Url(response.authenticatorData);
      out.response.signature = bufferToBase64Url(response.signature);
      out.response.userHandle = response.userHandle ? bufferToBase64Url(response.userHandle) : undefined;
    }
    return out;
  }

  async function fetchAuthOptions() {
    const data = await api("/auth/options");
    return { challengeId: data.challengeId, options: data.options, at: Date.now() };
  }

  function prefetchAuthOptions() {
    if (!SERVER_MODE) return Promise.resolve(null);
    // Le défi est valable 5 minutes ; il est récupéré à l'avance pour que l'appel WebAuthn
    // reste dans le geste de l'utilisateur.
    prefetched = fetchAuthOptions().catch(error => {
      if (error.message === "NOT_ENROLLED") {
        enrollmentNeeded = true;
        setActionLabel();
      }
      return null;
    });
    return prefetched;
  }

  async function takeAuthOptions() {
    let entry = prefetched ? await prefetched : null;
    prefetched = null;
    if (!entry || Date.now() - entry.at > 4 * 60 * 1000) entry = await fetchAuthOptions();
    return entry;
  }

  async function authenticateServer(signal) {
    checkWebAuthnSupport();
    const { challengeId, options } = await takeAuthOptions();
    const assertion = await navigator.credentials.get({
      signal,
      publicKey: {
        challenge: base64UrlToBuffer(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: "required",
        allowCredentials: decodeDescriptors(options.allowCredentials)
      }
    });
    if (!assertion) throw new Error("EMPTY_CREDENTIAL");
    const session = await api("/auth/verify", { body: { challengeId, response: encodeCredential(assertion) } });
    storeAccess(session.token, Date.now() + session.expiresIn * 1000);
    unlock(`Accès autorisé avec ${BIOMETRIC_METHOD}. Bienvenue dans SOPP Agents.`);
  }

  async function prepareServerEnrollment() {
    const code = codeInput ? codeInput.value.trim() : "";
    if (!code) throw new Error("CODE_REQUIRED");
    const data = await api("/register/options", { code });
    serverEnrollment = { challengeId: data.challengeId, options: data.options, code };
    if (codeInput) { codeInput.value = ""; codeInput.hidden = true; }
    status.textContent = `Code accepté. Crée maintenant ta clé d’accès avec ${BIOMETRIC_METHOD}.`;
    setActionLabel();
  }

  async function finishServerEnrollment(signal) {
    checkWebAuthnSupport();
    const { challengeId, options, code } = serverEnrollment;
    const relaxed = relaxedEnrollment;
    // Appel direct à create() depuis le clic, sans attente préalable.
    const credential = await navigator.credentials.create({
      signal,
      publicKey: {
        challenge: base64UrlToBuffer(options.challenge),
        rp: options.rp,
        user: { ...options.user, id: base64UrlToBuffer(options.user.id) },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        attestation: "none",
        excludeCredentials: decodeDescriptors(options.excludeCredentials),
        authenticatorSelection: relaxed
          ? { residentKey: "preferred", userVerification: "required" }
          : options.authenticatorSelection
      }
    });
    if (!credential) throw new Error("EMPTY_CREDENTIAL");
    await api("/register/verify", { code, body: { challengeId, response: encodeCredential(credential) } });
    serverEnrollment = null;
    enrollmentRequested = false;
    enrollmentNeeded = false;
    relaxedEnrollment = false;
    showEnrollmentUi(false);
    status.textContent = `Clé ${BIOMETRIC_METHOD} enregistrée. Authentifie-toi pour entrer.`;
    setActionLabel();
    prefetchAuthOptions();
  }

  /* ---------- Messages d'erreur ---------- */

  function errorMessage(error) {
    const code = error && error.message;
    if (code === "WEBAUTHN_UNAVAILABLE") {
      return "L’authentification biométrique n’est pas disponible ici. Ouvre SOPP Agents depuis son adresse HTTPS officielle.";
    }
    if (code === "STORAGE_UNAVAILABLE") {
      return "Le navigateur ne permet pas d’enregistrer la clé. Autorise le stockage du site puis réessaie.";
    }
    if (code === "CREDENTIAL_MISMATCH") {
      return `La clé enregistrée ne correspond plus. Clique sur « Activer ${BIOMETRIC_METHOD} » pour en créer une nouvelle.`;
    }
    if (code === "USER_VERIFICATION_MISSING") {
      return `La vérification ${BIOMETRIC_METHOD} n’a pas été confirmée par l’appareil. Réessaie.`;
    }
    if (code === "SERVER_UNREACHABLE") {
      return "Le service d’authentification est injoignable. Vérifie ta connexion puis réessaie.";
    }
    if (code === "CODE_REQUIRED" || code === "INVALID_ENROLLMENT_CODE") {
      return "Code d’inscription requis ou incorrect.";
    }
    if (code === "TOO_MANY_DEVICES") {
      return "Le nombre maximal d’appareils enregistrés est atteint.";
    }
    if (code === "RATE_LIMITED") {
      return "Trop de tentatives. Patiente quelques minutes avant de réessayer.";
    }
    if (code === "NOT_ENROLLED") {
      return "Aucun appareil n’est encore enregistré. Utilise « Ajouter cet appareil » avec ton code d’inscription.";
    }
    if (error && error.name === "NotAllowedError") {
      return useDiscoverable
        ? `La demande ${BIOMETRIC_METHOD} a été annulée ou a expiré. Réessaie : la liste des clés d’accès de SOPP Agents va s’ouvrir.`
        : `La demande ${BIOMETRIC_METHOD} a été annulée ou a expiré. Réessaie.`;
    }
    if (error && error.name === "AbortError") {
      return relaxedEnrollment
        ? `La demande ${BIOMETRIC_METHOD} a été interrompue par le navigateur. Réessaie : un mode compatible sera utilisé.`
        : `La demande ${BIOMETRIC_METHOD} a été interrompue. Réessaie.`;
    }
    if (error && error.name === "ConstraintError") {
      return `L’appareil ne peut pas créer une clé biométrique répondant aux exigences demandées. Vérifie la configuration de ${BIOMETRIC_METHOD}. Un mode compatible sera essayé au prochain clic.`;
    }
    if (error && error.name === "NotSupportedError") {
      return "Ce navigateur ne prend pas en charge ce type de clé d’accès. Un mode compatible sera essayé au prochain clic.";
    }
    if (error && error.name === "SecurityError") {
      return `Le navigateur refuse l’adresse WebAuthn (${window.location.hostname}). Utilise https://sopp24.github.io/SOPP-agents/.`;
    }
    if (error && error.name === "InvalidStateError") {
      return "Une clé existe déjà pour ce site sur cet appareil. Recharge la page et réessaie de la retrouver.";
    }

    const name = error && error.name ? error.name : "Erreur inconnue";
    const detail = error && error.message ? error.message : "aucun détail fourni";
    return `Échec de l’authentification (${name}) : ${detail}.`;
  }

  // Quelles erreurs justifient un essai en mode compatible au clic suivant.
  function isCompatibilityError(error) {
    const name = error && error.name;
    return name === "ConstraintError" || name === "NotSupportedError" || name === "AbortError" || name === "NotAllowedError";
  }

  /* ---------- Action du bouton ---------- */

  async function runAuthentication() {
    if (userBusy) return;

    userBusy = true;
    action.disabled = true;
    action.setAttribute("aria-busy", "true");
    // Annule une éventuelle demande automatique encore ouverte, puis prend la main.
    const controller = beginRequest();
    const { signal } = controller;

    let creating = false;
    try {
      credentialRecord = readCredential();

      if (SERVER_MODE) {
        if (enrollmentRequested && !serverEnrollment) {
          action.textContent = "Vérification du code…";
          await prepareServerEnrollment();
        } else if (enrollmentRequested && serverEnrollment) {
          creating = true;
          action.textContent = "Création de la clé…";
          status.textContent = `Crée ta clé d’accès avec ${BIOMETRIC_METHOD}.`;
          await finishServerEnrollment(signal);
        } else {
          action.textContent = "Vérification en cours…";
          status.textContent = `Confirme ton identité avec ${BIOMETRIC_METHOD}.`;
          await authenticateServer(signal);
        }
      } else if (credentialRecord && !enrollmentNeeded) {
        action.textContent = "Vérification en cours…";
        status.textContent = `Confirme ton identité avec ${BIOMETRIC_METHOD}.`;
        await authenticateLocal(signal);
      } else {
        creating = true;
        action.textContent = "Création de la clé…";
        status.textContent = `Crée ta clé d’accès avec ${BIOMETRIC_METHOD}.`;
        // Aucun await ni test asynchrone avant cet appel : le navigateur
        // conserve ainsi le geste utilisateur nécessaire à l'inscription.
        await activateLocal(signal);
      }
    } catch (error) {
      if (controller !== activeController) return;
      if (!SERVER_MODE && credentialRecord && error && error.message === "CREDENTIAL_MISMATCH") {
        enrollmentNeeded = true;
      }
      if (creating && isCompatibilityError(error) && !relaxedEnrollment) {
        relaxedEnrollment = true;
      } else if (!creating && !SERVER_MODE && credentialRecord && !useDiscoverable &&
                 error && error.name === "NotAllowedError") {
        // Clé enregistrée introuvable (par ex. remplacée par une autre) : au clic suivant,
        // le navigateur propose toutes les passkeys du site.
        useDiscoverable = true;
      }
      if (error && error.message === "NOT_ENROLLED") enrollmentNeeded = true;
      status.textContent = errorMessage(error);
      setActionLabel();
      // Nouveau défi prêt pour le clic suivant (le défi précédent est à usage unique).
      if (SERVER_MODE && !enrollmentRequested) prefetchAuthOptions();
    } finally {
      if (controller === activeController) activeController = null;
      userBusy = false;
      action.disabled = false;
      action.removeAttribute("aria-busy");
      if (/…$/.test(action.textContent)) setActionLabel();
    }
  }

  action.addEventListener("click", runAuthentication);

  if (enrollLink) {
    enrollLink.addEventListener("click", () => {
      enrollmentRequested = true;
      serverEnrollment = null;
      showEnrollmentUi(true);
      status.textContent = "Saisis ton code d’inscription pour ajouter cet appareil.";
      setActionLabel();
      if (codeInput) codeInput.focus();
    });
  }

  if (codeInput) {
    codeInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        runAuthentication();
      }
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && !userBusy) setLocked();
  });

  window.addEventListener("pagehide", setLocked);
  window.addEventListener("pageshow", event => {
    if (event.persisted) setLocked();
  });

  setLocked();
  showEnrollmentUi(false);

  // Au retour sur le site, déclenche directement la même demande biométrique
  // que Face ID sur mobile, ou Touch ID sur un Mac de bureau. Un clic sur le bouton
  // annule cette demande automatique et la remplace.
  function autoAuthenticate() {
    const controller = beginRequest();
    const run = SERVER_MODE ? authenticateServer(controller.signal) : authenticateLocal(controller.signal);
    run.catch(error => {
      if (controller !== activeController) return;
      activeController = null;
      if (SERVER_MODE) prefetchAuthOptions();
      if (error && (error.name === "AbortError" || error.name === "NotAllowedError")) {
        status.textContent = `Déverrouille avec le bouton si la demande ${BIOMETRIC_METHOD} ne s’ouvre pas automatiquement.`;
      } else if (error && error.message !== "NOT_ENROLLED") {
        status.textContent = errorMessage(error);
      }
    });
  }

  if (SERVER_MODE) {
    prefetchAuthOptions().then(entry => {
      if (entry && document.visibilityState === "visible") autoAuthenticate();
    });
  } else if (credentialRecord) {
    window.addEventListener("load", () => {
      if (document.visibilityState === "visible") autoAuthenticate();
    }, { once: true });
  }
})();
