import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "dist");
const watch = process.argv.includes("--watch");

// Fresh dist/ on every run (Chrome "Load unpacked" caches aggressively).
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entries = [
  ["src/background/index.ts", "background.js"],
  ["src/content/index.ts", "content.js"],
  ["src/popup/popup.ts", "popup.js"],
  ["src/options/options.ts", "options.js"],
];

const sharedOptions = {
  bundle: true,
  format: "iife", // MV3 content scripts + classic extension pages, no ESM loader
  target: "chrome120",
  sourcemap: true,
  minify: false,
};

async function run() {
  const builds = entries.map(([entry, name]) => ({
    ...sharedOptions,
    entryPoints: [join(root, entry)],
    outfile: join(outDir, name),
  }));

  if (watch) {
    // One watch context per entry keeps incremental rebuilds cheap.
    for (const opts of builds) {
      const ctx = await context(opts);
      await ctx.watch();
    }
    console.log("esbuild watching — press Ctrl+C to stop");
    return;
  }

  for (const opts of builds) await build(opts);
}

// Static assets: manifest + extension pages (their <script src> must
// resolve next to the copied js bundles in dist/).
cpSync(join(root, "manifest.json"), join(outDir, "manifest.json"));
cpSync(join(root, "src", "popup", "popup.html"), join(outDir, "popup.html"));
cpSync(join(root, "src", "options", "options.html"), join(outDir, "options.html"));

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
