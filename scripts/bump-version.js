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
 * If main has moved, the bump is committed on that tip and the push is retried.
 * A run with nothing to bump still stamps a newer VERSION already on main.
 * The Pages job stamps that VERSION into the artifact in the same run.
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
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

function compareVersions(a, b) {
    const left = String(a).trim().split(".").map(Number);
    const right = String(b).trim().split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const diff = (left[i] || 0) - (right[i] || 0);
        if (diff) return diff;
    }
    return 0;
}

function redact(text) {
    return String(text || "").replace(/x-access-token:[^@\s]+/g, "x-access-token:redacted");
}

function remoteUrl(token) {
    return `https://x-access-token:${token}@github.com/joevdotme/Nikke-Manager.git`;
}

function clearExtraHeader() {
    try {
        git(["config", "--unset-all", "http.https://github.com/.extraheader"]);
    } catch (err) {
        if (!err.status) throw err;
    }
}

function fetchMain(remote) {
    git(["fetch", remote, "+refs/heads/main:refs/remotes/origin/main"]);
}

function versionAt(rev) {
    try {
        return git(["show", `${rev}:VERSION`]).trim() || "0.0.0";
    } catch (err) {
        if (!err.status) throw err;
        return "0.0.0";
    }
}

function releaseFor(source) {
    let log = "";
    try {
        log = git([
            "log",
            `${source}..origin/main`,
            "--grep",
            `Released-Commit: ${source}`,
            "--format=%B%x1e",
        ]);
    } catch (err) {
        if (!err.status) throw err;
        return null;
    }
    const line = `Released-Commit: ${source}`;
    for (const body of log.split("\x1e")) {
        if (!body.split("\n").some((entry) => entry.trim() === line)) continue;
        const match = body.match(/chore\(release\): v(\d+\.\d+\.\d+)/);
        return match ? match[1] : null;
    }
    return null;
}

function commitVersionOn(parent, version, source) {
    const index = path.join(os.tmpdir(), `nikke-version-${process.pid}.index`);
    fs.rmSync(index, { force: true });
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const run = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", env });
    try {
        run(["read-tree", parent]);
        const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
            cwd: root,
            encoding: "utf8",
            input: `${version}\n`,
        }).trim();
        run(["update-index", "--add", "--cacheinfo", `100644,${blob},VERSION`]);
        const tree = run(["write-tree"]).trim();
        return execFileSync(
            "git",
            [
                "commit-tree",
                tree,
                "-p",
                parent,
                "-m",
                `chore(release): v${version} [skip ci]`,
                "-m",
                `Released-Commit: ${source}`,
            ],
            { cwd: root, encoding: "utf8" },
        ).trim();
    } finally {
        fs.rmSync(index, { force: true });
    }
}

function pushRejected(text) {
    return /non-fast-forward|tip of your current branch is behind/i.test(text);
}

function writeGitOutput(stdout, stderr) {
    if (stdout.trim()) process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
    if (stderr.trim()) process.stderr.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
}

function pushCommit(remote, commit) {
    const result = spawnSync("git", ["push", remote, `${commit}:main`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = redact(result.stdout || "");
    const stderr = redact(result.stderr || "");
    writeGitOutput(stdout, stderr);
    if (result.status === 0) return true;
    const detail = `${stdout}\n${stderr}`;
    if (pushRejected(detail)) return false;
    throw new Error(detail.trim() || `git push exited ${result.status}`);
}

function releaseToken() {
    if (process.env.GITHUB_REPOSITORY !== "joevdotme/Nikke-Manager") {
        console.log("VERSION is bumped on joevdotme/Nikke-Manager only.");
        process.exit(0);
    }
    const token = process.env.CATALOG_GITHUB_TOKEN || "";
    if (!token) {
        console.error("CATALOG_GITHUB_TOKEN is not set. VERSION was not pushed.");
        process.exit(1);
    }
    return token;
}

function keepRemoteVersion(current) {
    if (process.env.GITHUB_REPOSITORY !== "joevdotme/Nikke-Manager") return;
    const token = process.env.CATALOG_GITHUB_TOKEN || "";
    if (!token) return;
    try {
        clearExtraHeader();
        fetchMain(remoteUrl(token));
        const remoteVersion = versionAt("origin/main");
        if (compareVersions(remoteVersion, current) > 0) {
            fs.writeFileSync(versionPath, `${remoteVersion}\n`);
            console.log(`VERSION on main is ${remoteVersion}.`);
        }
    } catch (err) {
        console.warn(`Could not read VERSION on main: ${redact(err.message || err)}`);
    }
}

function pushRelease(current, kind) {
    const token = releaseToken();
    const remote = remoteUrl(token);
    const source = git(["rev-parse", "HEAD"]).trim();
    git(["config", "user.name", "github-actions[bot]"]);
    git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    clearExtraHeader();

    for (let attempt = 0; attempt < 5; attempt++) {
        fetchMain(remote);
        const released = releaseFor(source);
        if (released) {
            fs.writeFileSync(versionPath, `${released}\n`);
            console.log(`VERSION ${released} already pushed.`);
            return;
        }
        const originVersion = versionAt("origin/main");
        const base = compareVersions(originVersion, current) > 0 ? originVersion : current;
        const version = applyBump(base, kind);
        if (!version || version === base) {
            fs.writeFileSync(versionPath, `${base}\n`);
            console.log("No VERSION bump.");
            return;
        }
        if (base !== current) console.log(`main is at ${base}; ${base} -> ${version} (${kind})`);
        fs.writeFileSync(versionPath, `${version}\n`);
        const tip = git(["rev-parse", "origin/main"]).trim();
        // Stamp publishes this checkout. A later main tip is only the parent of the version commit.
        let commit;
        if (tip === source) {
            git(["add", "--", "VERSION"]);
            git([
                "commit",
                "-m",
                `chore(release): v${version} [skip ci]`,
                "-m",
                `Released-Commit: ${source}`,
            ]);
            commit = git(["rev-parse", "HEAD"]).trim();
        } else {
            commit = commitVersionOn(tip, version, source);
        }
        if (pushCommit(remote, commit)) {
            console.log(`Pushed VERSION ${version}`);
            return;
        }
        if (attempt === 4) break;
        console.log("main moved; retrying VERSION push.");
        if (git(["rev-parse", "HEAD"]).trim() !== source) git(["reset", "--soft", source]);
    }
    throw new Error("VERSION push was rejected because main moved.");
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
        if (process.argv.includes("--push")) keepRemoteVersion(current);
        return;
    }
    console.log(`${current} -> ${next} (${kind})`);
    if (!process.argv.includes("--write")) return;
    fs.writeFileSync(versionPath, `${next}\n`);
    if (process.argv.includes("--push")) pushRelease(current, kind);
}

module.exports = { bumpKind, highestKind, applyBump };

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error(redact(err.message || err));
        process.exit(1);
    }
}
