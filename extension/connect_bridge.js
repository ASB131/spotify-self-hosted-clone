/** Bridge: web app → extension storage (one-click connect). */
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== "resonance-extension-auth") return;

  chrome.runtime.sendMessage(
    {
      type: "saveAuth",
      apiBase: data.apiBase,
      webBase: data.webBase,
      accessToken: data.accessToken,
    },
    (response) => {
      const ok = !chrome.runtime.lastError && response?.ok;
      window.postMessage(
        {
          type: "resonance-extension-auth-result",
          ok: !!ok,
          error: chrome.runtime.lastError?.message || response?.error || null,
        },
        "*"
      );
    }
  );
});

window.postMessage({ type: "resonance-extension-present", version: chrome.runtime.getManifest().version }, "*");
