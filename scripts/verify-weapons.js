#!/usr/bin/env node
/**
 * WEAPON GATE
 *
 * Compares each Nikke weapon in knowledge/nikke-database.js with the
 * Nikke Goddess of Victory International Wiki (CC BY-SA).
 * Does not edit the database. Weapon updates belong to scripts/rebuild-catalog.js.
 *
 * Exit 1 when a wiki weapon disagrees with the database, or when the
 * wiki API cannot return the roster. A name the wiki does not list is skipped.
 *
 * Usage: node scripts/verify-weapons.js
 */

const path = require("path");
const { loadDatabaseSource } = require("./lib/db-file");
const { ATTRIBUTION, fetchPlayableWeapons } = require("./lib/fandom-weapon");

async function verify() {
    const dbPath = path.join(__dirname, "..", "knowledge", "nikke-database.js");
    const { nikkes } = loadDatabaseSource(dbPath);
    console.log(ATTRIBUTION);
    console.log(`Found ${nikkes.length} Nikke entries in database`);
    const rows = await fetchPlayableWeapons();
    const byName = new Map();
    for (const row of rows) {
        if (row.weapon) byName.set(row.name.toLowerCase(), row);
    }
    const mismatches = [];
    const missing = [];
    for (const entry of nikkes) {
        const row = byName.get(entry.name.toLowerCase());
        if (!row) {
            missing.push(entry.name);
            continue;
        }
        if (row.weapon !== entry.weapon) {
            mismatches.push({ name: entry.name, dbWeapon: entry.weapon, wikiWeapon: row.weapon });
        }
    }
    console.log(`Wiki playable characters: ${rows.length}`);
    console.log(`Matches: ${nikkes.length - mismatches.length - missing.length}`);
    console.log(`Mismatches: ${mismatches.length}`);
    console.log(`Not on the wiki: ${missing.length}`);
    mismatches.forEach((m) => console.log(`  ${m.name}: DB="${m.dbWeapon}" Wiki="${m.wikiWeapon}"`));
    if (missing.length) console.log(`  Missing: ${missing.join(", ")}`);
    if (mismatches.length) process.exit(1);
}

verify().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
