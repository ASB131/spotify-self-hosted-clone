/** Bridge: web app → extension storage (one-click connect). */
const AUTH_TYPES = new Set([
  "mix-player-extension-auth",
  "media-player-extension-auth",
  "resonance-extension-auth",
]);

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || !AUTH_TYPES.has(data.type)) return;

  chrome.runtime.sendMessage(
    {
      type: "saveAuth",
      apiBase: data.apiBase,
      webBase: data.webBase,
      accessToken: data.accessToken,
    },
    (response) => {
      const ok = !chrome.runtime.lastError && response?.ok;
      const payload = {
        ok: !!ok,
        error: chrome.runtime.lastError?.message || response?.error || null,
      };
      window.postMessage({ type: "mix-player-extension-auth-result", ...payload }, "*");
      window.postMessage({ type: "media-player-extension-auth-result", ...payload }, "*");
      window.postMessage({ type: "resonance-extension-auth-result", ...payload }, "*");
    }
  );
});

const version = chrome.runtime.getManifest().version;
window.postMessage({ type: "mix-player-extension-present", version }, "*");
window.postMessage({ type: "media-player-extension-present", version }, "*");
window.postMessage({ type: "resonance-extension-present", version }, "*");
