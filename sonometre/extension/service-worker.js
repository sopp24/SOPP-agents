const APP_ORIGIN = "https://sopp24.github.io";
const APP_PATH_PREFIX = "/SOPP-agents/sonometre/";

function isAllowedAppSender(sender) {
  try {
    const url = new URL(sender.url || (sender.tab && sender.tab.url) || "");
    return url.origin === APP_ORIGIN && url.pathname.startsWith(APP_PATH_PREFIX);
  } catch (_) {
    return false;
  }
}

async function listDeezerTabs() {
  const tabs = await chrome.tabs.query({
    url: ["https://www.deezer.com/*", "https://deezer.com/*"]
  });
  return tabs
    .filter(tab => Number.isInteger(tab.id))
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))
    .map(tab => ({
      id: tab.id,
      title: tab.title || "Deezer",
      url: tab.url || "https://www.deezer.com/",
      active: Boolean(tab.active)
    }));
}

async function requireDeezerTab(tabId) {
  const id = Number(tabId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Onglet Deezer non sélectionné.");
  const tab = await chrome.tabs.get(id);
  const url = new URL(tab.url || "");
  if (url.hostname !== "deezer.com" && !url.hostname.endsWith(".deezer.com")) {
    throw new Error("L'onglet choisi n'est pas un onglet Deezer.");
  }
  return tab;
}

function selectMediaElement() {
  const media = document.querySelectorAll("audio, video");
  for (const element of media) {
    if (!element.paused && !element.ended) return element;
  }
  for (const element of media) {
    if (Number.isFinite(element.duration) && element.duration > 0) return element;
  }
  return media[0] || null;
}

function readPlayerState() {
  const mediaElement = selectMediaElement();
  const mediaMetadata = navigator.mediaSession && navigator.mediaSession.metadata;
  const mediaArtwork = mediaMetadata && Array.isArray(mediaMetadata.artwork) && mediaMetadata.artwork.length
    ? mediaMetadata.artwork[mediaMetadata.artwork.length - 1].src
    : "";
  const mediaVolume = mediaElement && Number.isFinite(mediaElement.volume) ? mediaElement.volume : null;

  const player = window.dzPlayer;
  if (player && typeof player.getCurrentSong === "function") {
    try {
      const item = player.getCurrentSong() || {};
      const mediaType = typeof player.getMediaType === "function" ? player.getMediaType() : "song";
      const title = item.SNG_TITLE || item.LIVESTREAM_TITLE || item.EPISODE_TITLE || "";
      const artist = item.ART_NAME || item.SHOW_NAME || "";
      const album = item.ALB_TITLE || item.ALB_NAME || item.SHOW_NAME || "";
      let picture = "";
      if (mediaType === "live_stream") {
        picture = item.LIVESTREAM_IMAGE_MD5 ? "misc/" + item.LIVESTREAM_IMAGE_MD5 : "";
      } else if (mediaType === "episode") {
        const id = item.EPISODE_IMAGE_MD5 || item.SHOW_ART_MD5;
        picture = id ? "talk/" + id : "";
      } else if (item.ALB_PICTURE) {
        picture = "cover/" + item.ALB_PICTURE;
      }
      const duration = typeof player.getDuration === "function" ? Number(player.getDuration()) || 0 : Number(item.DURATION) || 0;
      const currentTime = typeof player.getPosition === "function" ? Number(player.getPosition()) || 0 : 0;
      const cover = picture ? "https://e-cdns-images.dzcdn.net/images/" + picture + "/250x250-000000-80-0-0.jpg" : mediaArtwork;
      const playing = typeof player.isPlaying === "function"
        ? Boolean(player.isPlaying())
        : Boolean(mediaElement && !mediaElement.paused && !mediaElement.ended);
      return {
        title, artist, album, cover, duration,
        currentTime: Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, currentTime)),
        playing,
        volume: mediaVolume,
        url: location.href,
        integration: "dzPlayer"
      };
    } catch (_) {
      // Le lecteur peut s'initialiser avant que ses méthodes soient toutes disponibles.
    }
  }

  const text = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element && (
        element.getAttribute("title") ||
        element.getAttribute("aria-label") ||
        element.textContent
      );
      if (value && value.trim()) return value.trim();
    }
    return "";
  };
  const timeline = document.querySelector(
    'input[type="range"][aria-label*="progress" i],input[type="range"][aria-label*="position" i],[role="slider"][aria-label*="progress" i],[role="slider"][aria-label*="position" i]'
  );
  const duration = mediaElement && Number.isFinite(mediaElement.duration)
    ? mediaElement.duration
    : (timeline ? Number(timeline.getAttribute("aria-valuemax") || timeline.max) || 0 : 0);
  const currentTime = mediaElement && Number.isFinite(mediaElement.currentTime)
    ? mediaElement.currentTime
    : (timeline ? Number(timeline.getAttribute("aria-valuenow") || timeline.value) || 0 : 0);
  const playing = Boolean(
    (navigator.mediaSession && navigator.mediaSession.playbackState === "playing") ||
    (mediaElement && !mediaElement.paused && !mediaElement.ended)
  );
  return {
    title: (mediaMetadata && mediaMetadata.title) ||
      text(['[data-testid*="track-title"]', '[data-testid*="title"]', '[class*="trackName"]', '[class*="TrackName"]']),
    artist: (mediaMetadata && mediaMetadata.artist) ||
      text(['[data-testid*="artist"]', '[class*="artistName"]', '[class*="ArtistName"]']),
    album: (mediaMetadata && mediaMetadata.album) || "",
    cover: mediaArtwork,
    duration: Math.max(0, duration),
    currentTime: Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, currentTime)),
    playing,
    volume: mediaVolume,
    url: location.href,
    integration: "dom-fallback"
  };
}

function performPlayerCommand(command, value, durationHint) {
  const player = window.dzPlayer;
  const control = player && player.control;
  const methodByCommand = { PLAY: "play", PAUSE: "pause", NEXT: "nextSong", PREVIOUS: "prevSong" };
  const method = methodByCommand[command];
  if (method && control && typeof control[method] === "function") {
    try {
      control[method]();
      return {
        ok: true,
        message: command === "PLAY" ? "Lecture demandée à Deezer."
          : command === "PAUSE" ? "Pause demandée à Deezer."
          : command === "NEXT" ? "Piste suivante demandée."
          : "Piste précédente demandée.",
        integration: "dzPlayer"
      };
    } catch (_) {
      // Une évolution de l'API interne laisse une chance aux commandes DOM de fonctionner.
    }
  }

  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const labelOf = (element) => [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-testid"),
    element.textContent
  ].filter(Boolean).join(" ").toLowerCase();

  if (command === "SET_VOLUME") {
    const volume = Math.max(0, Math.min(1, Number(value)));
    if (!Number.isFinite(volume)) return { ok: false, error: "Valeur de volume invalide." };
    const media = selectMediaElement();
    if (media && typeof media.volume === "number") {
      media.volume = volume;
      media.muted = volume === 0;
      return { ok: true, message: "Volume modifié.", volume, integration: "media-element" };
    }
    const range = Array.from(document.querySelectorAll('input[type="range"],[role="slider"]'))
      .filter(visible)
      .find(element => /volume|son|audio/i.test(labelOf(element)));
    if (range) {
      const min = Number(range.getAttribute("aria-valuemin") || range.min) || 0;
      const max = Number(range.getAttribute("aria-valuemax") || range.max) || 100;
      const next = min + volume * (max - min);
      const rect = range.getBoundingClientRect();
      const x = rect.left + rect.width * volume;
      const y = rect.top + rect.height / 2;
      range.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse" }));
      if (range instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(range, String(next));
        range.dispatchEvent(new Event("input", { bubbles: true }));
        range.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        range.setAttribute("aria-valuenow", String(next));
        range.dispatchEvent(new Event("input", { bubbles: true }));
      }
      range.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse" }));
      return { ok: true, message: "Volume envoyé au lecteur.", volume, integration: "dom-fallback" };
    }
    return { ok: false, error: "Le lecteur ne donne pas accès à un réglage de volume contrôlable." };
  }

  if (command === "SEEK") {
    const targetSeconds = Math.max(0, Number(value) || 0);
    const media = selectMediaElement();
    if (media && Number.isFinite(media.duration) && media.duration > 0) {
      media.currentTime = Math.min(media.duration, targetSeconds);
      return { ok: true, message: "Position de lecture modifiée.", integration: "media-element" };
    }
    const ranges = Array.from(document.querySelectorAll('input[type="range"]')).filter(visible);
    const labelledRange = ranges.find(element =>
      /progress|position|seek|time|lecture|avancement|timeline/i.test(labelOf(element)) &&
      !/volume|son/i.test(labelOf(element))
    );
    const range = labelledRange || ranges.find(element => !/volume|son/i.test(labelOf(element)));
    if (range) {
      const max = Number(range.max) || 100;
      const min = Number(range.min) || 0;
      const duration = Number(durationHint) > 0 ? Number(durationHint) : max;
      const next = max <= 100 && duration > max
        ? min + (targetSeconds / duration) * (max - min)
        : targetSeconds;
      const valueToSet = Math.max(min, Math.min(max, next));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(range, String(valueToSet));
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, message: "Position de lecture modifiée.", integration: "dom-fallback" };
    }
    const sliders = Array.from(document.querySelectorAll('[role="slider"]')).filter(visible);
    const slider = sliders.find(element =>
      /progress|position|seek|time|lecture|avancement|timeline/i.test(labelOf(element)) &&
      !/volume|son/i.test(labelOf(element))
    );
    if (slider) {
      const rect = slider.getBoundingClientRect();
      const max = Number(slider.getAttribute("aria-valuemax")) || 100;
      const min = Number(slider.getAttribute("aria-valuemin")) || 0;
      const duration = Number(durationHint) > 0 ? Number(durationHint) : max;
      const ratio = Math.max(0, Math.min(1, targetSeconds / duration));
      const x = rect.left + rect.width * ratio;
      const y = rect.top + rect.height / 2;
      slider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse" }));
      slider.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
      slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse" }));
      return { ok: true, message: "Position de lecture envoyée.", integration: "dom-fallback" };
    }
    return { ok: false, error: "La barre de progression n'est pas accessible dans cette version du lecteur." };
  }

  const selectors = {
    PLAY: ['button[aria-label*="Play" i]', 'button[aria-label*="Lecture" i]', '[data-testid*="play"]'],
    PAUSE: ['button[aria-label*="Pause" i]', '[data-testid*="pause"]'],
    NEXT: ['button[aria-label*="Next" i]', 'button[aria-label*="Suivant" i]', '[data-testid*="next"]'],
    PREVIOUS: ['button[aria-label*="Previous" i]', 'button[aria-label*="Précédent" i]', '[data-testid*="previous"]']
  };
  const button = (selectors[command] || [])
    .map(selector => document.querySelector(selector))
    .find(visible) || Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .find(element => {
        const label = labelOf(element);
        if (command === "PLAY") return /(^|\s)(play|lecture|reprendre|écouter)(\s|$)/i.test(label) && !/pause/i.test(label);
        if (command === "PAUSE") return /pause/i.test(label);
        if (command === "NEXT") return /next|suivant|piste suivante|titre suivant|skip/i.test(label);
        if (command === "PREVIOUS") return /previous|précédent|précédente|piste précédente|titre précédent|back/i.test(label);
        return false;
      });
  if (!button) return { ok: false, error: "Commande non trouvée dans l'interface Deezer." };
  button.click();
  return { ok: true, message: "Commande envoyée au lecteur Deezer.", integration: "dom-fallback" };
}

async function getPlayerState(tabId) {
  await requireDeezerTab(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId: Number(tabId) },
    world: "MAIN",
    func: readPlayerState
  });
  return results && results[0] ? results[0].result : null;
}

async function controlPlayer(tabId, command, value, durationHint) {
  await requireDeezerTab(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId: Number(tabId) },
    world: "MAIN",
    func: performPlayerCommand,
    args: [command, value, durationHint]
  });
  return results && results[0] ? results[0].result : { ok: false, error: "Aucune réponse du lecteur Deezer." };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "SOPP_DB_DEEZER_REQUEST" || !isAllowedAppSender(sender)) return false;

  (async () => {
    try {
      if (message.action === "LIST_TABS") {
        sendResponse({ ok: true, tabs: await listDeezerTabs() });
        return;
      }
      if (message.action === "GET_STATE") {
        sendResponse({ ok: true, state: await getPlayerState(message.tabId) });
        return;
      }
      if (message.action === "COMMAND") {
        const allowed = ["PLAY", "PAUSE", "NEXT", "PREVIOUS", "SEEK", "SET_VOLUME"];
        if (!allowed.includes(message.command)) {
          sendResponse({ ok: false, error: "Commande refusée." });
          return;
        }
        if (message.command === "SEEK" || message.command === "SET_VOLUME") {
          const value = Number(message.seconds);
          if (!Number.isFinite(value)) {
            sendResponse({ ok: false, error: "Valeur de commande invalide." });
            return;
          }
        }
        const durationHint = Number(message.duration);
        const result = await controlPlayer(message.tabId, message.command, message.seconds, Number.isFinite(durationHint) ? durationHint : 0);
        sendResponse(result || { ok: false, error: "Commande sans réponse." });
        return;
      }
      sendResponse({ ok: false, error: "Action inconnue." });
    } catch (error) {
      sendResponse({ ok: false, error: error && error.message ? error.message : "Erreur du compagnon Deezer." });
    }
  })();
  return true;
});
