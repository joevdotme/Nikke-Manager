const fs = require("fs");
const path = require("path");
const https = require("https");
const { canonicalNikkeName } = require("./name-overrides");

// Same slug knowledge/nikke-database.js builds when an entry has no slug field.
function portraitSlug(name) {
    return String(name)
        .toLowerCase()
        .replace(/:/g, "")
        .replace(/\./g, "")
        .replace(/'/g, "")
        .replace(/\(/g, "")
        .replace(/\)/g, "")
        .replace(/\s+/g, "-");
}

function fetchBinary(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            {
                headers: {
                    "User-Agent": "NikkeManagerCatalog/1.0 (portraits; https://github.com/joevdotme/Nikke-Manager)",
                },
            },
            (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const next = res.headers.location.startsWith("http")
                        ? res.headers.location
                        : new URL(res.headers.location, url).href;
                    res.resume();
                    fetchBinary(next).then(resolve, reject);
                    return;
                }
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
            },
        );
        req.setTimeout(30000, () => req.destroy(new Error(`Timeout for ${url}`)));
        req.on("error", reject);
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Saves images.icon for roster names whose sidebar file is missing.
// Short game names resolve first, so a collab does not get a second file
// beside the portrait already committed for that Nikke. An existing file is
// left alone, including portraits already committed under a custom slug.
async function ensurePortraits(characters, nikkes, dir) {
    const byName = new Map(nikkes.map((n) => [n.name.toLowerCase(), n]));
    const added = [];
    fs.mkdirSync(dir, { recursive: true });
    for (const character of characters) {
        if (!character.icon) continue;
        const name = canonicalNikkeName(character.name);
        const entry = byName.get(String(name).toLowerCase());
        const slug = (entry && entry.slug) || portraitSlug(name);
        const dest = path.join(dir, `${slug}.webp`);
        if (fs.existsSync(dest)) continue;
        try {
            const res = await fetchBinary(character.icon);
            const webp = res.body && res.body.length > 12 && res.body.toString("ascii", 0, 4) === "RIFF" && res.body.toString("ascii", 8, 12) === "WEBP";
            if (res.status !== 200 || !webp) {
                console.error(`Portrait for ${name} was not a webp (HTTP ${res.status}).`);
                continue;
            }
            fs.writeFileSync(dest, res.body);
            added.push(name);
            console.log(`Portrait ${slug}.webp`);
        } catch (err) {
            console.error(`Portrait for ${name} failed: ${err.message}`);
        }
        await sleep(100);
    }
    return added;
}

module.exports = { portraitSlug, ensurePortraits };
