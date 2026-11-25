const fs = require("fs");
const vm = require("vm");

function loadDatabaseSource(filePath) {
    const src = fs.readFileSync(filePath, "utf8");
    const context = {};
    vm.createContext(context);
    const exports = [
        "NIKKE_DATABASE",
        "NIKKE_DB_MAP",
        "SOLO_RAID_BOSSES",
        "NIKKE_ELEMENTS",
        "NIKKE_WEAPONS",
        "NIKKE_MANUFACTURERS",
        "HARMONY_CUBES",
    ]
        .map((name) => `this.${name} = typeof ${name} === "undefined" ? undefined : ${name};`)
        .join("\n");
    vm.runInContext(src + "\n" + exports, context, { filename: filePath });
    return {
        src,
        nikkes: context.NIKKE_DATABASE || [],
        bosses: context.SOLO_RAID_BOSSES || [],
        elements: context.NIKKE_ELEMENTS || [],
        weapons: context.NIKKE_WEAPONS ? Object.keys(context.NIKKE_WEAPONS) : [],
        manufacturers: context.NIKKE_MANUFACTURERS || [],
    };
}

function replaceWeapon(src, name, fromCode, toCode) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(name:\\s*"${escaped}"[^}]*?weapon:\\s*)"${fromCode}"`, "s");
    if (!pattern.test(src)) {
        throw new Error(`Could not rewrite weapon for ${name} (${fromCode} -> ${toCode})`);
    }
    return src.replace(pattern, `$1"${toCode}"`);
}

function replaceBosses(src, bosses) {
    const start = src.indexOf("const SOLO_RAID_BOSSES = [");
    const end = src.indexOf("];", start);
    if (start < 0 || end < 0) throw new Error("SOLO_RAID_BOSSES block not found");
    const lines = bosses.map(
        (b) =>
            `    { season: ${b.season}, name: ${JSON.stringify(b.name)}, element: ${JSON.stringify(b.element)}, weakness: ${JSON.stringify(b.weakness)} },`,
    );
    return src.slice(0, start) + "const SOLO_RAID_BOSSES = [\n" + lines.join("\n") + "\n" + src.slice(end);
}

function appendNikkes(src, entries) {
    if (!entries.length) return src;
    const marker = "const NIKKE_DB_MAP = new Map(NIKKE_DATABASE.map((n) => [n.name, n]));";
    const at = src.indexOf(marker);
    if (at < 0) throw new Error("NIKKE_DB_MAP marker not found");
    const close = src.lastIndexOf("];", at);
    if (close < 0) throw new Error("NIKKE_DATABASE close not found");
    const blocks = entries.map(formatNikke).join("\n");
    return src.slice(0, close) + "\n" + blocks + src.slice(close);
}

function formatNikke(n) {
    return `    {
        id: ${n.id},
        name: ${JSON.stringify(n.name)},
        resourceId: ${n.resourceId},
        burst1: ${n.burst1},
        burst2: ${n.burst2},
        burst3: ${n.burst3},
        element: ${JSON.stringify(n.element)},
        weapon: ${JSON.stringify(n.weapon)},
        rarity: ${JSON.stringify(n.rarity)},
        manufacturer: ${JSON.stringify(n.manufacturer)},
        class: ${JSON.stringify(n.class)},
        build: {
            cube: { pve: [] },
            bossing: null,
            collection: { pvePriority: null },
            skill: { pve: { start: null, min: null, rec: null, max: null }, priority: null },
            overload: { priority: null, ideal: [], passable: [] },
        },
    },`;
}

module.exports = { loadDatabaseSource, replaceWeapon, replaceBosses, appendNikkes };
