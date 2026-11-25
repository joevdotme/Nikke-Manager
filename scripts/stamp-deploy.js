#!/usr/bin/env node
/**
 * Copy the site into a deploy directory and stamp the footer from the
 * commit being published. Does not edit VERSION and does not write back
 * to the git checkout.
 *
 *   node scripts/stamp-deploy.js dist
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

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

const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim() || "0.0.0";
const commit = git(["rev-parse", "--short", "HEAD"]);
const date = git(["log", "-1", "--format=%cd", "--date=format:%Y-%m-%d %H:%M:%S"]);

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
copyTree(root, dest);

const buildInfo = `// ============================================================
//  AUTO-GENERATED FILE -- DO NOT EDIT BY HAND
//  Stamped by scripts/stamp-deploy.js for this Pages deploy.
//  VERSION is copied through unchanged.
// ============================================================
window.BUILD_INFO = {
  version: "${version}",
  commit:  "${commit}",
  date:    "${date}"
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
console.log(`Stamped ${dest} v${version} build ${commit} (${date})`);
