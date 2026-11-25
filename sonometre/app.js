(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const ui = {
    sourceOptions: document.querySelectorAll(".source-option"),
    micDetail: $("#mic-detail"), tabDetail: $("#tab-detail"), micSelect: $("#microphone-select"), tabSourceLabel: $("#tab-source-label"),
    start: $("#start-button"), stop: $("#stop-button"), permission: $("#permission-message"),
    live: $("#live-indicator"), main: $("#main-reading"), unit: $("#reading-unit"),
    pill: $("#status-pill"), caption: $("#reading-caption"), fill: $("#meter-fill"), track: $("#meter-track"),
    signal: $("#signal-reading"), deviceEnvironment: $("#device-environment"),
    sourceIcon: $("#detected-source-icon"), sourceName: $("#detected-source-name"), sourceSub: $("#detected-source-sub"),
    system: $("#system-name"), browser: $("#browser-name"), sampleRate: $("#sample-rate"), channels: $("#channel-count"),
    elapsed: $("#elapsed-time"), minimum: $("#minimum-reading"), average: $("#average-reading"), maximum: $("#maximum-reading"),
    chart: $("#level-chart"), chartEmpty: $("#chart-empty"), export: $("#export-button"), reset: $("#reset-button"),
    calibrationState: $("#calibration-state"), reference: $("#reference-level"), calibrate: $("#calibrate-button"),
    calibrationMessage: $("#calibration-message"), fine: $("#fine-adjust-slider"), fineValue: $("#fine-adjust-value"),
    clearCalibration: $("#clear-calibration-button"), install: $("#install-button"),
    modal: $("#precision-modal"), privacyButton: $("#privacy-info-button"), closeModal: $("#close-modal"), modalOk: $("#modal-ok")
  };

  let mode = "mic";
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let spectrumBuffer = null;
  let weightingFactors = null;
  let firstWeightedBin = 1;
  let lastWeightedBin = 0;
  let sourceNode = null;
  let timer = null;
  let startedAt = 0;
  let elapsedBeforeStop = 0;
  let activeDeviceId = "";
  let sourceDescription = "";
  let rawReading = null;
  let currentDb = null;
  let offsetBase = 0;
  let fineOffset = 0;
  let calibrated = false;
  let calibrationKey = "";
  let calibrationCapture = null;
  let calibrationTimer = null;
  let calibrationRun = 0;
  let readings = [];
  let installPrompt = null;
  let chartFrame = 0;

  const systemDescription = detectSystem();
  ui.system.textContent = systemDescription;
  ui.browser.textContent = detectBrowser();

  function detectSystem() {
    const ua = navigator.userAgent || "";
    if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
    if (/Windows/.test(ua)) return "Windows";
    if (/CrOS/.test(ua)) return "ChromeOS";
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS / iPadOS";
    if (/Linux/.test(ua)) return "Linux";
    return "Système non identifié";
  }

  function detectBrowser() {
    const ua = navigator.userAgent || "";
    if (/Edg\//.test(ua)) return "Microsoft Edge";
    if (/OPR\//.test(ua)) return "Opera";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/CriOS\//.test(ua)) return "Chrome iOS";
    if (/Chrome\//.test(ua)) return "Google Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "Navigateur non identifié";
  }

  function setPermission(message, kind) {
    ui.permission.textContent = message;
    ui.permission.className = "permission-message" + (kind ? " " + kind : "");
  }

  function setPill(kind, text) {
    ui.pill.className = "status-pill " + kind;
    ui.pill.textContent = text;
  }

  function formatNumber(value, digits = 1) {
    return Number.isFinite(value) ? value.toFixed(digits).replace(".", ",") : "—";
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const rest = safe % 60;
    return hours > 0
      ? String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0")
      : String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
  }

  function currentElapsed() {
    return elapsedBeforeStop + (startedAt ? (Date.now() - startedAt) / 1000 : 0);
  }

  function calibrationStorageKey() {
    return "meust-calibration:" + (mode === "mic" ? (activeDeviceId || "microphone-default") : "shared-tab-session");
  }

  function loadCalibration() {
    calibrationKey = calibrationStorageKey();
    offsetBase = 0;
    fineOffset = 0;
    calibrated = false;
    try {
      let stored = mode === "tab" ? null : localStorage.getItem(calibrationKey);
      if (!stored && mode === "mic") {
        const legacyKey = "sopp-db-calibration:" + (activeDeviceId || "microphone-default");
        stored = localStorage.getItem(legacyKey);
        if (stored) localStorage.setItem(calibrationKey, stored);
      }
      if (stored) {
        const value = JSON.parse(stored);
        if (Number.isFinite(value.offset)) {
          offsetBase = value.offset;
          fineOffset = Number.isFinite(value.fine) ? value.fine : 0;
          calibrated = true;
        }
      }
    } catch (error) {
      console.warn("Étalonnage local indisponible", error);
    }
    updateCalibrationUI();
  }

  function saveCalibration() {
    if (mode === "tab") return;
    try {
      localStorage.setItem(calibrationKey, JSON.stringify({ offset: offsetBase, fine: fineOffset, date: new Date().toISOString() }));
    } catch (error) {
      console.warn("Impossible de conserver l'étalonnage", error);
    }
  }

  function updateCalibrationUI() {
    ui.calibrationState.textContent = calibrated ? "ÉTALONNÉ" : "NON ÉTALONNÉ";
    ui.calibrationState.classList.toggle("ready", calibrated);
    ui.fine.disabled = !calibrated;
    ui.fine.value = String(fineOffset);
    ui.fineValue.textContent = formatNumber(fineOffset) + " dB";
    ui.clearCalibration.disabled = !calibrated;
    ui.calibrate.disabled = !analyser || Boolean(calibrationCapture);
    ui.unit.textContent = calibrated ? "dB(A)" : "dBFS";
    $("#stats-unit").textContent = calibrated ? "dB(A)" : "dBFS";
    $("#stats-unit-2").textContent = calibrated ? "dB(A)" : "dBFS";
    $("#stats-unit-3").textContent = calibrated ? "dB(A)" : "dBFS";
  }

  function setMode(nextMode) {
    if (analyser) return;
    rawReading = null;
    currentDb = null;
    readings = [];
    elapsedBeforeStop = 0;
    ui.elapsed.textContent = "00:00";
    ui.minimum.textContent = "—";
    ui.average.textContent = "—";
    ui.maximum.textContent = "—";
    ui.chartEmpty.hidden = false;
    mode = nextMode;
    ui.sourceOptions.forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    ui.micDetail.hidden = mode !== "mic";
    ui.tabDetail.hidden = mode !== "tab";
    ui.deviceEnvironment.textContent = mode === "mic" ? "Environnement : microphone de l'ordinateur" : "Environnement : audio d'un onglet partagé";
    ui.sourceIcon.innerHTML = mode === "mic"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 21h8m-4-4v4m-2-9 5-2-5-2v4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    ui.sourceName.textContent = "Aucune source active";
    ui.sourceSub.textContent = mode === "mic" ? "Le microphone sera identifié après autorisation." : "L'onglet apparaîtra après sélection dans le navigateur.";
    loadCalibration();
    renderReading();
  }

  async function refreshMicrophones() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter((device) => device.kind === "audioinput");
      const current = ui.micSelect.value;
      ui.micSelect.innerHTML = "";
      if (!microphones.length) {
        const option = document.createElement("option");
        option.textContent = "Aucun microphone détecté";
        option.value = "";
        ui.micSelect.appendChild(option);
      } else {
        microphones.forEach((device, index) => {
          const option = document.createElement("option");
          option.value = device.deviceId;
          option.textContent = device.label || ("Microphone " + (index + 1) + " (nom masqué)");
          ui.micSelect.appendChild(option);
        });
      }
      if (current && microphones.some((device) => device.deviceId === current)) ui.micSelect.value = current;
      ui.micSelect.disabled = microphones.length === 0 || Boolean(analyser);
    } catch (error) {
      console.warn("Liste des microphones indisponible", error);
    }
  }

  async function startMeasurement() {
    if (analyser) return;
    if (!window.isSecureContext) {
      setPermission("Le microphone et le partage audio nécessitent une page HTTPS ou localhost.", "error");
      return;
    }
    if (!navigator.mediaDevices) {
      setPermission("Ce navigateur ne donne pas accès aux périphériques multimédias.", "error");
      return;
    }
    ui.start.disabled = true;
    ui.start.textContent = "Connexion à la source…";
    setPermission("Demande d'autorisation en cours…");
    try {
      if (mode === "mic") {
        const audio = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 1 }
        };
        if (ui.micSelect.value) audio.deviceId = { exact: ui.micSelect.value };
        stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      } else {
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error("La capture audio d'un onglet n'est pas disponible dans ce navigateur. Essaie avec une version récente de Chrome ou Edge sur ordinateur.");
        }
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length) {
          stream.getTracks().forEach((track) => track.stop());
          stream = null;
          throw new Error("Aucun audio reçu. Dans le sélecteur du navigateur, choisis un onglet et active « Partager l'audio ».");
        }
        stream.getVideoTracks().forEach((track) => { track.enabled = false; });
      }

      const audioTrack = stream.getAudioTracks()[0];
      activeDeviceId = audioTrack.getSettings().deviceId || "";
      sourceDescription = mode === "mic"
        ? (audioTrack.label || "Microphone de l'ordinateur")
        : (ui.tabSourceLabel.value.trim() ? "Onglet partagé : " + ui.tabSourceLabel.value.trim() : "Onglet choisi dans le sélecteur du navigateur");
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      sourceNode = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 8192;
      configureWeighting();
      analyser.smoothingTimeConstant = 0.42;
      spectrumBuffer = new Float32Array(analyser.frequencyBinCount);
      sourceNode.connect(analyser);

      const settings = audioTrack.getSettings();
      ui.sourceName.textContent = sourceDescription;
      ui.sourceSub.textContent = mode === "mic"
        ? "Source physique autorisée par le navigateur"
        : "Audio du partage actif · le titre de l'onglet peut être masqué";
      ui.sampleRate.textContent = (settings.sampleRate || audioContext.sampleRate) + " Hz";
      ui.channels.textContent = (settings.channelCount || 1) + (settings.channelCount === 1 ? " canal" : " canaux");
      ui.deviceEnvironment.textContent = mode === "mic" ? "Micro : " + sourceDescription : "Source : onglet partagé manuellement";
      await refreshMicrophones();
      if (mode === "mic" && activeDeviceId) ui.micSelect.value = activeDeviceId;
      ui.micSelect.disabled = mode !== "mic";
      loadCalibration();
      startedAt = Date.now();
      elapsedBeforeStop = 0;
      readings = [];
        calibrationCapture = null;
      ui.live.classList.add("active");
      ui.live.innerHTML = "<i></i> MESURE ACTIVE";
      ui.start.hidden = true;
      ui.stop.hidden = false;
      ui.reset.disabled = false;
      ui.export.disabled = false;
      ui.chartEmpty.hidden = true;
      ui.calibrate.disabled = false;
      setPermission(mode === "mic" ? "Microphone actif. Aucun son n'est enregistré." : "Audio de l'onglet reçu. Aucun son n'est enregistré.", "success");
      renderReading();
      timer = window.setInterval(readAudioLevel, 200);
      audioTrack.addEventListener("ended", () => stopMeasurement("Le partage audio ou le microphone a été interrompu."));
      if (mode === "tab") {
        stream.getVideoTracks().forEach((track) => track.addEventListener("ended", () => stopMeasurement("Le partage de l'onglet a été arrêté.")));
      }
    } catch (error) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
      if (audioContext) await audioContext.close().catch(() => {});
      audioContext = null;
      analyser = null;
      spectrumBuffer = null;
      sourceNode = null;
      setPermission(error && error.message ? error.message : "Impossible d'accéder à la source sonore. Vérifie les autorisations du navigateur.", "error");
      ui.sourceName.textContent = "Aucune source active";
      ui.sourceSub.textContent = "La source apparaîtra ici au démarrage.";
    } finally {
      ui.start.disabled = false;
      ui.start.innerHTML = '<span class="button-play">▶</span> Démarrer la mesure';
      updateCalibrationUI();
      await refreshMicrophones();
    }
  }

  async function stopMeasurement(message) {
    if (timer) window.clearInterval(timer);
    timer = null;
    if (calibrationTimer) window.clearTimeout(calibrationTimer);
    calibrationTimer = null;
    calibrationRun++;
    calibrationCapture = null;
    ui.calibrate.textContent = "Étalonner sur 5 secondes";
    if (startedAt) elapsedBeforeStop += (Date.now() - startedAt) / 1000;
    startedAt = 0;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (_) {}
    }
    if (audioContext) await audioContext.close().catch(() => {});
    audioContext = null;
    analyser = null;
    spectrumBuffer = null;
    sourceNode = null;
    ui.live.classList.remove("active");
    ui.live.innerHTML = "<i></i> EN PAUSE";
    ui.start.hidden = false;
    ui.stop.hidden = true;
    ui.micSelect.disabled = false;
    ui.calibrate.disabled = true;
    ui.elapsed.textContent = formatTime(elapsedBeforeStop);
    if (message) setPermission(message);
    else setPermission("Mesure arrêtée. Les données restent uniquement dans cette page.", "success");
    updateCalibrationUI();
  }

  function aWeightingDb(frequency) {
    if (frequency <= 0) return -120;
    const f2 = frequency * frequency;
    const c1 = 20.6 * 20.6;
    const c2 = 107.7 * 107.7;
    const c3 = 737.9 * 737.9;
    const c4 = 12194 * 12194;
    const numerator = c4 * f2 * f2;
    const denominator = (f2 + c1) * Math.sqrt((f2 + c2) * (f2 + c3)) * (f2 + c4);
    const ra = numerator / denominator;
    return 20 * Math.log10(ra) + 2.0;
  }

  function configureWeighting() {
    if (!analyser || !audioContext) return;
    const binCount = analyser.frequencyBinCount;
    const hzPerBin = audioContext.sampleRate / analyser.fftSize;
    weightingFactors = new Float32Array(binCount);
    firstWeightedBin = Math.max(1, Math.ceil(20 / hzPerBin));
    lastWeightedBin = Math.min(binCount - 1, Math.floor(20000 / hzPerBin));
    for (let index = firstWeightedBin; index <= lastWeightedBin; index++) {
      weightingFactors[index] = Math.pow(10, aWeightingDb(index * hzPerBin) / 10);
    }
  }

  function readAudioLevel() {
    if (!analyser || !audioContext) return;
    if (!spectrumBuffer || spectrumBuffer.length !== analyser.frequencyBinCount) spectrumBuffer = new Float32Array(analyser.frequencyBinCount);
    if (!weightingFactors || weightingFactors.length !== analyser.frequencyBinCount) configureWeighting();
    const spectrum = spectrumBuffer;
    analyser.getFloatFrequencyData(spectrum);
    let weightedPower = 0;
    let validBins = 0;
    for (let index = firstWeightedBin; index <= lastWeightedBin; index++) {
      const magnitudeDb = spectrum[index];
      if (!Number.isFinite(magnitudeDb) || magnitudeDb <= -120) continue;
      weightedPower += Math.pow(10, magnitudeDb / 10) * weightingFactors[index];
      validBins++;
    }
    if (!validBins || weightedPower <= 0) return;
    rawReading = 10 * Math.log10(weightedPower / validBins);
    if (calibrationCapture) calibrationCapture.push(rawReading);
    currentDb = calibrated ? rawReading + offsetBase + fineOffset : rawReading;
    const elapsed = currentElapsed();
    readings.push({
      time: new Date().toISOString(),
      elapsed: elapsed,
      raw: rawReading,
      value: calibrated ? currentDb : rawReading,
      calibrated: calibrated
    });
    if (readings.length > 1800) readings.shift();
    renderReading();
    renderStats();
    ui.elapsed.textContent = formatTime(elapsed);
    if (Date.now() - chartFrame > 850) {
      drawChart();
      chartFrame = Date.now();
    }
  }

  function levelStatus(value) {
    if (value < 80) return { kind: "green", label: "OK · Niveau modéré", caption: "Niveau inférieur au repère de vigilance de 80 dB." };
    if (value < 85) return { kind: "yellow", label: "Vigilance · Niveau élevé", caption: "Le niveau sonore est élevé. Surveille la durée d'exposition." };
    return { kind: "red", label: "Élevé · Protection conseillée", caption: "Réduis l'exposition et envisage une protection auditive." };
  }

  function renderReading() {
    const isLive = Boolean(analyser);
    if (rawReading === null) {
      ui.main.textContent = "—";
      ui.signal.textContent = "— dBFS";
      ui.fill.style.width = "0%";
      ui.track.setAttribute("aria-valuenow", "30");
      setPill("neutral", "En attente de mesure");
      ui.caption.textContent = "Démarre une mesure pour afficher le niveau sonore.";
      return;
    }
    ui.signal.textContent = formatNumber(rawReading) + " dBFS";
    ui.unit.textContent = calibrated ? "dB(A)" : "dBFS";
    if (calibrated) {
      ui.main.textContent = formatNumber(currentDb, 1);
      const status = levelStatus(currentDb);
      setPill(status.kind, status.label);
      ui.caption.textContent = status.caption;
      const percent = Math.max(0, Math.min(100, ((currentDb - 30) / 90) * 100));
      ui.fill.style.width = percent + "%";
      ui.fill.style.background = status.kind === "green" ? "var(--green)" : status.kind === "yellow" ? "var(--yellow)" : "var(--red)";
      ui.track.setAttribute("aria-valuenow", String(Math.round(currentDb)));
    } else {
      ui.main.textContent = formatNumber(rawReading, 1);
      setPill("neutral", isLive ? "Calibrage requis" : "Mesure relative");
      ui.caption.textContent = "dBFS = niveau numérique. Étalonne le micro pour obtenir une estimation en dB(A).";
      const percent = Math.max(0, Math.min(100, ((rawReading + 90) / 84) * 100));
      ui.fill.style.width = percent + "%";
      ui.fill.style.background = "#8b9299";
      ui.track.setAttribute("aria-valuenow", "30");
    }
  }

  function renderStats() {
    let minimum = Infinity;
    let maximum = -Infinity;
    let powerSum = 0;
    let count = 0;
    for (let index = 0; index < readings.length; index++) {
      const reading = readings[index];
      if (reading.calibrated !== calibrated || !Number.isFinite(reading.value)) continue;
      const value = reading.value;
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
      powerSum += Math.pow(10, value / 10);
      count++;
    }
    if (!count) return;
    const average = 10 * Math.log10(powerSum / count);
    ui.minimum.textContent = formatNumber(minimum, 1);
    ui.average.textContent = formatNumber(average, 1);
    ui.maximum.textContent = formatNumber(maximum, 1);
    ui.export.disabled = false;
  }

  function drawChart() {
    const canvas = ui.chart;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;
    const left = 30, right = 10, top = 12, bottom = 19;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const shown = readings.slice(-300);
    const values = shown.map((reading) => reading.value);
    const minScale = calibrated ? 30 : -90;
    const maxScale = calibrated ? 120 : -6;
    ctx.font = "9px Inter, sans-serif";
    ctx.fillStyle = "#69727a";
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.lineWidth = 1;
    [0, .5, 1].forEach((ratio) => {
      const y = top + ratio * plotHeight;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
      const value = maxScale - ratio * (maxScale - minScale);
      ctx.fillText(String(Math.round(value)), 5, y + 3);
    });
    if (values.length < 2) return;
    const points = values.map((value, index) => ({
      x: left + (index / Math.max(1, values.length - 1)) * plotWidth,
      y: top + (1 - Math.max(0, Math.min(1, (value - minScale) / (maxScale - minScale)))) * plotHeight
    }));
    const stroke = calibrated ? (levelStatus(values[values.length - 1]).kind === "green" ? "#35c98a" : levelStatus(values[values.length - 1]).kind === "yellow" ? "#f0bb38" : "#f05c61") : "#a4abb1";
    const gradient = ctx.createLinearGradient(0, top, 0, height - bottom);
    gradient.addColorStop(0, calibrated ? "rgba(238,114,3,.19)" : "rgba(164,171,177,.12)");
    gradient.addColorStop(1, "rgba(164,171,177,0)");
    ctx.beginPath();
    points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, height - bottom);
    ctx.lineTo(points[0].x, height - bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    const last = points[points.length - 1];
    ctx.beginPath(); ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = stroke; ctx.fill();
  }

  async function calibrate() {
    const reference = Number(ui.reference.value);
    if (!Number.isFinite(reference) || reference < 30 || reference > 130) {
      ui.calibrationMessage.textContent = "Entre une référence comprise entre 30 et 130 dB(A).";
      return;
    }
    if (!analyser) {
      ui.calibrationMessage.textContent = "Démarre une mesure avant l'étalonnage.";
      return;
    }
    if (calibrationCapture) return;
    const runId = ++calibrationRun;
    calibrationCapture = [];
    ui.calibrate.disabled = true;
    ui.calibrate.textContent = "Écoute de référence… 5 s";
    ui.calibrationMessage.textContent = "Garde la source stable pendant les cinq secondes de mesure.";
    let countdown = 5;
    const tick = () => {
      countdown--;
      if (countdown > 0) {
        ui.calibrate.textContent = "Étalonnage… " + countdown + " s";
        calibrationTimer = window.setTimeout(tick, 1000);
      }
    };
    calibrationTimer = window.setTimeout(tick, 1000);
    await new Promise((resolve) => window.setTimeout(resolve, 5200));
    if (runId !== calibrationRun) return;
    const captured = calibrationCapture || [];
    calibrationCapture = null;
    if (captured.length < 5) {
      ui.calibrationMessage.textContent = "Signal trop faible ou trop court. Réessaie avec une source stable.";
      ui.calibrate.textContent = "Étalonner sur 5 secondes";
      updateCalibrationUI();
      return;
    }
    const sorted = captured.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    offsetBase = reference - median;
    fineOffset = 0;
    calibrated = true;
    saveCalibration();
    currentDb = rawReading + offsetBase;
    ui.calibrationMessage.textContent = "Étalonnage appliqué à cette source. Le résultat reste indicatif et dépend du micro.";
    ui.calibrate.textContent = "Étalonner à nouveau";
    updateCalibrationUI();
    renderReading();
    renderStats();
    drawChart();
  }

  function resetCalibration() {
    if (mode !== "tab") {
      try { localStorage.removeItem(calibrationKey); } catch (_) {}
    }
    offsetBase = 0;
    fineOffset = 0;
    calibrated = false;
    currentDb = rawReading;
    updateCalibrationUI();
    renderReading();
    renderStats();
    drawChart();
    ui.calibrationMessage.textContent = "Étalonnage effacé. Le niveau s'affiche de nouveau en dBFS.";
  }

  function exportCsv() {
    if (!readings.length) return;
    const rows = [["date_utc", "temps_ecoule_s", "niveau", "unite", "source"]];
    readings.forEach((reading) => {
      rows.push([reading.time, reading.elapsed.toFixed(1), reading.value.toFixed(2), reading.calibrated ? "dB(A)_estime" : "dBFS", sourceDescription]);
    });
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "meust-mesure-" + new Date().toISOString().replace(/[:.]/g, "-") + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function resetStats() {
    readings = [];
    lastRawSamples = [];
    elapsedBeforeStop = 0;
    if (startedAt) startedAt = Date.now();
    ui.elapsed.textContent = "00:00";
    ui.minimum.textContent = "—";
    ui.average.textContent = "—";
    ui.maximum.textContent = "—";
    ui.export.disabled = true;
    ui.chartEmpty.hidden = false;
    drawChart();
  }

  ui.sourceOptions.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  ui.start.addEventListener("click", startMeasurement);
  ui.stop.addEventListener("click", () => stopMeasurement());
  ui.calibrate.addEventListener("click", calibrate);
  ui.clearCalibration.addEventListener("click", resetCalibration);
  ui.export.addEventListener("click", exportCsv);
  ui.reset.addEventListener("click", resetStats);
  ui.fine.addEventListener("input", () => {
    fineOffset = Number(ui.fine.value);
    ui.fineValue.textContent = formatNumber(fineOffset) + " dB";
    if (calibrated) {
      currentDb = rawReading + offsetBase + fineOffset;
      saveCalibration();
      renderReading();
      renderStats();
      drawChart();
    }
  });
  ui.micSelect.addEventListener("change", async () => {
    if (mode !== "mic" || !analyser) return;
    await stopMeasurement("Changement de microphone. Redémarre la mesure.");
    activeDeviceId = ui.micSelect.value;
  });
  ui.privacyButton.addEventListener("click", () => { ui.modal.hidden = false; });
  ui.closeModal.addEventListener("click", () => { ui.modal.hidden = true; });
  ui.modalOk.addEventListener("click", () => { ui.modal.hidden = true; });
  ui.modal.addEventListener("click", (event) => { if (event.target === ui.modal) ui.modal.hidden = true; });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") ui.modal.hidden = true; });
  window.addEventListener("resize", () => drawChart());
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", refreshMicrophones);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    ui.install.hidden = false;
  });
  ui.install.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    ui.install.hidden = true;
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker non installé", error)));
  }


  // MEUST Deezer companion. Keep legacy message identifiers for installed companions.
  const deezerUi = {
    refresh: $("#deezer-refresh-button"), message: $("#deezer-message"),
    status: $("#deezer-connection-status"), player: $("#deezer-player"),
    tabs: $("#deezer-tab-select"), title: $("#deezer-track-title"),
    artist: $("#deezer-track-artist"), album: $("#deezer-track-album"),
    cover: $("#deezer-cover"), current: $("#deezer-current-time"),
    duration: $("#deezer-duration"), seek: $("#deezer-seek"),
    volume: $("#deezer-volume"), volumeValue: $("#deezer-volume-value"),
    toggle: $("#deezer-toggle"), previous: $("#deezer-previous"),
    next: $("#deezer-next"), feedback: $("#deezer-control-feedback"),
    openTab: $("#deezer-open-tab")
  };
  let deezerBridgeAvailable = false;
  let deezerSelectedTab = null;
  let deezerPoll = null;
  let deezerRequestCounter = 0;
  let deezerRefreshInFlight = false;
  let deezerStateInFlight = false;
  let deezerCommandInFlight = false;
  let deezerLastState = null;
  const deezerPending = new Map();

  function deezerRequest(action, payload = {}, timeout = 4500) {
    return new Promise((resolve) => {
      const requestId = "meust-" + (++deezerRequestCounter) + "-" + Date.now();
      const timerId = window.setTimeout(() => {
        deezerPending.delete(requestId);
        resolve(null);
      }, timeout);
      deezerPending.set(requestId, (response) => {
        window.clearTimeout(timerId);
        resolve(response);
      });
      window.postMessage({ source: "SOPP_DB_PAGE", requestId, action, ...payload }, window.location.origin);
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== "SOPP_DB_EXTENSION" || !message.requestId) return;
    const resolver = deezerPending.get(message.requestId);
    if (resolver) {
      deezerPending.delete(message.requestId);
      resolver(message.response || null);
    }
  });

  function deezerTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const safe = Math.floor(seconds);
    const hours = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    return hours ? hours + ":" + String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0")
      : mins + ":" + String(secs).padStart(2, "0");
  }

  function deezerUpdateControls() {
    const hasTab = deezerBridgeAvailable && Number.isInteger(deezerSelectedTab);
    const busy = deezerCommandInFlight;
    deezerUi.previous.disabled = !hasTab || busy;
    deezerUi.next.disabled = !hasTab || busy;
    deezerUi.toggle.disabled = !hasTab || !deezerLastState || busy;
    deezerUi.seek.disabled = !hasTab || !deezerLastState || !(Number(deezerLastState.duration) > 0) || busy;
    const hasVolume = deezerLastState && deezerLastState.volume !== null && Number.isFinite(Number(deezerLastState.volume));
    deezerUi.volume.disabled = !hasTab || !hasVolume || busy;
    deezerUi.refresh.disabled = deezerRefreshInFlight;
  }

  function deezerSetConnected(connected, message) {
    deezerBridgeAvailable = connected;
    deezerUi.status.textContent = connected ? "COMPAGNON CONNECTÉ" : "EXTENSION NON CONNECTÉE";
    deezerUi.status.classList.toggle("connected", connected);
    deezerUi.refresh.textContent = connected ? "Actualiser" : "Réessayer";
    if (message) deezerUi.message.textContent = message;
    if (!connected) deezerLastState = null;
    deezerUpdateControls();
  }

  function deezerRenderTabs(tabs) {
    const validTabs = (Array.isArray(tabs) ? tabs : []).filter((tab) => Number.isInteger(Number(tab.id)));
    const previous = String(deezerSelectedTab || deezerUi.tabs.value || "");
    deezerUi.tabs.innerHTML = "";
    if (!validTabs.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Aucun onglet Deezer ouvert";
      deezerUi.tabs.appendChild(option);
      deezerSelectedTab = null;
      deezerLastState = null;
      deezerUi.player.hidden = true;
      deezerUpdateControls();
      return;
    }
    validTabs.forEach((tab) => {
      const option = document.createElement("option");
      option.value = String(tab.id);
      option.textContent = (tab.title || "Deezer") + (tab.active ? " · onglet actif" : "");
      deezerUi.tabs.appendChild(option);
    });
    const stillThere = validTabs.some((tab) => String(tab.id) === previous);
    const activeTab = validTabs.find((tab) => tab.active);
    deezerSelectedTab = stillThere ? Number(previous) : Number((activeTab || validTabs[0]).id);
    deezerUi.tabs.value = String(deezerSelectedTab);
    deezerUi.player.hidden = false;
    deezerUi.message.textContent = validTabs.length + " onglet" + (validTabs.length > 1 ? "s" : "") + " Deezer détecté" + (validTabs.length > 1 ? "s" : "") + ".";
    deezerUpdateControls();
  }

  async function deezerRefresh() {
    if (deezerRefreshInFlight) return;
    deezerRefreshInFlight = true;
    deezerUpdateControls();
    deezerUi.message.textContent = "Recherche du compagnon et des onglets Deezer…";
    try {
      const response = await deezerRequest("LIST_TABS", {}, 5000);
      if (!response || !response.ok) {
        deezerSetConnected(false, response && response.error
          ? response.error
          : "Compagnon introuvable. Vérifie l’installation Chrome / Edge, puis recharge MEUST.");
        deezerUi.player.hidden = true;
        return;
      }
      deezerSetConnected(true);
      const tabs = response.tabs || [];
      deezerRenderTabs(tabs);
      if (tabs.length) {
        await deezerGetState();
      } else {
        deezerUi.message.textContent = "Compagnon prêt. Ouvre Deezer dans un autre onglet pour commencer.";
        deezerUi.feedback.textContent = "Aucun onglet Deezer ouvert pour le moment.";
      }
    } catch (error) {
      deezerSetConnected(false, error && error.message ? error.message : "Impossible de joindre le compagnon Deezer.");
      deezerUi.player.hidden = true;
    } finally {
      deezerRefreshInFlight = false;
      deezerUpdateControls();
      deezerSchedulePoll();
    }
  }

  async function deezerGetState() {
    if (!deezerBridgeAvailable || !Number.isInteger(deezerSelectedTab) || deezerStateInFlight) return false;
    deezerStateInFlight = true;
    try {
      const response = await deezerRequest("GET_STATE", { tabId: deezerSelectedTab }, 4500);
      if (!response || !response.ok || !response.state) {
        deezerUi.feedback.textContent = response && response.error
          ? response.error
          : "Lecteur indisponible. Vérifie l’onglet Deezer ou sélectionne-le à nouveau.";
        deezerLastState = null;
        deezerUpdateControls();
        return false;
      }
      const state = response.state;
      deezerLastState = state;
      deezerUi.title.textContent = state.title || "Aucune musique détectée";
      deezerUi.artist.textContent = state.artist || "Deezer";
      deezerUi.album.textContent = state.album || "Lecteur Deezer";
      if (state.cover && /^https:\/\//i.test(state.cover)) {
        if (deezerUi.cover.src !== state.cover) deezerUi.cover.src = state.cover;
        deezerUi.cover.style.visibility = "visible";
      } else {
        deezerUi.cover.removeAttribute("src");
        deezerUi.cover.style.visibility = "hidden";
      }
      const duration = Math.max(0, Number(state.duration) || 0);
      const current = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, Number(state.currentTime) || 0));
      deezerUi.duration.textContent = deezerTime(duration);
      deezerUi.current.textContent = deezerTime(current);
      deezerUi.seek.max = String(Math.max(1, Math.floor(duration)));
      if (document.activeElement !== deezerUi.seek) deezerUi.seek.value = String(Math.min(duration, Math.floor(current)));
      deezerUi.toggle.textContent = state.playing ? "Ⅱ" : "▶";
      deezerUi.toggle.setAttribute("aria-label", state.playing ? "Mettre en pause" : "Reprendre la lecture");
      deezerUi.openTab.href = state.url && /^https:\/\//i.test(state.url) ? state.url : "https://www.deezer.com/";
      if (state.volume !== null && Number.isFinite(Number(state.volume))) {
        const volume = Math.round(Math.max(0, Math.min(1, Number(state.volume))) * 100);
        if (document.activeElement !== deezerUi.volume) deezerUi.volume.value = String(volume);
        deezerUi.volumeValue.textContent = volume + " %";
      } else {
        deezerUi.volumeValue.textContent = "— %";
      }
      deezerUi.feedback.textContent = state.playing
        ? "Lecture en cours dans l’onglet Deezer sélectionné."
        : "Lecteur connecté. La musique est en pause ou prête à reprendre.";
      deezerUpdateControls();
      return true;
    } catch (error) {
      deezerUi.feedback.textContent = error && error.message ? error.message : "Impossible de lire l’état du lecteur Deezer.";
      deezerLastState = null;
      deezerUpdateControls();
      return false;
    } finally {
      deezerStateInFlight = false;
    }
  }

  async function deezerCommand(action, extra = {}) {
    if (!deezerBridgeAvailable || !Number.isInteger(deezerSelectedTab)) {
      deezerUi.feedback.textContent = "Ouvre Deezer dans un autre onglet, puis actualise la détection.";
      return false;
    }
    if (deezerCommandInFlight) return false;
    deezerCommandInFlight = true;
    deezerUpdateControls();
    try {
      const response = await deezerRequest("COMMAND", { tabId: deezerSelectedTab, command: action, ...extra }, 5500);
      if (!response || !response.ok) {
        deezerUi.feedback.textContent = response && response.error
          ? response.error
          : "La commande n’a pas été confirmée. Vérifie que le lecteur Deezer est chargé.";
        return false;
      }
      deezerUi.feedback.textContent = response.message || "Commande envoyée au lecteur Deezer.";
      await deezerGetState();
      return true;
    } catch (error) {
      deezerUi.feedback.textContent = error && error.message ? error.message : "Erreur pendant la commande Deezer.";
      return false;
    } finally {
      deezerCommandInFlight = false;
      deezerUpdateControls();
    }
  }

  function deezerSchedulePoll(delay) {
    if (deezerPoll) window.clearTimeout(deezerPoll);
    deezerPoll = null;
    if (document.hidden) return;
    const wait = Number.isFinite(delay) ? delay : (deezerSelectedTab ? 2600 : 7500);
    deezerPoll = window.setTimeout(async () => {
      if (document.hidden) return;
      if (!deezerBridgeAvailable || !Number.isInteger(deezerSelectedTab)) {
        await deezerRefresh();
      } else {
        await deezerGetState();
        deezerSchedulePoll();
      }
    }, wait);
  }

  deezerUi.refresh.addEventListener("click", deezerRefresh);
  deezerUi.tabs.addEventListener("change", () => {
    deezerSelectedTab = deezerUi.tabs.value ? Number(deezerUi.tabs.value) : null;
    deezerLastState = null;
    deezerUpdateControls();
    deezerGetState();
  });
  deezerUi.previous.addEventListener("click", () => deezerCommand("PREVIOUS"));
  deezerUi.toggle.addEventListener("click", async () => {
    if (!deezerLastState) {
      await deezerGetState();
      if (!deezerLastState) return;
    }
    await deezerCommand(deezerLastState.playing ? "PAUSE" : "PLAY");
  });
  deezerUi.next.addEventListener("click", () => deezerCommand("NEXT"));
  deezerUi.seek.addEventListener("change", () => deezerCommand("SEEK", { seconds: Number(deezerUi.seek.value) }));
  deezerUi.volume.addEventListener("input", () => {
    deezerUi.volumeValue.textContent = Math.round(Number(deezerUi.volume.value) || 0) + " %";
  });
  deezerUi.volume.addEventListener("change", () => {
    deezerCommand("SET_VOLUME", { seconds: Math.max(0, Math.min(1, Number(deezerUi.volume.value) / 100)) });
  });
  deezerUi.cover.addEventListener("error", () => { deezerUi.cover.style.visibility = "hidden"; });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (deezerPoll) window.clearTimeout(deezerPoll);
      deezerPoll = null;
    } else {
      deezerRefresh();
    }
  });
  deezerRefresh();


  loadCalibration();
  refreshMicrophones();
  drawChart();
})();