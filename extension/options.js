function openConnect() {
  const web = document.getElementById("webBase").value.trim().replace(/\/$/, "");
  if (!web) {
    document.getElementById("msg").textContent = "Set web app URL first.";
    return;
  }
  chrome.tabs.create({ url: `${web}/extension/connect` });
}

document.getElementById("openConnect").addEventListener("click", openConnect);

function persist(data, done) {
  chrome.storage.local.set(data, () => {
    chrome.storage.sync.set(data, done);
  });
}

document.getElementById("save").addEventListener("click", () => {
  const apiBase = document.getElementById("apiBase").value.trim().replace(/\/$/, "");
  const webBase = document.getElementById("webBase").value.trim().replace(/\/$/, "");
  const accessToken = document.getElementById("accessToken").value.trim();
  persist({ apiBase, webBase, accessToken }, () => {
    document.getElementById("msg").textContent = "Saved.";
  });
});

chrome.storage.local.get(["apiBase", "webBase", "accessToken"], (local) => {
  chrome.storage.sync.get(["apiBase", "webBase", "accessToken"], (sync) => {
    const apiBase = local.apiBase || sync.apiBase;
    const webBase = local.webBase || sync.webBase;
    const accessToken = local.accessToken || sync.accessToken;
    if (apiBase) document.getElementById("apiBase").value = apiBase;
    if (webBase) document.getElementById("webBase").value = webBase;
    if (accessToken) document.getElementById("accessToken").value = accessToken;
  });
});
