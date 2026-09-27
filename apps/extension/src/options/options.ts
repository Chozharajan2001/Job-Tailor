/**
 * Options page: connection config + per-platform toggles.
 *
 * The "test connection" probe POSTs a deliberately empty draft to
 * /applications/from-extension: 401 means the key is bad, 400 means the key
 * passed auth and only the (intentionally invalid) body was rejected — a
 * valid-key signal without needing a separate whoami endpoint. No job or
 * application can be created by this probe; the Zod guard rejects first.
 */

const PLATFORMS = ["greenhouse", "lever", "ashby", "workday"] as const;
type PlatformId = (typeof PLATFORMS)[number];

const apiBaseEl = document.getElementById("apiBase") as HTMLInputElement | null;
const apiKeyEl = document.getElementById("apiKey") as HTMLInputElement | null;
const msgEl = document.getElementById("msg");

void load();

document.getElementById("save")?.addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      apiBase: apiBaseEl?.value.trim() ?? "",
      apiKey: apiKeyEl?.value.trim() ?? "",
    },
    () => flash("Saved", true),
  );
});

document
  .getElementById("test")
  ?.addEventListener("click", () => void testConnection());

async function load(): Promise<void> {
  const data = await chrome.storage.sync.get([
    "apiBase",
    "apiKey",
    "enabledPlatforms",
    "alwaysAddPlatforms",
  ]);
  if (apiBaseEl) apiBaseEl.value = (data.apiBase as string) ?? "";
  if (apiKeyEl) apiKeyEl.value = (data.apiKey as string) ?? "";

  const enabled = (data.enabledPlatforms ?? {}) as Partial<
    Record<PlatformId, boolean>
  >;
  const always = (data.alwaysAddPlatforms ?? {}) as Partial<
    Record<PlatformId, boolean>
  >;

  const tbody = document.getElementById("platforms");
  for (const id of PLATFORMS) {
    const row = document.createElement("tr");
    row.append(
      labelCell(id, cap(id)),
      checkboxCell(`enabled-${id}`, enabled[id] !== false),
    );
    const alwaysCell = checkboxCell(`always-${id}`, always[id] === true);
    row.append(alwaysCell);
    tbody?.append(row);
  }
  tbody?.addEventListener("change", () => void persistToggles());
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function labelCell(id: string, text: string): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = text;
  td.dataset.platform = id;
  return td;
}

function checkboxCell(inputId: string, checked: boolean): HTMLTableCellElement {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = inputId;
  input.checked = checked;
  td.append(input);
  return td;
}

async function persistToggles(): Promise<void> {
  const enabled: Partial<Record<PlatformId, boolean>> = {};
  const always: Partial<Record<PlatformId, boolean>> = {};
  for (const id of PLATFORMS) {
    enabled[id] =
      (document.getElementById(`enabled-${id}`) as HTMLInputElement | null)
        ?.checked ?? true;
    always[id] =
      (document.getElementById(`always-${id}`) as HTMLInputElement | null)
        ?.checked ?? false;
  }
  await chrome.storage.sync.set({
    enabledPlatforms: enabled,
    alwaysAddPlatforms: always,
  });
}

async function testConnection(): Promise<void> {
  const apiBase = apiBaseEl?.value.trim() ?? "";
  const apiKey = apiKeyEl?.value.trim() ?? "";
  if (!apiBase || !apiKey)
    return flash("Enter both URL and API key first", false);
  try {
    const res = await fetch(
      `${apiBase.replace(/\/$/, "")}/applications/from-extension`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ probe: true }),
      },
    );
    if (res.status === 401 || res.status === 503) {
      return flash(`Server rejected the key (HTTP ${res.status})`, false);
    }
    if (res.status === 400) {
      return flash("Connected — API key is valid", true);
    }
    return flash(`Unexpected response (HTTP ${res.status})`, false);
  } catch (err) {
    return flash(`Cannot reach server: ${String(err)}`, false);
  }
}

function flash(text: string, ok: boolean): void {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.className = ok ? "ok" : "err";
  setTimeout(() => {
    msgEl.textContent = "";
    msgEl.className = "";
  }, 4000);
}
