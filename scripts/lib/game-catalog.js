const crypto = require("crypto");
const { fetchJson, fetchText } = require("./http");

// The blablalink character CDN stores JSON under md5 object keys. The public
// nikke-api sync is the readable form of that same table (names, resource ids,
// burst, element, weapon, corporation). A launcher version document, when its
// URL is provided, supplies build_id and the game CDN root. A launcher-only
// bump is ignored by the caller.
const CATALOG_URL = "https://nikke-api.pages.dev/api/nikkes";
const API_ROOT = "https://nikke-api.pages.dev/";

const CORPORATION = {
    ELYSION: "Elysion",
    MISSILIS: "Missilis",
    TETRA: "Tetra",
    PILGRIM: "Pilgrim",
    ABNORMAL: "Abnormal",
};

const ELEMENT = {
    Electronic: "Electric",
    Fire: "Fire",
    Water: "Water",
    Wind: "Wind",
    Iron: "Iron",
    Electric: "Electric",
};

function burstFlags(burst) {
    const value = String(burst || "").toUpperCase();
    if (value === "ALL" || value === "LAMBDA") {
        return { burst1: true, burst2: true, burst3: true };
    }
    return {
        burst1: value === "I" || value === "1",
        burst2: value === "II" || value === "2",
        burst3: value === "III" || value === "3",
    };
}

function normalizeCharacter(raw) {
    const name = raw.name && (raw.name.en || raw.name.EN);
    if (!name) return null;
    const weapon = raw.weapon && raw.weapon.type;
    const manufacturer = CORPORATION[String(raw.corporation || "").toUpperCase()];
    const element = ELEMENT[raw.element] || null;
    if (!weapon || !manufacturer || !element || !Number.isFinite(Number(raw.resourceId))) return null;
    const rarity = String(raw.rarity || "").toUpperCase();
    if (!["R", "SR", "SSR"].includes(rarity)) return null;
    const klass = raw.class ? String(raw.class).charAt(0).toUpperCase() + String(raw.class).slice(1).toLowerCase() : "";
    if (!["Attacker", "Defender", "Supporter"].includes(klass)) return null;
    return {
        resourceId: Number(raw.resourceId),
        name,
        ...burstFlags(raw.burst),
        element,
        weapon,
        rarity,
        manufacturer,
        class: klass,
    };
}

async function fetchGameCatalog() {
    const root = await fetchJson(API_ROOT);
    const characters = [];
    let offset = 0;
    const limit = 100;
    let count = Infinity;
    while (offset < count) {
        const page = await fetchJson(`${CATALOG_URL}?limit=${limit}&offset=${offset}`);
        const batch = page.characters || [];
        count = page.count || 0;
        characters.push(...batch);
        if (!batch.length) break;
        offset += batch.length;
    }
    const normalized = characters.map(normalizeCharacter).filter(Boolean);
    const fingerprint = normalized
        .map((n) => [n.resourceId, n.name, n.element, n.weapon, n.burst1, n.burst2, n.burst3, n.manufacturer].join("|"))
        .sort()
        .join("\n");
    const catalogHash = crypto.createHash("sha256").update(fingerprint).digest("hex");
    return {
        characters: normalized,
        catalogHash,
        syncedAt: root.syncedAt || null,
        source: "game",
    };
}

async function fetchLauncherVersion(url) {
    if (!url) return null;
    const res = await fetchText(url);
    if (res.status < 200 || res.status >= 300 || !res.body) {
        throw new Error(`Launcher version URL returned HTTP ${res.status}`);
    }
    const data = JSON.parse(res.body);
    const info = data.version_info || {};
    const launcher = data.launcher_version_info || {};
    let cdnRoot = null;
    if (info.cos_repo_files) {
        const repos = JSON.parse(info.cos_repo_files);
        const game = (repos || []).find((r) => r.repository_type === "Game" || (r.repository_name && r.repository_name.en_US === "Game"));
        cdnRoot = game ? game.cdn_root : null;
    }
    return {
        buildId: info.build_id ? String(info.build_id) : null,
        versionName: info.version_name || null,
        launcherVersion: launcher.version_name || null,
        cdnRoot,
    };
}

module.exports = { fetchGameCatalog, fetchLauncherVersion, burstFlags };
