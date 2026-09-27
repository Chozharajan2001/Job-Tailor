import type { PlatformConfig } from "./types.js";
import { greenhouseDetector } from "./detectors/greenhouse.js";
import { leverDetector } from "./detectors/lever.js";
import { ashbyDetector } from "./detectors/ashby.js";
import { workdayDetector } from "./detectors/workday.js";
import { greenhouseExtractor } from "./extractors/greenhouse.js";
import { leverExtractor } from "./extractors/lever.js";
import { ashbyExtractor } from "./extractors/ashby.js";
import { workdayExtractor } from "./extractors/workday.js";

/**
 * Single source of truth mapping a page URL to its detector + extractor.
 * Adding a platform = one entry here + two files. Must stay in sync with
 * the content_scripts `matches` in manifest.json (the manifest test guards
 * the domain list; registry tests guard the regexes).
 */
export const PLATFORMS: PlatformConfig[] = [
  {
    id: "greenhouse",
    urlMatch: /^https:\/\/(boards|job-boards)\.greenhouse\.io\//,
    detector: greenhouseDetector,
    extractor: greenhouseExtractor,
  },
  {
    id: "lever",
    urlMatch: /^https:\/\/jobs\.lever\.co\//,
    detector: leverDetector,
    extractor: leverExtractor,
  },
  {
    id: "ashby",
    urlMatch: /^https:\/\/jobs\.ashbyhq\.com\//,
    detector: ashbyDetector,
    extractor: ashbyExtractor,
  },
  {
    id: "workday",
    urlMatch: /^https:\/\/[\w-]+\.wd\d+\.myworkdayjobs\.com\//,
    detector: workdayDetector,
    extractor: workdayExtractor,
  },
];

export function detectPlatform(url: string): PlatformConfig | null {
  return PLATFORMS.find((p) => p.urlMatch.test(url)) ?? null;
}
