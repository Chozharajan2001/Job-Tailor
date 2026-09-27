/**
 * MV3 service worker (background). Real DETECTED handling lands in Task 15;
 * this stub keeps the build graph and manifest valid.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("JobTailor Auto-Track installed");
});
