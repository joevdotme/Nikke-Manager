#!/usr/bin/env node
/**
 * Rebuild knowledge files from public sources.
 *
 *   node scripts/rebuild-catalog.js --write
 *   node scripts/rebuild-catalog.js --source game|fandom|enikk --write
 *   node scripts/rebuild-catalog.js --write --changelog /tmp/changelog.md
 *
 * Does not commit or open a pull request. Exit 1 when a source that was
 * supposed to run fails. Exit 0 when the run finished, including a no-op.
 *
 * Game identity comes from the public catalog synced off the blablalink CDN.
 * The game job polls the public GetVersion endpoint. Set
 * NIKKE_LAUNCHER_VERSION_URL to override it. build_id or the Game cdn_root
 * scrapes. launcher_version_info is not read.
 *
 * enikk is solo raid only, and only inside the 8 day window that starts the
 * first time a season id is seen.
 *
 * Weapon types come from the Fandom wiki through the MediaWiki API.
 * scripts/verify-weapons.js only compares. The wiki text is CC BY-SA.
 */
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const path = require("path");
const { loadDatabaseSource, replaceWeapon, replaceBosses, appendNikkes } = require("./lib/db-file");
const { ATTRIBUTION, matchPlayableWeapons } = require("./lib/fandom-weapon");
const {
    fetchGameCatalog,
    fetchLauncherVersion,
    LAUNCHER_VERSION_URL,
    nikkeVersionStamp,
    gameVersionChanged,
    formatNikkeChangelogEntry,
} = require("./lib/game-catalog");
const { fetchSoloRaids, seasonWindow } = require("./lib/enikk");
const { ensurePortraits } = require("./lib/portraits");
const { canonicalNikkeName } = require("./lib/name-overrides");

const root = path.join(__dirname, "..");
const dbPath = path.join(root, "knowledge", "nikke-database.js");
const statePath = path.join(root, "knowledge", "source-versions.json");
const nikkeChangelogPath = path.join(root, "docs", "nikke-changelog.md");
const NIKKE_CHANGELOG_HEADER = `# Nikke version changelog

An entry is added when the published client version or server build changes.
A Pages deploy that does not change those versions is not listed.

`;
let pendingVersionEntry = null;

function argValue(flag) {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : null;
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
    const published = await fetchLauncherVersion(launcherUrl);
    const prev = state.game || {};
    const hashChanged = catalog.catalogHash !== prev.catalogHash;
    const buildChanged = !!(
        published &&
        (String(published.buildId || "") !== String(prev.buildId || "") ||
            (published.cdnRoot || null) !== (prev.cdnRoot || null))
    );
    const scrape = hashChanged || buildChanged;
    if (gameVersionChanged(prev, published)) {
        const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        pendingVersionEntry = formatNikkeChangelogEntry(published, date);
        const stamp = nikkeVersionStamp(published);
        lines.push(`Client ${stamp.client || "unknown"}, server ${stamp.server || "unknown"}.`);
    }
    state.game = {
        catalogHash: catalog.catalogHash,
        syncedAt: catalog.syncedAt,
        buildId: published ? published.buildId : prev.buildId || null,
        versionName: published ? published.versionName : prev.versionName || null,
        cdnRoot: published ? published.cdnRoot : prev.cdnRoot || null,
    };
    let src = db.src;
    if (!scrape) {
        lines.push("Client build and catalog fingerprint unchanged.");
    } else {
        const known = new Set(db.nikkes.map((n) => n.name.toLowerCase()));
        const usedIds = new Set(db.nikkes.map((n) => n.id));
        let nextId = db.nikkes.reduce((max, n) => Math.max(max, n.id || 0), 0);
        const additions = [];
        for (const character of catalog.characters) {
            // Collab rows use the short name the game shows ("Ada", "Little Mermaid").
            // The roster already stores the name gear import resolves to.
            const name = canonicalNikkeName(character.name);
            if (known.has(name.toLowerCase())) continue;
            let id = character.resourceId;
            if (usedIds.has(id)) {
                nextId += 1;
                id = nextId;
            }
            usedIds.add(id);
            known.add(name.toLowerCase());
            additions.push(Object.assign({}, character, { id, name }));
            lines.push(`Added ${name} (resource id ${character.resourceId}).`);
        }
        if (!additions.length) lines.push("Catalog revision changed; no new Nikke names.");
        src = appendNikkes(db.src, additions);
    }
    const portraits = await ensurePortraits(catalog.characters, db.nikkes, path.join(root, "assets", "nikkes"));
    if (portraits.length) lines.push(`Added portraits for ${portraits.join(", ")}.`);
    sections.push({ source: "game", lines });
    return src;
}

async function updateFandom(db, state, sections) {
    const lines = [ATTRIBUTION];
    const names = db.nikkes.map((entry) => entry.name);
    const { rows, matches } = await matchPlayableWeapons(names);
    const hash = crypto
        .createHash("sha256")
        .update(
            rows
                .filter((row) => row.weapon)
                .map((row) => `${row.title}\t${row.weapon}`)
                .sort()
                .join("\n"),
        )
        .digest("hex");
    if (state.fandom && state.fandom.hash === hash && state.fandom.matcher === 2) {
        lines.push("Wiki weapon list unchanged.");
        sections.push({ source: "fandom", lines });
        return db.src;
    }
    let src = db.src;
    const missing = [];
    for (const entry of db.nikkes) {
        const row = matches.get(entry.name);
        if (!row) {
            missing.push(entry.name);
            continue;
        }
        if (row.weapon === entry.weapon) continue;
        src = replaceWeapon(src, entry.name, entry.weapon, row.weapon);
        lines.push(`Changed ${entry.name} weapon to ${row.weapon}.`);
    }
    if (!lines.some((line) => line.startsWith("Changed "))) lines.push("No weapon changes.");
    if (missing.length) lines.push(`No wiki match for ${missing.join(", ")}.`);
    state.fandom = { hash, matcher: 2 };
    sections.push({ source: "fandom", lines });
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
    const selected = source === "all" ? ["game", "fandom", "enikk"] : [source === "prydwen" ? "fandom" : source];
    const state = readState();
    const db = loadDatabaseSource(dbPath);
    const sections = [];
    let src = db.src;
    db.src = src;
    let fandomFailed = false;

    for (const name of selected) {
        try {
            if (name === "game") src = await updateGame(db, state, sections);
            else if (name === "fandom") src = await updateFandom(db, state, sections);
            else if (name === "enikk") src = await updateEnikk(db, state, sections);
            else throw new Error(`Unknown source ${name}`);
        } catch (err) {
            if (name !== "fandom") throw err;
            fandomFailed = true;
            if (!sections.some((section) => section.source === "fandom")) {
                sections.push({ source: "fandom", lines: [`${ATTRIBUTION}`, err.message] });
            }
            console.error(err.message);
            if (selected.length > 1) console.error("Game and enikk still run.");
            continue;
        }
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
    if (fandomFailed && selected.length === 1) process.exitCode = 1;
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
