(() => {
  "use strict";

  const STORAGE_KEY = "sopp-agents-biometric-credential-v1";
  const root = document.documentElement;
  const action = document.getElementById("biometric-lock-action");
  const status = document.getElementById("biometric-lock-status");

  if (!root || !action || !status) return;

  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const isMacDesktop = /Mac/i.test(platform) && navigator.maxTouchPoints <= 1;
  const isWindowsDesktop = /Win/i.test(platform);
  const BIOMETRIC_METHOD = isMacDesktop
    ? "Touch ID"
    : (isWindowsDesktop ? "Windows Hello" : "Face ID");

  let credentialRecord = readCredential();
  let enrollmentNeeded = false;
  let authenticationInProgress = false;

  function readCredential() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && saved.version === 1 && typeof saved.id === "string") return saved;
    } catch (error) {
      // Le stockage sera vérifié lors de l'enregistrement.
    }
    return null;
  }

  function setActionLabel() {
    action.textContent = credentialRecord && !enrollmentNeeded
      ? `Déverrouiller avec ${BIOMETRIC_METHOD}`
      : `Activer ${BIOMETRIC_METHOD}`;
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

  async function activateBiometrics() {
    checkWebAuthnSupport();

    // Appel direct à navigator.credentials.create() depuis le clic :
    // Face ID sur mobile, Touch ID sur Mac, Windows Hello sur PC.
    const creationRequest = navigator.credentials.create({
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
          requireResidentKey: true,
          userVerification: "required"
        },
        timeout: 120000,
        attestation: "none"
      }
    });

    const credential = await creationRequest;
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
    unlock(`La clé ${BIOMETRIC_METHOD} est créée. Ta bibliothèque est déverrouillée.`);
    setActionLabel();
  }

  function authenticate() {
    checkWebAuthnSupport();

    if (!credentialRecord) {
      return Promise.reject(new Error("CREDENTIAL_MISSING"));
    }

    // Même mécanisme que Face ID : on cible directement la clé créée sur
    // cet appareil et on demande la vérification biométrique de la plateforme.
    const authenticationRequest = navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: window.location.hostname,
        allowCredentials: [{
          type: "public-key",
          id: base64UrlToBuffer(credentialRecord.id)
        }],
        userVerification: "required",
        timeout: 120000
      }
    });

    return authenticationRequest.then(assertion => {
      if (!assertion || !assertion.rawId ||
          bufferToBase64Url(assertion.rawId) !== credentialRecord.id) {
        throw new Error("CREDENTIAL_MISMATCH");
      }

      const authenticatorData = new Uint8Array(assertion.response.authenticatorData);
      if (authenticatorData.length < 33 || (authenticatorData[32] & 0x04) === 0) {
        throw new Error("USER_VERIFICATION_MISSING");
      }

      unlock(`Accès autorisé avec ${BIOMETRIC_METHOD}. Bienvenue dans SOPP Agents.`);
    });
  }

  function errorMessage(error) {
    if (error && error.message === "WEBAUTHN_UNAVAILABLE") {
      return "L’authentification biométrique n’est pas disponible ici. Ouvre SOPP Agents depuis son adresse HTTPS officielle.";
    }
    if (error && error.message === "STORAGE_UNAVAILABLE") {
      return "Le navigateur ne permet pas d’enregistrer la clé. Autorise le stockage du site puis réessaie.";
    }
    if (error && error.message === "CREDENTIAL_MISMATCH") {
      return `La clé enregistrée ne correspond plus. Clique sur « Activer ${BIOMETRIC_METHOD} » pour en créer une nouvelle.`;
    }
    if (error && error.message === "USER_VERIFICATION_MISSING") {
      return `La vérification ${BIOMETRIC_METHOD} n’a pas été confirmée par l’appareil. Réessaie.`;
    }
    if (error && error.name === "NotAllowedError") {
      return `La demande ${BIOMETRIC_METHOD} a été annulée ou a expiré. Réessaie.`;
    }
    if (error && error.name === "AbortError") {
      return `Chrome/macOS a interrompu la demande ${BIOMETRIC_METHOD}. Vérifie que Touch ID fonctionne dans macOS, puis relance l’activation.`;
    }
    if (error && error.name === "ConstraintError") {
      return `L’appareil ne peut pas créer une clé biométrique répondant aux exigences demandées. Vérifie la configuration de ${BIOMETRIC_METHOD}.`;
    }
    if (error && error.name === "SecurityError") {
      return `Le navigateur refuse l’adresse WebAuthn (${window.location.hostname}). Utilise https://sopp24.github.io/SOPP-agents/.`;
    }
    if (error && error.name === "InvalidStateError") {
      return "Une clé existe déjà dans le gestionnaire de passkeys. Recharge la page et réessaie de la retrouver.";
    }

    const name = error && error.name ? error.name : "Erreur inconnue";
    const detail = error && error.message ? error.message : "aucun détail fourni";
    return `Échec de l’authentification (${name}) : ${detail}.`;
  }

  async function runAuthentication() {
    if (action.disabled || authenticationInProgress) return;

    authenticationInProgress = true;
    action.disabled = true;
    action.setAttribute("aria-busy", "true");

    try {
      credentialRecord = readCredential();

      if (credentialRecord && !enrollmentNeeded) {
        action.textContent = "Vérification en cours…";
        status.textContent = `Confirme ton identité avec ${BIOMETRIC_METHOD}.`;
        await authenticate();
      } else {
        action.textContent = "Création de la clé…";
        status.textContent = `Crée ta clé d’accès avec ${BIOMETRIC_METHOD}.`;
        // Aucun await ni test asynchrone avant cet appel : le navigateur
        // conserve ainsi le geste utilisateur nécessaire à l'inscription.
        await activateBiometrics();
      }
    } catch (error) {
      if (credentialRecord && error && error.message === "CREDENTIAL_MISMATCH") {
        enrollmentNeeded = true;
      }
      status.textContent = errorMessage(error);
      setActionLabel();
    } finally {
      authenticationInProgress = false;
      action.disabled = false;
      action.removeAttribute("aria-busy");
    }
  }

  action.addEventListener("click", runAuthentication);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") setLocked();
  });

  window.addEventListener("pagehide", setLocked);
  window.addEventListener("pageshow", event => {
    if (event.persisted) setLocked();
  });

  setLocked();

  // Au retour sur le site, déclenche directement la même demande biométrique
  // que Face ID sur mobile, ou Touch ID sur un Mac de bureau.
  if (credentialRecord) {
    window.addEventListener("load", () => {
      authenticate().catch(error => {
        if (error && error.name !== "AbortError") {
          status.textContent = errorMessage(error);
        } else {
          status.textContent = `Déverrouille avec le bouton si la demande ${BIOMETRIC_METHOD} ne s’ouvre pas automatiquement.`;
        }
      });
    }, { once: true });
  }
})();