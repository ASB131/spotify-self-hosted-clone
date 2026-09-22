document.getElementById("save").addEventListener("click", () => {
  const apiBase = document.getElementById("apiBase").value.trim();
  const accessToken = document.getElementById("accessToken").value.trim();
  chrome.storage.sync.set({ apiBase, accessToken }, () => {
    document.getElementById("msg").textContent = "Saved.";
  });
});

chrome.storage.sync.get(["apiBase", "accessToken"], (data) => {
  if (data.apiBase) document.getElementById("apiBase").value = data.apiBase;
  if (data.accessToken) document.getElementById("accessToken").value = data.accessToken;
});
