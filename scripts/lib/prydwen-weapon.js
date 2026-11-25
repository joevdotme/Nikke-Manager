const { fetchText } = require("./http");

const PRYDWEN_TO_CODE = {
    "assault rifle": "AR",
    minigun: "MG",
    lmg: "MG",
    "machine gun": "MG",
    shotgun: "SG",
    smg: "SMG",
    "submachine gun": "SMG",
    "sniper rifle": "SR",
    "rocket launcher": "RL",
};

const ICON_TO_CODE = {
    ar: "AR",
    minigun: "MG",
    shotgun: "SG",
    smg: "SMG",
    sniper: "SR",
    rocket: "RL",
};

function makeSlug(name, entry) {
    if (entry && entry.slug) return entry.slug;
    return String(name)
        .toLowerCase()
        .replace(/:/g, "")
        .replace(/\./g, "")
        .replace(/'/g, "")
        .replace(/\(/g, "")
        .replace(/\)/g, "")
        .replace(/\s+/g, "-");
}

function extractWeapon(html) {
    const text = String(html || "").replace(/<[^>]+>/g, " ");
    const wields =
        /wields\s+a[n]?\s+(Assault Rifle|Minigun|LMG|Machine Gun|Shotgun|SMG|Submachine Gun|Sniper Rifle|Rocket Launcher)/i;
    const wieldMatch = text.match(wields);
    if (wieldMatch) return PRYDWEN_TO_CODE[wieldMatch[1].toLowerCase()] || null;
    const icon = html.match(/weapon_(\w+)\.webp/i);
    if (icon) return ICON_TO_CODE[icon[1].toLowerCase()] || null;
    return null;
}

function isChallenge(res) {
    const mitigated = res.headers && (res.headers["cf-mitigated"] || res.headers["CF-Mitigated"]);
    return res.status === 403 || mitigated === "challenge" || /Just a moment/i.test(res.body || "");
}

async function fetchCharacterPage(slug) {
    const url = `https://www.prydwen.gg/nikke/characters/${slug}`;
    const res = await fetchText(url);
    if (isChallenge(res)) {
        const err = new Error(`Prydwen blocked the request for ${slug} (HTTP ${res.status})`);
        err.code = "PRYDWEN_BLOCKED";
        throw err;
    }
    return { url, status: res.status, body: res.body };
}

module.exports = {
    PRYDWEN_TO_CODE,
    makeSlug,
    extractWeapon,
    fetchCharacterPage,
    isChallenge,
};
