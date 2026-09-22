function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiBase", "accessToken"], (data) => {
      resolve({
        apiBase: data.apiBase || "http://localhost:8000",
        accessToken: data.accessToken || "",
      });
    });
  });
}

/** Call API via background service worker (avoids YouTube page CORS). */
function apiCall(path, method, body) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "api", path, method, body }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from extension background"));
        return;
      }
      resolve(response);
    });
  });
}

function injectButton() {
  if (document.getElementById("resonance-save-btn")) return;
  const target =
    document.querySelector("#top-level-buttons-computed") ||
    document.querySelector("#actions") ||
    document.querySelector("#menu-container ytd-menu-renderer")?.parentElement;
  if (!target) return;

  const btn = document.createElement("button");
  btn.id = "resonance-save-btn";
  btn.type = "button";
  btn.textContent = "Save to Resonance";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModal();
  });
  target.prepend(btn);
}

function videoMeta() {
  const titleEl = document.querySelector("h1 yt-formatted-string, h1.title, #title h1");
  const title = titleEl?.textContent?.trim() || document.title.replace(/ - YouTube$/, "");
  const channel =
    document.querySelector("#channel-name a, ytd-channel-name a, #owner #channel-name a")?.textContent?.trim() ||
    "";
  const url = location.href.split("&")[0];
  return { title, artist: channel, url };
}

function openModal() {
  if (document.getElementById("resonance-modal-backdrop")) return;
  const meta = videoMeta();
  const backdrop = document.createElement("div");
  backdrop.id = "resonance-modal-backdrop";
  backdrop.innerHTML = `
    <div id="resonance-modal">
      <h2 style="margin:0;font-size:18px">Save to library</h2>
      <label>Title<input id="rs-title" value="${escapeAttr(meta.title)}" /></label>
      <label>Artist<input id="rs-artist" value="${escapeAttr(meta.artist)}" /></label>
      <label>Quality
        <select id="rs-format">
          <option value="mp3">MP3</option>
          <option value="flac">FLAC</option>
        </select>
      </label>
      <label>Destination
        <select id="rs-dest">
          <option value="liked">Liked Songs</option>
        </select>
      </label>
      <div id="resonance-modal-actions">
        <button type="button" id="rs-cancel">Cancel</button>
        <button type="button" id="rs-save">Download</button>
      </div>
      <p id="rs-status" style="font-size:12px;color:#1db954;margin-top:8px"></p>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#rs-cancel").addEventListener("click", () => backdrop.remove());
  backdrop.querySelector("#rs-save").addEventListener("click", () => submitDownload(backdrop, meta.url));
  loadPlaylists(backdrop);
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

async function loadPlaylists(backdrop) {
  const cfg = await getConfig();
  if (!cfg.accessToken) return;
  try {
    const res = await apiCall("/api/v1/playlists", "GET");
    if (!res.ok || !Array.isArray(res.data)) return;
    const sel = backdrop.querySelector("#rs-dest");
    res.data
      .filter((p) => !p.is_liked_songs)
      .forEach((p) => {
        const opt = document.createElement("option");
        opt.value = String(p.id);
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
  } catch {
    /* ignore */
  }
}

async function submitDownload(backdrop, url) {
  const cfg = await getConfig();
  const status = backdrop.querySelector("#rs-status");
  if (!cfg.accessToken) {
    status.textContent = "Set API URL and token in extension options (or Extension connect page).";
    status.style.color = "#f87171";
    return;
  }
  const title = backdrop.querySelector("#rs-title").value;
  const artist = backdrop.querySelector("#rs-artist").value;
  const format = backdrop.querySelector("#rs-format").value;
  const dest = backdrop.querySelector("#rs-dest").value;
  const body = {
    url,
    title,
    artist,
    format,
    add_to_liked: dest === "liked",
    playlist_id: dest === "liked" ? null : Number(dest),
  };
  status.textContent = "Queuing…";
  status.style.color = "#1db954";
  try {
    const res = await apiCall("/api/v1/downloads", "POST", body);
    if (!res.ok) {
      const detail = res.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d.msg || d).join(", ")
            : res.data?.detail || `HTTP ${res.status}`;
      throw new Error(msg || "Failed");
    }
    status.textContent = `Queued (task ${res.data.task_id})`;
  } catch (e) {
    status.textContent = e.message || "Error";
    status.style.color = "#f87171";
  }
}

const observer = new MutationObserver(() => injectButton());
observer.observe(document.documentElement, { childList: true, subtree: true });
injectButton();
