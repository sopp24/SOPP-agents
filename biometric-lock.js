(() => {
  "use strict";

  const STORAGE_KEY = "sopp-agents-biometric-credential-v1";
  const root = document.documentElement;
  const action = document.getElementById("biometric-lock-action");
  const status = document.getElementById("biometric-lock-status");

  if (!root || !action || !status) return;

  const PLATFORM = navigator.userAgentData?.platform || navigator.platform || "";
  const IS_MAC = /Mac/i.test(PLATFORM) && !(navigator.maxTouchPoints > 1);
  const BIOMETRIC_METHOD = IS_MAC ? "Touch ID" : (/Win/i.test(PLATFORM) ? "Windows Hello" : "Face ID");

  let credentialRecord = readCredential();
  let enrollmentNeeded = false;
  let automaticRequestController = null;

  function readCredential() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && saved.version === 1 && typeof saved.id === "string") return saved;
    } catch (error) {
      // Le stockage sera vérifié de nouveau au moment de l'activation.
    }
    return null;
  }

  function setActionLabel() {
    action.textContent = credentialRecord && !enrollmentNeeded ? `Déverrouiller avec ${BIOMETRIC_METHOD}` : `Activer ${BIOMETRIC_METHOD}`;
  }

  function setLocked() {
    root.classList.add("biometric-locked");
    setActionLabel();
    status.textContent = credentialRecord
      ? "Ta bibliothèque est verrouillée. Authentifie-toi pour continuer."
      : "Première utilisation : active la protection biométrique sur cet appareil.";
  }

  function unlock(message) {
    root.classList.remove("biometric-locked");
    status.textContent = message || "Accès autorisé.";
  }

  function randomChallenge() {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    return challenge;
  }

  function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

  function platformAuthenticatorAvailable() {
    // Vérifie les prérequis sans attendre : la création doit rester dans le clic
    // de l'utilisateur pour que le navigateur puisse ouvrir Touch ID / Face ID.
    return Boolean(window.isSecureContext && navigator.credentials && window.PublicKeyCredential);
  }

  async function activateBiometrics() {
    if (!platformAuthenticatorAvailable()) {
      throw new Error("NO_PLATFORM_AUTHENTICATOR");
    }

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: {
          id: window.location.hostname,
          name: "SOPP Agents"
        },
        user: {
          id: new TextEncoder().encode("sopp-agents-local-user-v1"),
          name: "sopp-agents",
          displayName: "SOPP Agents"
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "none"
      }
    });

    if (!credential || !credential.rawId) {
      throw new Error("EMPTY_CREDENTIAL");
    }

    const newRecord = {
      version: 1,
      id: bufferToBase64Url(credential.rawId)
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newRecord));
    } catch (error) {
      throw new Error("STORAGE_UNAVAILABLE");
    }

    credentialRecord = newRecord;
    enrollmentNeeded = false;
    unlock(`La protection ${BIOMETRIC_METHOD} est activée sur cet appareil.`);
  }

  function completeAuthentication(assertion) {
    if (!assertion || !assertion.rawId || bufferToBase64Url(assertion.rawId) !== credentialRecord.id) {
      throw new Error("CREDENTIAL_MISMATCH");
    }

    // Le bit UV confirme que l’authentificateur a bien effectué une vérification
    // locale de l’utilisateur (Touch ID, Face ID ou mécanisme équivalent).
    const authenticatorData = new Uint8Array(assertion.response.authenticatorData);
    if (authenticatorData.length < 33 || (authenticatorData[32] & 0x04) === 0) {
      throw new Error("USER_VERIFICATION_MISSING");
    }

    unlock(`Accès autorisé avec ${BIOMETRIC_METHOD}. Bienvenue dans SOPP Agents.`);
  }

  function authenticate() {
    if (!platformAuthenticatorAvailable()) {
      return Promise.reject(new Error("NO_PLATFORM_AUTHENTICATOR"));
    }

    // Le clic déclenche directement WebAuthn : la clé déjà créée est ciblée,
    // ce qui ouvre la demande Touch ID de macOS sans passer par un autre choix.
    return navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: window.location.hostname,
        allowCredentials: [{
          type: "public-key",
          id: base64UrlToBuffer(credentialRecord.id)
        }],
        userVerification: "required",
        timeout: 60000
      }
    }).then(completeAuthentication);
  }

  async function readClientCapabilities() {
    if (!window.PublicKeyCredential || typeof window.PublicKeyCredential.getClientCapabilities !== "function") {
      return {};
    }

    try {
      return await window.PublicKeyCredential.getClientCapabilities();
    } catch (error) {
      return {};
    }
  }

  async function startAutomaticAuthentication() {
    if (!credentialRecord) return;

    const capabilities = await readClientCapabilities();
    const uiMode = capabilities.conditionalActiveGet
      ? "active"
      : (capabilities.conditionalPassiveGet ? "passive" : null);

    if (!uiMode) {
      if (IS_MAC) {
        status.textContent = "Ton navigateur ne prend pas encore en charge l’invite Touch ID automatique à l’ouverture. Utilise le bouton « Déverrouiller avec Touch ID » pour lancer la vérification.";
        return;
      }

      // Conserve le comportement Face ID déjà en place sur les appareils
      // où le nouveau mode conditionnel sans formulaire n'est pas disponible.
      try {
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge: randomChallenge(),
            rpId: window.location.hostname,
            allowCredentials: [],
            userVerification: "required",
            timeout: 60000
          }
        });
        completeAuthentication(assertion);
      } catch (error) {
        if (error && error.name !== "AbortError") status.textContent = errorMessage(error);
      }
      return;
    }

    const controller = new AbortController();
    automaticRequestController = controller;
    status.textContent = `Recherche de la clé d’accès ${BIOMETRIC_METHOD}…`;

    try {
      const assertion = await navigator.credentials.get({
        mediation: "conditional",
        uiMode,
        signal: controller.signal,
        publicKey: {
          challenge: randomChallenge(),
          rpId: window.location.hostname,
          allowCredentials: [],
          userVerification: "required",
          timeout: 60000
        }
      });
      completeAuthentication(assertion);
    } catch (error) {
      if (error && error.name !== "AbortError") {
        status.textContent = error && error.name === "NotAllowedError"
          ? `La demande automatique n’a pas abouti. Clique sur « Déverrouiller avec ${BIOMETRIC_METHOD} » pour réessayer.`
          : errorMessage(error);
      }
    } finally {
      if (automaticRequestController === controller) automaticRequestController = null;
    }
  }

  function errorMessage(error) {
    if (error && error.message === "NO_PLATFORM_AUTHENTICATOR") {
      return `L’authentification ${BIOMETRIC_METHOD} n’est pas disponible dans ce navigateur. Sur Mac, vérifie que Touch ID est configuré dans Réglages Système, puis essaie avec Safari ou Chrome en navigation normale.`;
    }
    if (error && error.message === "STORAGE_UNAVAILABLE") {
      return "Le navigateur ne permet pas d’enregistrer la clé de sécurité. Autorise le stockage du site puis réessaie.";
    }
    if (error && error.message === "CREDENTIAL_MISMATCH") {
      return "La clé d’accès renvoyée ne correspond pas à celle enregistrée pour SOPP Agents. Réactive Touch ID sur cet appareil.";
    }
    if (error && error.message === "USER_VERIFICATION_MISSING") {
      return `La vérification ${BIOMETRIC_METHOD} n’a pas été confirmée par l’appareil. Réessaie et valide la demande dans la fenêtre système.`;
    }
    if (error && error.name === "NotAllowedError") {
      return `Vérification ${BIOMETRIC_METHOD} annulée ou expirée. Appuie de nouveau sur le bouton pour réessayer.`;
    }
    if (error && (error.name === "SecurityError" || error.name === "NotSupportedError")) {
      return `La biométrie n’est pas disponible à cette adresse ou dans ce navigateur. Ouvre SOPP Agents depuis son adresse HTTPS officielle et vérifie que ${BIOMETRIC_METHOD} est configuré sur ton appareil.`;
    }
    if (error && error.name === "InvalidStateError") {
      return "Cette clé est déjà enregistrée ou indisponible. Recharge la page et réessaie.";
    }
    return "Impossible de vérifier ton identité. Vérifie la configuration biométrique de ton appareil et réessaie.";
  }

  async function runAuthentication() {
    if (action.disabled) return;

    action.disabled = true;
    action.setAttribute("aria-busy", "true");
    action.textContent = "Vérification en cours…";
    status.textContent = "Confirme ton identité sur ton appareil.";

    try {
      credentialRecord = readCredential();
      if (credentialRecord && !enrollmentNeeded) {
        await authenticate();
      } else {
        await activateBiometrics();
      }
    } catch (error) {
      if (credentialRecord && error && error.name === "NotAllowedError" && !enrollmentNeeded) {
        // Une authentification lancée par clic peut être réessayée ou réinscrite.
        enrollmentNeeded = true;
        status.textContent = `La clé d’accès n’a pas été validée. Clique de nouveau pour enregistrer ${BIOMETRIC_METHOD} sur cet appareil.`;
      } else {
        status.textContent = errorMessage(error);
      }
      setActionLabel();
    } finally {
      action.disabled = false;
      action.removeAttribute("aria-busy");
    }
  }

  action.addEventListener("click", () => {
    // Si la demande passive est encore ouverte, on l'arrête pour donner
    // immédiatement la priorité au déclenchement manuel par clic.
    if (automaticRequestController) {
      automaticRequestController.abort();
      automaticRequestController = null;
    }
    runAuthentication();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") setLocked();
  });

  window.addEventListener("pagehide", setLocked);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) setLocked();
  });

  setLocked();

  // Dès l'ouverture, lance l'invite conditionnelle de passkey lorsque le navigateur
  // la prend en charge. La sélection de la clé déclenche ensuite Touch ID.
  if (credentialRecord) {
    window.addEventListener("load", () => {
      startAutomaticAuthentication();
    }, { once: true });
  }
})();