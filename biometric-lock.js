(() => {
  "use strict";

  const STORAGE_KEY = "sopp-agents-biometric-credential-v1";
  const root = document.documentElement;
  const action = document.getElementById("biometric-lock-action");
  const status = document.getElementById("biometric-lock-status");

  if (!root || !action || !status) return;

  let credentialRecord = readCredential();

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
    action.textContent = credentialRecord ? "Déverrouiller avec Face ID" : "Activer Face ID";
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

  async function platformAuthenticatorAvailable() {
    if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
      return false;
    }

    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      try {
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      } catch (error) {
        return false;
      }
    }

    return true;
  }

  async function activateBiometrics() {
    if (!(await platformAuthenticatorAvailable())) {
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
    unlock("La protection Face ID est activée sur cet appareil.");
  }

  async function authenticate() {
    if (!(await platformAuthenticatorAvailable())) {
      throw new Error("NO_PLATFORM_AUTHENTICATOR");
    }

    const assertion = await navigator.credentials.get({
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
    });

    if (!assertion || bufferToBase64Url(assertion.rawId) !== credentialRecord.id) {
      throw new Error("CREDENTIAL_MISMATCH");
    }

    unlock("Accès autorisé. Bienvenue dans SOPP Agents.");
  }

  function errorMessage(error) {
    if (error && error.message === "NO_PLATFORM_AUTHENTICATOR") {
      return "Aucun moyen biométrique compatible n’est disponible. Utilise Safari sur un appareil équipé de Face ID ou Touch ID.";
    }
    if (error && error.message === "STORAGE_UNAVAILABLE") {
      return "Le navigateur ne permet pas d’enregistrer la clé de sécurité. Autorise le stockage du site puis réessaie.";
    }
    if (error && error.message === "CREDENTIAL_MISMATCH") {
      return "La clé biométrique ne correspond pas à cet appareil. Vérifie que tu utilises le navigateur où Face ID a été activé.";
    }
    if (error && error.name === "NotAllowedError") {
      return "Vérification annulée ou expirée. Appuie de nouveau sur le bouton pour réessayer.";
    }
    if (error && (error.name === "SecurityError" || error.name === "NotSupportedError")) {
      return "La biométrie n’est pas disponible à cette adresse ou dans ce navigateur. Ouvre SOPP Agents depuis son adresse HTTPS officielle.";
    }
    if (error && error.name === "InvalidStateError") {
      return "Cette clé est déjà enregistrée ou indisponible. Recharge la page et réessaie.";
    }
    return "Impossible de vérifier ton identité. Vérifie la configuration biométrique de ton appareil et réessaie.";
  }

  action.addEventListener("click", async () => {
    if (action.disabled) return;

    action.disabled = true;
    action.setAttribute("aria-busy", "true");
    action.textContent = "Vérification en cours…";
    status.textContent = "Confirme ton identité sur ton appareil.";

    try {
      credentialRecord = readCredential();
      if (credentialRecord) {
        await authenticate();
      } else {
        await activateBiometrics();
      }
    } catch (error) {
      status.textContent = errorMessage(error);
      setActionLabel();
    } finally {
      action.disabled = false;
      action.removeAttribute("aria-busy");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") setLocked();
  });

  window.addEventListener("pagehide", setLocked);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) setLocked();
  });

  setLocked();
})();