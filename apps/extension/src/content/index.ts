import { detectPlatform } from "../platform-registry.js";
import type { PlatformConfig } from "../types.js";

/**
 * Content script entry: injected on every ATS-domain tab. Finds its platform
 * config, watches the page for an application-submission confirmation, and
 * messages the background worker with the extracted draft — once per tab.
 */
const platform = detectPlatform(location.href);
if (platform) {
  void init(platform);
}

async function init(config: PlatformConfig): Promise<void> {
  if (!(await isPlatformEnabled(config.id))) return;

  let sent = false;

  function check(): void {
    if (sent) return;
    const ctx = { url: location.href, document };
    if (!config.detector.isApplicationSubmitted(ctx)) return;
    try {
      const draft = config.extractor.extract(ctx);
      sent = true;
      observer.disconnect();
      chrome.runtime.sendMessage({ type: "DETECTED", draft }).catch(() => {
        /* extension reloaded — user refreshes the page */
      });
    } catch (err) {
      console.warn("JobTailor extract failed:", err);
    }
  }

  const observer = new MutationObserver(() => check());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  // Workday and Ashby are SPAs — submit is a client-side navigation.
  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);
  check(); // already on a thank-you page (e.g. mid-page reload)
}

function isPlatformEnabled(id: PlatformConfig["id"]): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["enabledPlatforms"], (data) => {
      const map = (data.enabledPlatforms ?? {}) as Record<string, boolean>;
      resolve(map[id] !== false); // default: enabled
    });
  });
}
