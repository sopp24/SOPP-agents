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
    url: [
      "https://www.deezer.com/*",
      "https://deezer.com/*"
    ]
  });
  return tabs
    .filter(tab => Number.isInteger(tab.id))
    .map(tab => ({
      id: tab.id,
      title: tab.title || "Deezer",
      url: tab.url || "https://www.deezer.com/"
    }));
}

async function requireDeezerTab(tabId) {
  if (!Number.isInteger(Number(tabId))) throw new Error("Onglet Deezer non sélectionné.");
  const tab = await chrome.tabs.get(Number(tabId));
  const url = new URL(tab.url || "");
  if (url.hostname !== "deezer.com" && !url.hostname.endsWith(".deezer.com")) {
    throw new Error("L'onglet choisi n'est pas un onglet Deezer.");
  }
  return tab;
}

function readPlayerState() {
  const player = window.dzPlayer;
  if (player && typeof player.getCurrentSong === "function") {
    try {
      const item = player.getCurrentSong() || {};
      const mediaType = typeof player.getMediaType === "function" ? player.getMediaType() : "song";
      let title = item.SNG_TITLE || item.LIVESTREAM_TITLE || item.EPISODE_TITLE || "";
      let artist = item.ART_NAME || item.SHOW_NAME || "";
      let album = item.ALB_TITLE || item.ALB_NAME || item.SHOW_NAME || "";
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
      const cover = picture ? "https://e-cdns-images.dzcdn.net/images/" + picture + "/250x250-000000-80-0-0.jpg" : "";
      return {
        title,
        artist,
        album,
        cover,
        duration,
        currentTime,
        playing: typeof player.isPlaying === "function" ? Boolean(player.isPlaying()) : false,
        url: location.href,
        integration: "dzPlayer"
      };
    } catch (_) {
      // Deezer peut charger son lecteur avant que toutes ses méthodes soient prêtes.
    }
  }

  const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
  const media = Array.from(document.querySelectorAll("audio, video"));
  const activeMedia = media.find(item => !item.paused && !item.ended) || media.find(item => Number.isFinite(item.duration) && item.duration > 0);
  const text = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element && (element.getAttribute("title") || element.getAttribute("aria-label") || element.textContent);
      if (value && value.trim()) return value.trim();
    }
    return "";
  };
  const artwork = metadata && Array.isArray(metadata.artwork) && metadata.artwork.length
    ? metadata.artwork[metadata.artwork.length - 1].src
    : "";
  const timeline = document.querySelector('input[type="range"][aria-label*="progress" i],input[type="range"][aria-label*="position" i],[role="slider"][aria-label*="progress" i],[role="slider"][aria-label*="position" i]');
  const duration = activeMedia && Number.isFinite(activeMedia.duration) ? activeMedia.duration : (timeline ? Number(timeline.getAttribute("aria-valuemax") || timeline.max) || 0 : 0);
  const currentTime = activeMedia && Number.isFinite(activeMedia.currentTime) ? activeMedia.currentTime : (timeline ? Number(timeline.getAttribute("aria-valuenow") || timeline.value) || 0 : 0);
  const playing = Boolean((navigator.mediaSession && navigator.mediaSession.playbackState === "playing") || (activeMedia && !activeMedia.paused && !activeMedia.ended));
  return {
    title: (metadata && metadata.title) || text(['[data-testid*="track-title"]','[data-testid*="title"]','[class*="trackName"]','[class*="TrackName"]']) || "",
    artist: (metadata && metadata.artist) || text(['[data-testid*="artist"]','[class*="artistName"]','[class*="ArtistName"]']) || "",
    album: (metadata && metadata.album) || "",
    cover: artwork || "",
    duration,
    currentTime,
    playing,
    url: location.href,
    integration: "dom-fallback"
  };
}

function performPlayerCommand(command, seconds) {
  const player = window.dzPlayer;
  if (player && player.control) {
    try {
      if (command === "PLAY") {
        player.control.play();
        return { ok: true, message: "Lecture demandée à Deezer.", integration: "dzPlayer" };
      }
      if (command === "PAUSE") {
        player.control.pause();
        return { ok: true, message: "Pause demandée à Deezer.", integration: "dzPlayer" };
      }
      if (command === "NEXT") {
        player.control.nextSong();
        return { ok: true, message: "Piste suivante demandée.", integration: "dzPlayer" };
      }
      if (command === "PREVIOUS") {
        player.control.prevSong();
        return { ok: true, message: "Piste précédente demandée.", integration: "dzPlayer" };
      }
      if (command === "SEEK") {
        const duration = typeof player.getDuration === "function" ? Number(player.getDuration()) : 0;
        if (!Number.isFinite(duration) || duration <= 0) return { ok: false, error: "Durée de piste indisponible pour déplacer la lecture." };
        const ratio = Math.max(0, Math.min(1, (Number(seconds) || 0) / duration));
        player.control.seek(ratio);
        return { ok: true, message: "Position de lecture modifiée.", integration: "dzPlayer" };
      }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : "Le lecteur Deezer a refusé la commande." };
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
    element.innerText,
    element.textContent
  ].filter(Boolean).join(" ").toLowerCase();

  if (command === "SEEK") {
    const targetSeconds = Math.max(0, Number(seconds) || 0);
    const ranges = Array.from(document.querySelectorAll('input[type="range"]')).filter(visible);
    const labelledRange = ranges.find(element => /progress|position|seek|time|lecture|avancement|timeline/.test(labelOf(element)));
    const range = labelledRange || (ranges.length > 1 ? ranges.find(element => !/volume/.test(labelOf(element))) : ranges[0]);
    if (range) {
      const max = Number(range.max) || 100;
      const min = Number(range.min) || 0;
      const media = Array.from(document.querySelectorAll("audio, video")).find(item => Number.isFinite(item.duration) && item.duration > 0);
      const duration = media ? media.duration : max;
      const absoluteValue = max <= 100 && duration > max ? min + (targetSeconds / duration) * (max - min) : targetSeconds;
      const value = Math.max(min, Math.min(max, absoluteValue));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(range, String(value));
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, message: "Position de lecture modifiée.", integration: "dom-fallback" };
    }
    const sliders = Array.from(document.querySelectorAll('[role="slider"]')).filter(visible);
    const slider = sliders.find(element => /progress|position|seek|time|lecture|avancement|timeline/.test(labelOf(element)))
      || sliders.find(element => element.getAttribute("aria-valuemax") && !/volume/.test(labelOf(element)));
    if (slider) {
      const rect = slider.getBoundingClientRect();
      const max = Number(slider.getAttribute("aria-valuemax")) || 100;
      const min = Number(slider.getAttribute("aria-valuemin")) || 0;
      const media = Array.from(document.querySelectorAll("audio, video")).find(item => Number.isFinite(item.duration) && item.duration > 0);
      const duration = media ? media.duration : max;
      const ratio = Math.max(0, Math.min(1, duration > 0 ? targetSeconds / duration : (targetSeconds - min) / Math.max(1, max - min)));
      const x = rect.left + rect.width * ratio;
      const y = rect.top + rect.height / 2;
      slider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse" }));
      slider.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
      slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse" }));
      return { ok: true, message: "Position de lecture envoyée.", integration: "dom-fallback" };
    }
    return { ok: false, error: "La barre de progression n'est pas accessible dans cette version du lecteur." };
  }

  const patterns = {
    PLAY: /(^|[^a-z])(play|lecture|reprendre|écouter)([^a-z]|$)/i,
    PAUSE: /(^|[^a-z])(pause|mettre en pause)([^a-z]|$)/i,
    NEXT: /(^|[^a-z])(next|suivant|piste suivante|titre suivant|skip)([^a-z]|$)/i,
    PREVIOUS: /(^|[^a-z])(previous|précédent|précédente|piste précédente|titre précédent|back)([^a-z]|$)/i
  };
  const selectors = {
    PLAY: ['button[aria-label*="Play" i]','button[aria-label*="Lecture" i]','[data-testid*="play"]'],
    PAUSE: ['button[aria-label*="Pause" i]','[data-testid*="pause"]'],
    NEXT: ['button[aria-label*="Next" i]','button[aria-label*="Suivant" i]','[data-testid*="next"]'],
    PREVIOUS: ['button[aria-label*="Previous" i]','button[aria-label*="Précédent" i]','[data-testid*="previous"]']
  };
  const selectorMatch = (selectors[command] || []).map(selector => document.querySelector(selector)).find(visible);
  const buttons = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible);
  const match = selectorMatch || buttons.find(element => patterns[command] && patterns[command].test(labelOf(element)));
  if (!match) return { ok: false, error: "Commande non trouvée dans l'interface Deezer." };
  match.click();
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

async function controlPlayer(tabId, command, seconds) {
  await requireDeezerTab(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId: Number(tabId) },
    world: "MAIN",
    func: performPlayerCommand,
    args: [command, seconds]
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
        const result = await controlPlayer(message.tabId, message.command, message.seconds);
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