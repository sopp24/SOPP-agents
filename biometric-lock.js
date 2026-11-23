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
        // Laisse le navigateur utiliser l'identifiant RP exact de l'origine
        // GitHub Pages (sopp24.github.io), sans forcer un domaine partagé.
        rp: {
          name: "SOPP Agents"
        },
        user: {
          id: new TextEncoder().encode("sopp-agents-local-user-v1"),
          name: "sopp-agents",
          displayName: "SOPP Agents"
        },
        // ES256 est le format standard pris en charge par Touch ID.
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          // "preferred" garde la préférence pour une passkey découvrable,
          // sans faire échouer les authentificateurs qui ne la proposent pas.
          residentKey: "preferred",
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

  async function startAutomaticAuthentication() {
    if (!credentialRecord) return;

    let capabilities = {};
    if (window.PublicKeyCredential &&
        typeof window.PublicKeyCredential.getClientCapabilities === "function") {
      try {
        capabilities = await window.PublicKeyCredential.getClientCapabilities();
      } catch (error) {
        capabilities = {};
      }
    }

    // L'invite automatique sans champ de connexion est une capacité récente
    // et expérimentale de certains navigateurs. Elle ne doit être appelée que
    // si le navigateur annonce explicitement la prise en charge.
    const uiMode = capabilities.conditionalActiveGet
      ? "active"
      : (capabilities.conditionalPassiveGet ? "passive" : null);

    if (!uiMode) {
      status.textContent = `La clé ${BIOMETRIC_METHOD} est enregistrée. Cette version du navigateur ne propose pas encore l’invite biométrique automatique à l’ouverture : utilise le bouton pour déclencher Touch ID.`;
      return;
    }

    status.textContent = `Recherche de la clé ${BIOMETRIC_METHOD}…`;
    const controller = new AbortController();
    automaticRequestController = controller;

    try {
      const assertion = await navigator.credentials.get({
        mediation: "conditional",
        signal: controller.signal,
        publicKey: {
          challenge: randomChallenge(),
          rpId: window.location.hostname,
          // La demande sans champ de connexion nécessite une passkey découvrable.
          userVerification: "required",
          timeout: 60000
        },
        uiMode
      });
      completeAuthentication(assertion);
    } catch (error) {
      if (error && error.name !== "AbortError") {
        status.textContent = errorMessage(error);
      }
    } finally {
      if (automaticRequestController === controller) automaticRequestController = null;
    }
  }

  function errorMessage(error) {
    if (error && error.message === "NO_PLATFORM_AUTHENTICATOR") {
      return `L’authentification ${BIOMETRIC_METHOD} n’est pas disponible dans ce navigateur. Vérifie que Touch ID est configuré dans Réglages Système et que Chrome est à jour.`;
    }
    if (error && error.message === "STORAGE_UNAVAILABLE") {
      return "Le navigateur ne permet pas d’enregistrer la clé de sécurité. Autorise le stockage du site puis réessaie.";
    }
    if (error && error.message === "CREDENTIAL_MISMATCH") {
      return "La clé d’accès renvoyée ne correspond pas à celle enregistrée pour SOPP Agents. Il faut réactiver la clé sur cet appareil.";
    }
    if (error && error.message === "USER_VERIFICATION_MISSING") {
      return `La vérification ${BIOMETRIC_METHOD} n’a pas été confirmée par l’appareil. Réessaie et valide la demande dans la fenêtre système.`;
    }
    if (error && error.name === "NotAllowedError") {
      return `La demande ${BIOMETRIC_METHOD} a été refusée, annulée ou a expiré. Relance-la depuis le bouton.`;
    }
    if (error && error.name === "ConstraintError") {
      return `L’authentificateur Touch ID ne répond pas aux contraintes de création de cette clé. Vérifie qu’une empreinte est configurée dans Réglages Système > Touch ID, puis réessaie.`;
    }
    if (error && (error.name === "UnknownError" || error.name === "NotReadableError")) {
      return `macOS ou Chrome n’a pas pu accéder à l’authentificateur Touch ID (${error.name}). Mets Chrome à jour, vérifie Touch ID dans Réglages Système et autorise Chrome à utiliser les clés d’accès.`;
    }
    if (error && error.name === "SecurityError") {
      return `Le navigateur a refusé le domaine WebAuthn (${window.location.hostname}). Ouvre SOPP Agents depuis https://sopp24.github.io/SOPP-agents/.`;
    }
    if (error && error.name === "NotSupportedError") {
      return `Ce navigateur ou cet appareil ne prend pas en charge la passkey locale demandée. Mets Chrome à jour et vérifie Touch ID dans Réglages Système.`;
    }
    if (error && error.name === "InvalidStateError") {
      return "Cette clé est déjà enregistrée ou indisponible. Recharge la page et réessaie.";
    }
    if (error && error.name === "TypeError") {
      return `La demande WebAuthn est incompatible avec ce navigateur : ${error.message || "options refusées"}.`;
    }

    const name = error && error.name ? error.name : "Erreur inconnue";
    const detail = error && error.message ? error.message : "aucun détail fourni par le navigateur";
    return `Échec de la création ou de la vérification de la clé (${name}) : ${detail}. Mets Chrome à jour et vérifie que Touch ID fonctionne sur le Mac.`;
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
      if (credentialRecord && error && error.message === "CREDENTIAL_MISMATCH") {
        enrollmentNeeded = true;
        status.textContent = `La clé locale ne correspond plus. Clique de nouveau pour créer une nouvelle clé ${BIOMETRIC_METHOD}.`;
      } else {
        // Une annulation de Touch ID ne supprime pas la clé : le bouton doit
        // rester un bouton de déverrouillage, pas demander une nouvelle inscription.
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