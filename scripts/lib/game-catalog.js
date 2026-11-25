const crypto = require("crypto");
const { fetchJson, fetchText, postText } = require("./http");

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

const LAUNCHER_VERSION_URL = "https://www.jupiterlauncher.com/api/v1/fleet.repo.game.RepoSVC/GetVersion";

async function fetchLauncherVersion(url) {
    if (!url) return null;
    const res = url.includes("RepoSVC/GetVersion")
        ? await postText(url, JSON.stringify({ game_id: 16601, branch_id: 1 }), {
              Referer: "https://www.jupiterlauncher.com/",
              Origin: "https://www.jupiterlauncher.com",
          })
        : await fetchText(url);
    if (res.status < 200 || res.status >= 300 || !res.body) {
        throw new Error(`Launcher version URL returned HTTP ${res.status}`);
    }
    const data = JSON.parse(res.body);
    if (data.result && data.result.error_code) {
        throw new Error(`Launcher version error ${data.result.error_code}: ${data.result.error_message || "unknown"}`);
    }
    const info = data.version_info || {};
    const launcher = data.launcher_version_info || {};
    let cdnRoot = null;
    if (info.cos_repo_files) {
        const repos = typeof info.cos_repo_files === "string" ? JSON.parse(info.cos_repo_files) : info.cos_repo_files;
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

// The version document has no separate server version string. build_id is the
// build the service is publishing. launcher_version_info is often empty.
function nikkeVersionStamp(info) {
    if (!info) {
        return { client: "", clientFull: "", server: "", launcher: "", cdn: "" };
    }
    const name = info.versionName || "";
    const match = String(name).match(/(\d+\.\d+\.\d+)\s*$/);
    return {
        client: match ? match[1] : name,
        clientFull: name,
        server: info.buildId || "",
        launcher: info.launcherVersion || "",
        cdn: info.cdnRoot || "",
    };
}

function gameVersionChanged(prev, info) {
    if (!info) return false;
    const previous = prev || {};
    const clientChanged = (info.versionName || "") !== (previous.versionName || "");
    const serverChanged = String(info.buildId || "") !== String(previous.buildId || "");
    return clientChanged || serverChanged;
}

function formatNikkeChangelogEntry(info, date) {
    const stamp = nikkeVersionStamp(info);
    return [
        `## ${date} — client ${stamp.client || "unknown"}, server ${stamp.server || "unknown"}`,
        "",
        `- Client: ${stamp.clientFull || "unknown"}`,
        `- Server build: ${stamp.server || "unknown"}`,
        `- Launcher: ${stamp.launcher || "not published"}`,
        `- Game CDN: ${stamp.cdn || "unknown"}`,
        "",
    ].join("\n");
}

module.exports = {
    fetchGameCatalog,
    fetchLauncherVersion,
    burstFlags,
    LAUNCHER_VERSION_URL,
    nikkeVersionStamp,
    gameVersionChanged,
    formatNikkeChangelogEntry,
};
