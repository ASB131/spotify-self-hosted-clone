function openConnect() {
  const web = document.getElementById("webBase").value.trim().replace(/\/$/, "");
  if (!web) {
    document.getElementById("msg").textContent = "Set web app URL first.";
    return;
  }
  chrome.tabs.create({ url: `${web}/extension/connect` });
}

document.getElementById("openConnect").addEventListener("click", openConnect);

document.getElementById("save").addEventListener("click", () => {
  const apiBase = document.getElementById("apiBase").value.trim();
  const webBase = document.getElementById("webBase").value.trim();
  const accessToken = document.getElementById("accessToken").value.trim();
  chrome.storage.sync.set({ apiBase, webBase, accessToken }, () => {
    document.getElementById("msg").textContent = "Saved.";
  });
});

chrome.storage.sync.get(["apiBase", "webBase", "accessToken"], (data) => {
  if (data.apiBase) document.getElementById("apiBase").value = data.apiBase;
  if (data.webBase) document.getElementById("webBase").value = data.webBase;
  if (data.accessToken) document.getElementById("accessToken").value = data.accessToken;
});
