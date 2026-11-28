#!/usr/bin/env node
/**
 * Bump VERSION from the commits that just landed on main.
 *
 *   node scripts/bump-version.js --message "feat(catalog): add a view"
 *   node scripts/bump-version.js --write --push
 *
 * feat bumps minor. fix, perf, and chore(data) bump patch.
 * A breaking marker bumps major. Other chores do not bump.
 * A push that already changes VERSION is left alone.
 * --push commits "chore(release): vX.Y.Z [skip ci]" and pushes main.
 * The Pages job stamps that VERSION into the artifact in the same run.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const versionPath = path.join(root, "VERSION");

function argValue(flag) {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : null;
}

function git(args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function bumpKind(message) {
    const text = String(message || "");
    const subject = text.split("\n")[0].trim();
    if (!subject || /^chore\(release\):/.test(subject)) return null;
    const match = subject.match(/^([a-z]+)(\([^)]*\))?(!)?:/);
    if (!match) return null;
    const type = match[1];
    const scope = match[2] || "";
    const breaking = match[3] === "!" || text.includes("BREAKING CHANGE");
    if (breaking && (type === "feat" || type === "fix" || type === "perf")) return "major";
    if (type === "feat") return "minor";
    if (type === "fix" || type === "perf") return "patch";
    if (type === "chore" && scope === "(data)") return "patch";
    return null;
}

function highestKind(messages) {
    const rank = { patch: 1, minor: 2, major: 3 };
    let best = null;
    for (const message of messages) {
        const kind = bumpKind(message);
        if (kind && (!best || rank[kind] > rank[best])) best = kind;
    }
    return best;
}

function applyBump(version, kind) {
    const match = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) throw new Error(`VERSION is not major.minor.patch: ${version}`);
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (kind === "major") return `${major + 1}.0.0`;
    if (kind === "minor") return `${major}.${minor + 1}.0`;
    if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
    return null;
}

function commitMessages() {
    const before = process.env.PUSH_BEFORE || "";
    if (!before || /^0+$/.test(before)) return [git(["log", "-1", "--format=%B"])];
    return git(["log", `${before}..HEAD`, "--format=%B%x1e"])
        .split("\x1e")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function versionTouched() {
    const before = process.env.PUSH_BEFORE || "";
    if (!before || /^0+$/.test(before)) return false;
    return git(["diff", "--name-only", before, "HEAD", "--", "VERSION"]).trim().length > 0;
}

function pushRelease(next) {
    if (process.env.GITHUB_REPOSITORY !== "joevdotme/Nikke-Manager") {
        console.log("VERSION is bumped on joevdotme/Nikke-Manager only.");
        process.exit(0);
    }
    const token = process.env.CATALOG_GITHUB_TOKEN || "";
    if (!token) {
        console.error("CATALOG_GITHUB_TOKEN is not set. VERSION was not pushed.");
        process.exit(1);
    }
    git(["config", "user.name", "github-actions[bot]"]);
    git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    git(["add", "--", "VERSION"]);
    git(["commit", "-m", `chore(release): v${next} [skip ci]`]);
    try {
        git(["config", "--unset-all", "http.https://github.com/.extraheader"]);
    } catch (err) {
        if (!err.status) throw err;
    }
    execFileSync(
        "git",
        ["push", `https://x-access-token:${token}@github.com/joevdotme/Nikke-Manager.git`, "HEAD:main"],
        { cwd: root, stdio: "inherit" },
    );
    console.log(`Pushed VERSION ${next}`);
}

function main() {
    const messageArg = argValue("--message");
    const messages = messageArg != null ? [messageArg] : commitMessages();
    const current = fs.readFileSync(versionPath, "utf8").trim() || "0.0.0";
    if (messageArg == null && versionTouched()) {
        console.log(`VERSION already changed in this push (${current}).`);
        return;
    }
    const kind = highestKind(messages);
    const next = kind ? applyBump(current, kind) : null;
    if (!next || next === current) {
        console.log("No VERSION bump.");
        return;
    }
    console.log(`${current} -> ${next} (${kind})`);
    if (!process.argv.includes("--write")) return;
    fs.writeFileSync(versionPath, `${next}\n`);
    if (process.argv.includes("--push")) pushRelease(next);
}

module.exports = { bumpKind, highestKind, applyBump };

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error(err.message || err);
        process.exit(1);
    }
}
