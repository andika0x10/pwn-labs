import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = {
  ...process.env,
  LD_LIBRARY_PATH: "/home/andika/.cache/pw-libs/root/usr/lib/x86_64-linux-gnu",
  CHROME_PATH: "/home/andika/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
};
for (const path of ["/", "/docs", "/docs/memulai", "/play", "/leaderboard", "/404"]) {
  execFileSync(
    "npx",
    ["--yes", "lighthouse@latest", "http://localhost:4400" + path, "--only-categories=accessibility,best-practices,seo", "--chrome-flags=--headless --no-sandbox", "--quiet", "--output=json", "--output-path=lh.json"],
    { env, stdio: "ignore" },
  );
  const j = JSON.parse(readFileSync("lh.json", "utf8"));
  const fails = Object.values(j.audits).filter((a) => a.score === 0).map((a) => a.id);
  console.log(path, j.finalDisplayedUrl.replace("http://localhost:4400", ""), Object.entries(j.categories).map(([k, v]) => k.slice(0, 4) + ":" + Math.round(v.score * 100)).join(" "), fails.join(","));
}
