import type { ApplicationDraft } from "../types.js";

/**
 * Popup: shows the detected application and the user's decision buttons.
 * Every string from the page is rendered via textContent — never innerHTML —
 * so hostile job-page content cannot mark up this popup.
 */

const root = document.getElementById("root");

void render();

async function render(): Promise<void> {
  if (!root) return;
  const { pendingDraft } = await chrome.storage.local.get("pendingDraft");
  const draft = pendingDraft as ApplicationDraft | undefined;

  if (!draft) {
    root.textContent = "No application detected on this tab yet.";
    return;
  }

  root.replaceChildren(
    el("div", "title", draft.jobTitle),
    el("div", "company", `${draft.companyName} · ${draft.platform}`),
    el("div", "url", draft.sourceUrl),
    el("div", "row", ""),
  );

  const addBtn = buttonEl("add", "Add to JobTailor");
  const skipBtn = buttonEl("skip", "Skip");
  const result = el("div", "", "");
  result.id = "result";

  addBtn.addEventListener("click", () => void doAdd());
  skipBtn.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "DISMISS" }).then(() => render());
  });

  root.append(addBtn, skipBtn, result);

  async function doAdd(): Promise<void> {
    addBtn.disabled = true;
    skipBtn.disabled = true;
    result.textContent = "Adding…";
    const response = (await chrome.runtime.sendMessage({
      type: "USER_CONFIRMED_ADD",
      draft,
    })) as PostResult | undefined;
    if (response?.ok) {
      result.className = "ok";
      result.textContent = response.alreadyTracked
        ? "Already tracked — nothing duplicated."
        : "Added to your tracker ✓";
      addBtn.style.display = "none";
      skipBtn.style.display = "none";
    } else {
      result.className = "err";
      result.textContent = response?.error ?? "Unknown error";
      addBtn.disabled = false;
      skipBtn.disabled = false;
    }
  }
}

interface PostResult {
  ok: boolean;
  error?: string;
  alreadyTracked?: boolean;
}

function el(tag: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function buttonEl(id: string, text: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.id = id;
  node.textContent = text;
  return node;
}
