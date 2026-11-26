const http = require("http");
const https = require("https");

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

// Same request the original scripts/verify-weapons.js sent: one User-Agent,
// no Accept header, and a relative redirect resolved on www.prydwen.gg.
function fetchPrydwen(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith("http://") ? http : https;
        lib.get(url, { headers: { "User-Agent": "Mozilla/5.0 NikkeVerifier/1.0" } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = res.headers.location.startsWith("http")
                    ? res.headers.location
                    : `https://www.prydwen.gg${res.headers.location}`;
                res.resume();
                fetchPrydwen(redirectUrl).then(resolve, reject);
                return;
            }
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
            res.on("error", reject);
        }).on("error", reject);
    });
}

async function fetchCharacterPage(slug) {
    const url = `https://www.prydwen.gg/nikke/characters/${slug}`;
    const res = await fetchPrydwen(url);
    return { url, status: res.status, body: res.body, headers: res.headers };
}

module.exports = {
    PRYDWEN_TO_CODE,
    makeSlug,
    extractWeapon,
    fetchCharacterPage,
    fetchPrydwen,
    isChallenge,
};
