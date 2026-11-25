#!/usr/bin/env node
/**
 * Write js/features.js for a Pages artifact.
 *
 * Enables Sign In only when joevdotme.github.io is in the Firebase project's
 * authorized domains. localhost does not count. Any error, timeout, or
 * missing host leaves the flag false.
 *
 *   node scripts/write-features.js dist/js/features.js
 */
const fs = require("fs");
const https = require("https");
const path = require("path");

const HOST = "joevdotme.github.io";
const root = path.join(__dirname, "..");

function flagForDomains(domains) {
    return Array.isArray(domains) && domains.indexOf(HOST) !== -1;
}

function render(enabled) {
    return `// Sign In and cloud save. The committed default is off.
// The Pages deploy overwrites this file in the artifact only, and only when
// joevdotme.github.io is an authorized Firebase domain. localhost does not count.
window.NIKKE_FEATURES = { firebase: ${enabled ? "true" : "false"} };

(function () {
    function applySignInFlag() {
        var btn = document.getElementById("auth-btn");
        if (!btn) return;
        btn.hidden = !(window.NIKKE_FEATURES && window.NIKKE_FEATURES.firebase === true);
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applySignInFlag);
    } else {
        applySignInFlag();
    }
})();
`;
}

function readApiKey() {
    const src = fs.readFileSync(path.join(root, "js", "firebase.js"), "utf8");
    const match = src.match(/apiKey:\s*"([^"]+)"/);
    if (!match) throw new Error("apiKey not found in js/firebase.js");
    return match[1];
}

function getProjectConfig(apiKey) {
    const url = `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${encodeURIComponent(apiKey)}`;
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { Accept: "application/json" } }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                const body = Buffer.concat(chunks).toString("utf8");
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`Identity Toolkit HTTP ${res.statusCode}`));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(new Error("Identity Toolkit returned invalid JSON"));
                }
            });
        });
        req.setTimeout(10000, () => req.destroy(new Error("Identity Toolkit timeout")));
        req.on("error", reject);
    });
}

async function main() {
    const dest = process.argv[2];
    if (!dest) {
        console.error("Usage: node scripts/write-features.js <output-file>");
        process.exit(1);
    }
    let enabled = false;
    try {
        const config = await getProjectConfig(readApiKey());
        const domains = config.authorizedDomains || [];
        enabled = flagForDomains(domains);
        console.log(`authorizedDomains: ${domains.join(", ") || "(none)"}`);
        console.log(enabled ? `Enabling Sign In for ${HOST}` : `Leaving Sign In off; ${HOST} is not an authorized domain`);
    } catch (err) {
        enabled = false;
        console.log(`Leaving Sign In off (${err.message})`);
    }
    fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });
    fs.writeFileSync(dest, render(enabled));
}

module.exports = { flagForDomains, HOST };

if (require.main === module) {
    main().catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });
}
