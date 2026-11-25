(() => {
  "use strict";
  const APP_SOURCE = "SOPP_DB_PAGE";
  const EXT_SOURCE = "SOPP_DB_EXTENSION";
  const allowedOrigin = "https://sopp24.github.io";

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== allowedOrigin) return;
    const request = event.data;
    if (!request || request.source !== APP_SOURCE || !request.requestId) return;

    const payload = {
      type: "SOPP_DB_DEEZER_REQUEST",
      action: request.action,
      tabId: request.tabId,
      command: request.command,
      seconds: request.seconds
    };

    chrome.runtime.sendMessage(payload, (response) => {
      const error = chrome.runtime.lastError;
      window.postMessage({
        source: EXT_SOURCE,
        requestId: request.requestId,
        response: error ? { ok: false, error: error.message } : (response || { ok: false, error: "Le compagnon n'a pas répondu." })
      }, allowedOrigin);
    });
  });
})();