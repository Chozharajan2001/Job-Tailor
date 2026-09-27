import type { ApplicationDraft } from "../types.js";

/**
 * MV3 service worker: the only place that talks to the JobTailor server.
 * Content scripts never hold the API key and never hit the network —
 * that separation keeps the key out of every ATS origin's reach.
 */

interface PostResult {
  ok: boolean;
  error?: string;
  alreadyTracked?: boolean;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("JobTailor Auto-Track installed");
});

chrome.runtime.onMessage.addListener(
  (
    msg: { type: string; draft?: ApplicationDraft },
    _sender,
    sendResponse: (r: PostResult) => void,
  ) => {
    if (msg?.type === "DETECTED" && msg.draft) {
      void handleDetected(msg.draft);
      return false;
    }
    if (msg?.type === "USER_CONFIRMED_ADD" && msg.draft) {
      postDraft(msg.draft).then(async (result) => {
        if (result.ok) await clearPending();
        sendResponse(result);
      });
      return true; // async response
    }
    if (msg?.type === "DISMISS") {
      void clearPending();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  },
);

async function handleDetected(draft: ApplicationDraft): Promise<void> {
  await chrome.storage.local.set({ pendingDraft: draft });

  // "Always add" is opt-in per platform in Options; default is ask-first.
  const { alwaysAddPlatforms } = await chrome.storage.sync.get([
    "alwaysAddPlatforms",
  ]);
  const always =
    (alwaysAddPlatforms as Record<string, boolean> | undefined)?.[
      draft.platform
    ] === true;

  if (always) {
    const result = await postDraft(draft);
    if (result.ok) await clearPending();
    return;
  }
  chrome.action.setBadgeText({ text: "1" });
}

async function clearPending(): Promise<void> {
  await chrome.storage.local.remove("pendingDraft");
  chrome.action.setBadgeText({ text: "" });
}

async function postDraft(draft: ApplicationDraft): Promise<PostResult> {
  const { apiKey, apiBase } = await chrome.storage.sync.get([
    "apiKey",
    "apiBase",
  ]);
  if (!apiKey || !apiBase) {
    return {
      ok: false,
      error:
        "Open the extension Settings page and enter your JobTailor API key and server URL first.",
    };
  }
  try {
    const res = await fetch(
      `${String(apiBase).replace(/\/$/, "")}/applications/from-extension`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": String(apiKey),
        },
        body: JSON.stringify(draft),
      },
    );
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: { message?: string };
      data?: { applicationCreated?: boolean };
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        error: body?.error?.message ?? `Server responded HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      alreadyTracked: body?.data?.applicationCreated === false,
    };
  } catch (err) {
    return { ok: false, error: `Could not reach the server: ${String(err)}` };
  }
}
