/**
 * Options page shell. Platform toggles + "test connection" land in Task 16;
 * this stub only persists the two core fields so the build is usable.
 */
const apiBaseEl = document.getElementById("apiBase") as HTMLInputElement | null;
const apiKeyEl = document.getElementById("apiKey") as HTMLInputElement | null;
const saveEl = document.getElementById("save");
const savedEl = document.getElementById("saved");

chrome.storage.sync.get(["apiBase", "apiKey"], (data) => {
  if (apiBaseEl && typeof data.apiBase === "string")
    apiBaseEl.value = data.apiBase;
  if (apiKeyEl && typeof data.apiKey === "string") apiKeyEl.value = data.apiKey;
});

saveEl?.addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      apiBase: apiBaseEl?.value ?? "",
      apiKey: apiKeyEl?.value ?? "",
    },
    () => {
      if (savedEl) savedEl.textContent = "Saved";
      setTimeout(() => {
        if (savedEl) savedEl.textContent = "";
      }, 1500);
    },
  );
});
