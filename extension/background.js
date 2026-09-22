chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ apiBase: "http://localhost:8000", webBase: "http://localhost:3000" });
});

function saveAuth(payload) {
  const apiBase = String(payload.apiBase || "http://localhost:8000").replace(/\/$/, "");
  const webBase = String(payload.webBase || "http://localhost:3000").replace(/\/$/, "");
  const accessToken = String(payload.accessToken || "").trim();
  const data = { apiBase, webBase, accessToken };
  return Promise.all([
    new Promise((resolve) => chrome.storage.local.set(data, resolve)),
    new Promise((resolve) => chrome.storage.sync.set(data, resolve)),
  ]).then(() => ({ ok: true }));
}

/**
 * Content scripts must not call the API directly (CORS Origin is often youtube.com).
 * All API traffic goes through this service worker.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "saveAuth") {
    saveAuth(message)
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type !== "api") {
    return false;
  }
  (async () => {
    try {
      const local = await chrome.storage.local.get(["apiBase", "accessToken"]);
      const sync = await chrome.storage.sync.get(["apiBase", "accessToken"]);
      const apiBase = (local.apiBase || sync.apiBase || "http://localhost:8000").replace(/\/$/, "");
      const accessToken = local.accessToken || sync.accessToken || "";
      const path = message.path || "";
      const method = message.method || "GET";
      const headers = {
        Accept: "application/json",
        ...(message.headers || {}),
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
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
  return true;
});
