const { fetchJson } = require("./http");

// Weapon type codes come from the Nikke Goddess of Victory International Wiki.
// The wiki's text is CC BY-SA. Fandom's Help:Licensing states CC BY-SA 3.0
// unless a page says otherwise. This module reads the weapontype field through
// the MediaWiki API. It does not copy article text.
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

module.exports = {
    ATTRIBUTION,
    LICENSE_URL,
    WIKI_WEAPON_URL,
    TYPE_TO_CODE,
    fetchPlayableWeapons,
    weaponCode,
};
