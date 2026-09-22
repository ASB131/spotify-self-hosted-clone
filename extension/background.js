chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ apiBase: "http://localhost:8000" });
});

/**
 * Content scripts must not call the API directly (CORS Origin is often youtube.com).
 * All API traffic goes through this service worker, which has host_permissions and
 * is not subject to page CORS.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "api") {
    return false;
  }
  (async () => {
    try {
      const cfg = await chrome.storage.sync.get(["apiBase", "accessToken"]);
      const apiBase = (cfg.apiBase || "http://localhost:8000").replace(/\/$/, "");
      const path = message.path || "";
      const method = message.method || "GET";
      const headers = {
        Accept: "application/json",
        ...(message.headers || {}),
      };
      if (cfg.accessToken) {
        headers.Authorization = `Bearer ${cfg.accessToken}`;
      }
      let body;
      if (message.body !== undefined && message.body !== null) {
        headers["Content-Type"] = "application/json";
        body = typeof message.body === "string" ? message.body : JSON.stringify(message.body);
      }
      const res = await fetch(`${apiBase}${path}`, { method, headers, body });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      sendResponse({ ok: res.ok, status: res.status, data });
    } catch (err) {
      sendResponse({
        ok: false,
        status: 0,
        data: { detail: err instanceof Error ? err.message : String(err) },
      });
    }
  })();
  return true; // keep channel open for async sendResponse
});
