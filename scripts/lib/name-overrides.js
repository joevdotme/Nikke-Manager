const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Gear import rewrites short live-game names before they hit the roster.
// That map lives in js/scraper-import.js. A catalog row has to use the same
// spelling, or "Ada" is appended next to "Ada Wong" with an empty build.
function loadNameOverrides() {
    const file = path.join(__dirname, "..", "..", "js", "scraper-import.js");
    const src = fs.readFileSync(file, "utf8");
    const match = src.match(/const NAME_OVERRIDES = (\{[\s\S]*?\n\});/);
    if (!match) throw new Error("NAME_OVERRIDES missing from js/scraper-import.js");
    const overrides = vm.runInNewContext("(" + match[1] + ")");
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
        throw new Error("NAME_OVERRIDES is not an object");
    }
    return overrides;
}

let cached = null;

function nameOverrides() {
    if (!cached) cached = loadNameOverrides();
    return cached;
}

function canonicalNikkeName(name) {
    const overrides = nameOverrides();
    if (Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name];
    const lower = String(name == null ? "" : name).toLowerCase();
    for (const key of Object.keys(overrides)) {
        if (key.toLowerCase() === lower) return overrides[key];
    }
    return name;
}

module.exports = { canonicalNikkeName, loadNameOverrides };
