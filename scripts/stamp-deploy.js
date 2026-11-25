#!/usr/bin/env node
/**
 * Copy the site into a deploy directory and stamp the footer from the
 * commit being published. Does not edit VERSION and does not write back
 * to the git checkout.
 *
 * Also records the Nikke game version and server build this deploy was
 * published for. A failed version lookup leaves those fields blank and
 * still publishes.
 *
 *   node scripts/stamp-deploy.js dist
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { fetchLauncherVersion, LAUNCHER_VERSION_URL, nikkeVersionStamp } = require("./lib/game-catalog");

const root = path.join(__dirname, "..");
const dest = path.resolve(root, process.argv[2] || "dist");

function git(args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function copyTree(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "dist" || entry.name === "node_modules") continue;
        const src = path.join(from, entry.name);
        const out = path.join(to, entry.name);
        if (entry.isDirectory()) copyTree(src, out);
        else if (entry.isFile()) fs.copyFileSync(src, out);
    }
}

function js(value) {
    return JSON.stringify(value == null ? "" : String(value));
}

async function readNikkeVersions() {
    try {
        const url = process.env.NIKKE_LAUNCHER_VERSION_URL || LAUNCHER_VERSION_URL;
        return nikkeVersionStamp(await fetchLauncherVersion(url));
    } catch (err) {
        console.warn(`Nikke version stamp skipped: ${err.message || err}`);
        return nikkeVersionStamp(null);
    }
}

async function main() {
    const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim() || "0.0.0";
    const commit = git(["rev-parse", "--short", "HEAD"]);
    const date = git(["log", "-1", "--format=%cd", "--date=format:%Y-%m-%d %H:%M:%S"]);
    const nikke = await readNikkeVersions();

    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyTree(root, dest);

    const buildInfo = `// ============================================================
//  AUTO-GENERATED FILE -- DO NOT EDIT BY HAND
//  Stamped by scripts/stamp-deploy.js for this Pages deploy.
//  VERSION is copied through unchanged.
//  Game is version_info.version_name. Server is version_info.build_id.
// ============================================================
window.BUILD_INFO = {
  version: ${js(version)},
  commit:  ${js(commit)},
  date:    ${js(date)},
  nikkeClient: ${js(nikke.client)},
  nikkeClientFull: ${js(nikke.clientFull)},
  nikkeServer: ${js(nikke.server)},
  nikkeCdn: ${js(nikke.cdn)}
};
`;
    fs.writeFileSync(path.join(dest, "knowledge", "build-info.js"), buildInfo);

    const indexPath = path.join(dest, "index.html");
    const html = fs.readFileSync(indexPath, "utf8");
    const stamped = html.replace(
        /(href|src)="((?:styles|js|knowledge)\/[^"?]+\.(?:css|js))(?:\?v=[^"]*)?"/g,
        `$1="$2?v=${commit}"`,
    );
    fs.writeFileSync(indexPath, stamped);
    const nikkeLabel = nikke.client
        ? ` game ${nikke.client} server ${nikke.server || "—"}`
        : " Nikke versions unavailable";
    console.log(`Stamped ${dest} v${version} build ${commit} (${date})${nikkeLabel}`);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
