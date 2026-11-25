#!/usr/bin/env node
/**
 * Rebuild knowledge files from public sources.
 *
 *   node scripts/rebuild-catalog.js --write
 *   node scripts/rebuild-catalog.js --source game|prydwen|enikk --write
 *   node scripts/rebuild-catalog.js --write --changelog /tmp/changelog.md
 *
 * Does not commit or open a pull request. Exit 1 when a source that was
 * supposed to run fails. Exit 0 when the run finished, including a no-op.
 *
 * Game identity comes from the public catalog synced off the blablalink CDN.
 * The game job polls the public launcher GetVersion endpoint. Set
 * NIKKE_LAUNCHER_VERSION_URL to override it. A change to launcher_version_info
 * alone does not scrape. build_id or the Game cdn_root does.
 *
 * enikk is solo raid only, and only inside the 8 day window that starts the
 * first time a season id is seen.
 *
 * Prydwen weapon text is written here. scripts/verify-weapons.js only compares.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadDatabaseSource, replaceWeapon, replaceBosses, appendNikkes } = require("./lib/db-file");
const { makeSlug, extractWeapon, fetchCharacterPage } = require("./lib/prydwen-weapon");
const { fetchText } = require("./lib/http");
const {
    fetchGameCatalog,
    fetchLauncherVersion,
    LAUNCHER_VERSION_URL,
    nikkeVersionStamp,
    gameVersionChanged,
    formatNikkeChangelogEntry,
} = require("./lib/game-catalog");
const { fetchSoloRaids, seasonWindow } = require("./lib/enikk");

const root = path.join(__dirname, "..");
const dbPath = path.join(root, "knowledge", "nikke-database.js");
const statePath = path.join(root, "knowledge", "source-versions.json");
const nikkeChangelogPath = path.join(root, "docs", "nikke-changelog.md");
const NIKKE_CHANGELOG_HEADER = `# Nikke version changelog

An entry is added when the published game version or server build changes.
A Pages deploy that does not change those versions is not listed.

`;
let pendingVersionEntry = null;

function argValue(flag) {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : null;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readState() {
    if (!fs.existsSync(statePath)) return {};
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

function changelog(sections) {
    const lines = ["Updated game resources.", ""];
    for (const section of sections) {
        lines.push(`## ${section.source}`);
        if (!section.lines.length) lines.push("- No roster changes.");
        else section.lines.forEach((line) => lines.push(`- ${line}`));
        lines.push("");
    }
    return lines.join("\n");
}

async function updateGame(db, state, sections) {
    const lines = [];
    const catalog = await fetchGameCatalog();
    const launcherUrl = process.env.NIKKE_LAUNCHER_VERSION_URL || LAUNCHER_VERSION_URL;
    const launcher = await fetchLauncherVersion(launcherUrl);
    const prev = state.game || {};
    const hashChanged = catalog.catalogHash !== prev.catalogHash;
    const buildChanged = !!(
        launcher &&
        (String(launcher.buildId || "") !== String(prev.buildId || "") ||
            (launcher.cdnRoot || null) !== (prev.cdnRoot || null))
    );
    const launcherOnly = !!(
        launcher &&
        (launcher.launcherVersion || null) !== (prev.launcherVersion || null) &&
        !buildChanged &&
        !hashChanged
    );
    const scrape = hashChanged || buildChanged;
    if (launcherOnly) lines.push(`Launcher-only bump ${launcher.launcherVersion}; game tables not scraped.`);
    if (gameVersionChanged(prev, launcher)) {
        const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        pendingVersionEntry = formatNikkeChangelogEntry(launcher, date);
        const stamp = nikkeVersionStamp(launcher);
        lines.push(`Game version client ${stamp.client || "unknown"}, server ${stamp.server || "unknown"}.`);
    }
    state.game = {
        catalogHash: catalog.catalogHash,
        syncedAt: catalog.syncedAt,
        buildId: launcher ? launcher.buildId : prev.buildId || null,
        versionName: launcher ? launcher.versionName : prev.versionName || null,
        launcherVersion: launcher ? launcher.launcherVersion : prev.launcherVersion || null,
        cdnRoot: launcher ? launcher.cdnRoot : prev.cdnRoot || null,
    };
    if (!scrape) {
        if (!launcherOnly) lines.push("Game build and catalog fingerprint unchanged.");
        sections.push({ source: "game", lines });
        return db.src;
    }

    const known = new Set(db.nikkes.map((n) => n.name.toLowerCase()));
    const usedIds = new Set(db.nikkes.map((n) => n.id));
    let nextId = db.nikkes.reduce((max, n) => Math.max(max, n.id || 0), 0);
    const additions = [];
    for (const character of catalog.characters) {
        if (known.has(character.name.toLowerCase())) continue;
        let id = character.resourceId;
        if (usedIds.has(id)) {
            nextId += 1;
            id = nextId;
        }
        usedIds.add(id);
        known.add(character.name.toLowerCase());
        additions.push(Object.assign({}, character, { id }));
        lines.push(`Added ${character.name} (resource id ${character.resourceId}).`);
    }
    if (!additions.length) lines.push("Catalog revision changed; no new Nikke names.");
    sections.push({ source: "game", lines });
    return appendNikkes(db.src, additions);
}

async function updatePrydwen(db, state, sections) {
    const lines = [];
    const index = await fetchText("https://www.prydwen.gg/nikke/characters");
    if (index.status !== 200 || !index.body) {
        throw new Error(`Prydwen index returned HTTP ${index.status}`);
    }
    const crypto = require("crypto");
    const indexHash = crypto.createHash("sha256").update(index.body).digest("hex");
    if (state.prydwen && state.prydwen.indexHash === indexHash) {
        lines.push("Character index hash unchanged.");
        sections.push({ source: "prydwen", lines });
        state.prydwen = { indexHash };
        return db.src;
    }
    let src = db.src;
    const nikkes = db.nikkes;
    let failed = false;
    for (let i = 0; i < nikkes.length; i++) {
        const entry = nikkes[i];
        const slug = makeSlug(entry.name, entry);
        process.stdout.write(`[${i + 1}/${nikkes.length}] ${entry.name}... `);
        const page = await fetchCharacterPage(slug);
        if (page.status !== 200) {
            console.log(`HTTP ${page.status}`);
            failed = true;
            await sleep(400);
            continue;
        }
        const weapon = extractWeapon(page.body);
        if (!weapon) {
            console.log("no weapon");
            await sleep(400);
            continue;
        }
        if (weapon !== entry.weapon) {
            src = replaceWeapon(src, entry.name, entry.weapon, weapon);
            entry.weapon = weapon;
            lines.push(`Changed ${entry.name} weapon to ${weapon}.`);
            console.log(`-> ${weapon}`);
        } else {
            console.log(weapon);
        }
        await sleep(400);
    }
    if (failed) {
        lines.push("Some Prydwen pages failed. Index hash was not saved, so the next run retries.");
    } else {
        if (!lines.length) lines.push("No weapon changes.");
        state.prydwen = { indexHash };
    }
    sections.push({ source: "prydwen", lines });
    return src;
}

async function updateEnikk(db, state, sections) {
    const lines = [];
    const raids = await fetchSoloRaids();
    if (!raids.length) {
        throw new Error("enikk returned no solo raid seasons");
    }
    const latest = raids[raids.length - 1];
    const window = seasonWindow(state, latest.season, new Date());
    state.enikk = window.enikk;
    if (!window.active) {
        lines.push(`Season ${latest.season} window has ended. Solo raid not scraped.`);
        sections.push({ source: "enikk", lines });
        return db.src;
    }
    const bySeason = new Map(db.bosses.map((b) => [b.season, b]));
    const merged = db.bosses.map((b) => Object.assign({}, b));
    for (const raid of raids) {
        if (bySeason.has(raid.season)) continue;
        merged.push({ season: raid.season, name: raid.name, element: raid.element, weakness: raid.weakness });
        lines.push(`Added season ${raid.season}: ${raid.name} (${raid.element}, weak to ${raid.weakness}).`);
    }
    merged.sort((a, b) => a.season - b.season);
    if (!lines.length) lines.push("No new solo raid seasons.");
    sections.push({ source: "enikk", lines });
    return replaceBosses(db.src, merged);
}

async function main() {
    const write = process.argv.includes("--write");
    const source = argValue("--source") || "all";
    const changelogPath = argValue("--changelog");
    const selected = source === "all" ? ["game", "prydwen", "enikk"] : [source];
    const state = readState();
    const db = loadDatabaseSource(dbPath);
    const sections = [];
    let src = db.src;
    db.src = src;

    for (const name of selected) {
        if (name === "game") src = await updateGame(db, state, sections);
        else if (name === "prydwen") src = await updatePrydwen(db, state, sections);
        else if (name === "enikk") src = await updateEnikk(db, state, sections);
        else throw new Error(`Unknown source ${name}`);
        db.src = src;
        if (name === "game" || name === "enikk") {
            // Keep the in-memory lists aligned with src for the next source.
            const refreshed = loadRefreshed(src);
            db.nikkes = refreshed.nikkes;
            db.bosses = refreshed.bosses;
        }
    }

    const body = changelog(sections);
    if (changelogPath) fs.writeFileSync(changelogPath, body);
    process.stdout.write(body);
    if (write) {
        fs.writeFileSync(dbPath, src);
        writeState(state);
        if (pendingVersionEntry) {
            const prev = fs.existsSync(nikkeChangelogPath)
                ? fs.readFileSync(nikkeChangelogPath, "utf8")
                : NIKKE_CHANGELOG_HEADER;
            const bodyText = prev.endsWith("\n") ? prev : prev + "\n";
            fs.writeFileSync(nikkeChangelogPath, bodyText + pendingVersionEntry);
        }
    }
}

function loadRefreshed(src) {
    const tmp = path.join(os.tmpdir(), `nikke-database-${process.pid}.js`);
    fs.writeFileSync(tmp, src);
    try {
        return loadDatabaseSource(tmp);
    } finally {
        fs.unlinkSync(tmp);
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
