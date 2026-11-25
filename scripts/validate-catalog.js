#!/usr/bin/env node
/**
 * Fail when a knowledge diff would break the app.
 *
 *   node scripts/validate-catalog.js --base origin/main
 *
 * Compares knowledge/nikke-database.js in the working tree (or HEAD) to the
 * same file at --base. Exit 1 on a breaking change.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadDatabaseSource } = require("./lib/db-file");

const root = path.join(__dirname, "..");
const rel = "knowledge/nikke-database.js";

function argValue(flag) {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : null;
}

function loadAt(ref) {
    const src = execFileSync("git", ["show", `${ref}:${rel}`], { cwd: root, encoding: "utf8" });
    const file = path.join(os.tmpdir(), `nikke-db-${process.pid}.js`);
    fs.writeFileSync(file, src);
    try {
        return loadDatabaseSource(file);
    } finally {
        fs.unlinkSync(file);
    }
}

function burstCount(n) {
    return (n.burst1 ? 1 : 0) + (n.burst2 ? 1 : 0) + (n.burst3 ? 1 : 0);
}

function main() {
    const baseRef = argValue("--base") || "HEAD";
    const base = loadAt(baseRef);
    const next = loadDatabaseSource(path.join(root, rel));
    const errors = [];
    const nextByName = new Map(next.nikkes.map((n) => [n.name, n]));
    const elementSet = new Set(next.elements);
    const weaponSet = new Set(next.weapons);
    const manufacturerSet = new Set(next.manufacturers);

    for (const prev of base.nikkes) {
        const cur = nextByName.get(prev.name);
        if (!cur) {
            errors.push(`Removed Nikke ${prev.name}`);
            continue;
        }
        if (cur.id !== prev.id) errors.push(`${prev.name} id changed from ${prev.id} to ${cur.id}`);
        if (burstCount(prev) >= 2) {
            for (const flag of ["burst1", "burst2", "burst3"]) {
                if (prev[flag] && !cur[flag]) {
                    errors.push(`${prev.name} lost ${flag}. Multi-burst records cannot collapse (Red Hood is burst1+burst2+burst3).`);
                }
            }
        }
    }

    for (const n of next.nikkes) {
        for (const field of ["id", "name", "element", "weapon", "rarity", "manufacturer", "class"]) {
            if (n[field] === undefined || n[field] === null || n[field] === "") {
                errors.push(`${n.name || n.id} missing ${field}`);
            }
        }
        if (n.element && !elementSet.has(n.element)) errors.push(`${n.name} element ${n.element} is not in NIKKE_ELEMENTS`);
        if (n.weapon && !weaponSet.has(n.weapon)) errors.push(`${n.name} weapon ${n.weapon} is not in NIKKE_WEAPONS`);
        if (n.manufacturer && !manufacturerSet.has(n.manufacturer)) {
            errors.push(`${n.name} manufacturer ${n.manufacturer} is not in NIKKE_MANUFACTURERS`);
        }
    }

    const nextBosses = new Map(next.bosses.map((b) => [b.season, b]));
    for (const boss of base.bosses) {
        const cur = nextBosses.get(boss.season);
        if (!cur) errors.push(`Removed solo raid season ${boss.season} (${boss.name})`);
        else if (cur.name !== boss.name) errors.push(`Season ${boss.season} renamed from ${boss.name} to ${cur.name}`);
    }

    if (errors.length) {
        console.error(errors.join("\n"));
        process.exit(1);
    }
    console.log(`Catalog diff against ${baseRef} has no breaking changes.`);
}

main();
