const { fetchJson } = require("./http");

// Weapon type codes come from the Nikke Goddess of Victory International Wiki.
// The wiki's text is CC BY-SA. Fandom's Help:Licensing states CC BY-SA 3.0
// unless a page says otherwise. This module reads the weapontype field through
// the MediaWiki API. The infobox weapon icon is rendered from that field
// ({{weapon type icon|{{{weapontype}}}}}). Character pages also show other
// Nikkes' icons, so the icon image is not read off the HTML.
// It does not copy article text.
// Attribution: a link to the article satisfies the license.
// https://nikke-goddess-of-victory-international.fandom.com/wiki/Weapon
// https://creativecommons.org/licenses/by-sa/3.0/
const API = "https://nikke-goddess-of-victory-international.fandom.com/api.php";
const WIKI_WEAPON_URL = "https://nikke-goddess-of-victory-international.fandom.com/wiki/Weapon";
const LICENSE_URL = "https://creativecommons.org/licenses/by-sa/3.0/";
const ATTRIBUTION =
    "Weapon types from the Nikke Goddess of Victory International Wiki (CC BY-SA). " + WIKI_WEAPON_URL;

const USER_AGENT = "NikkeManagerCatalog/1.0 (weapon types; https://github.com/joevdotme/Nikke-Manager)";

const TYPE_TO_CODE = {
    ar: "AR",
    mg: "MG",
    sg: "SG",
    smg: "SMG",
    sr: "SR",
    rl: "RL",
};

function field(text, name) {
    const match = String(text || "").match(new RegExp("^\\|" + name + "\\s*=\\s*(.*)$", "m"));
    return match ? match[1].trim() : "";
}

function weaponCode(text) {
    const raw = field(text, "weapontype").toLowerCase();
    return TYPE_TO_CODE[raw] || null;
}

async function api(params) {
    const query = new URLSearchParams(Object.assign({ format: "json" }, params));
    const data = await fetchJson(`${API}?${query}`, {
        headers: { "User-Agent": USER_AGENT },
    });
    if (data.error) {
        throw new Error(`Fandom API ${data.error.code}: ${data.error.info}`);
    }
    return data;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// One row per playable character: English name plus weapon code.
async function fetchPlayableWeapons() {
    const rows = [];
    let cont = "";
    do {
        const params = {
            action: "query",
            generator: "categorymembers",
            gcmtitle: "Category:Playable characters",
            gcmnamespace: "0",
            gcmlimit: "50",
            prop: "revisions",
            rvslots: "main",
            rvprop: "content",
        };
        if (cont) params.gcmcontinue = cont;
        const data = await api(params);
        const pages = (data.query && data.query.pages) || {};
        for (const page of Object.values(pages)) {
            const revision = page.revisions && page.revisions[0];
            const slot = revision && revision.slots && revision.slots.main;
            const text = slot && (slot["*"] || slot.content);
            if (!text) continue;
            const name = field(text, "name_en") || page.title;
            const weapon = weaponCode(text);
            rows.push({
                title: page.title,
                name,
                weapon,
                url: `https://nikke-goddess-of-victory-international.fandom.com/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
            });
        }
        cont = (data.continue && data.continue.gcmcontinue) || "";
        if (cont) await sleep(300);
    } while (cont);
    if (rows.length < 150) {
        throw new Error(`Fandom returned ${rows.length} playable characters. Expected the full roster.`);
    }
    return rows;
}

function norm(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function tokens(value) {
    return norm(value)
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

function buildWeaponIndex(rows) {
    const armed = rows.filter((row) => row.weapon);
    const byExact = new Map();
    for (const row of armed) {
        byExact.set(norm(row.name), row);
        byExact.set(norm(row.title), row);
    }
    return { rows: armed, byExact };
}

async function fetchRedirects(names) {
    const redirects = new Map();
    for (let i = 0; i < names.length; i += 40) {
        const batch = names.slice(i, i + 40).filter((name) => !String(name).includes("|"));
        if (!batch.length) continue;
        const data = await api({
            action: "query",
            titles: batch.join("|"),
            redirects: "1",
        });
        for (const redirect of (data.query && data.query.redirects) || []) {
            redirects.set(norm(redirect.from), redirect.to);
        }
        if (i + 40 < names.length) await sleep(300);
    }
    return redirects;
}

// Game names are often shorter than the wiki's name_en ("Ada" vs "Ada Wong",
// "Asuka: WILLE" vs "Asuka Shikinami Langley: WILLE"). Exact name, page title,
// and redirects win. Otherwise every game token must appear in one wiki name,
// the first token must match, and the wiki name with the fewest extra tokens
// wins. A tie is left unmatched.
function findWeaponRow(name, index, redirects) {
    const key = norm(name);
    if (index.byExact.has(key)) return index.byExact.get(key);
    const target = redirects.get(key);
    if (target && index.byExact.has(norm(target))) return index.byExact.get(norm(target));

    const want = tokens(name);
    if (!want.length) return null;
    const candidates = [];
    for (const row of index.rows) {
        let bestExtra = null;
        for (const form of [row.name, row.title]) {
            const have = tokens(form);
            if (!have.length || have[0] !== want[0]) continue;
            if (!want.every((token) => have.includes(token))) continue;
            const extra = have.length - want.length;
            if (bestExtra === null || extra < bestExtra) bestExtra = extra;
        }
        if (bestExtra !== null) candidates.push({ row, extra: bestExtra });
    }
    candidates.sort((a, b) => a.extra - b.extra || a.row.title.localeCompare(b.row.title));
    if (!candidates.length) return null;
    if (candidates.length > 1 && candidates[1].extra === candidates[0].extra && candidates[1].row !== candidates[0].row) {
        return null;
    }
    return candidates[0].row;
}

async function matchPlayableWeapons(names) {
    const rows = await fetchPlayableWeapons();
    const index = buildWeaponIndex(rows);
    const unmatched = names.filter((name) => !index.byExact.has(norm(name)));
    const redirects = await fetchRedirects(unmatched);
    const matches = new Map();
    for (const name of names) {
        const row = findWeaponRow(name, index, redirects);
        if (row) matches.set(name, row);
    }
    return { rows, matches };
}

module.exports = {
    ATTRIBUTION,
    LICENSE_URL,
    WIKI_WEAPON_URL,
    TYPE_TO_CODE,
    fetchPlayableWeapons,
    matchPlayableWeapons,
    weaponCode,
};
