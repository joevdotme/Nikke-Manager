#!/usr/bin/env node
/**
 * WEAPON GATE
 *
 * Compares each Nikke weapon in knowledge/nikke-database.js with Prydwen.
 * Does not edit the database. Weapon updates belong to scripts/rebuild-catalog.js.
 *
 * Exit 1 when a parsed weapon disagrees with the database, or when Prydwen
 * cannot be fetched (network error, 5xx, or a Cloudflare challenge).
 * A missing character page (404) is skipped.
 *
 * Usage: node scripts/verify-weapons.js
 */

const path = require("path");
const { loadDatabaseSource } = require("./lib/db-file");
const { makeSlug, extractWeapon, fetchCharacterPage, isChallenge } = require("./lib/prydwen-weapon");

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verify() {
    const dbPath = path.join(__dirname, "..", "knowledge", "nikke-database.js");
    const { nikkes } = loadDatabaseSource(dbPath);
    const mismatches = [];
    let fetchErrors = 0;

    console.log(`Found ${nikkes.length} Nikke entries in database`);

    for (let i = 0; i < nikkes.length; i++) {
        const entry = nikkes[i];
        const slug = makeSlug(entry.name, entry);
        process.stdout.write(`[${i + 1}/${nikkes.length}] Checking ${entry.name} (${slug})...`);
        try {
            const page = await fetchCharacterPage(slug);
            if (isChallenge(page)) {
                console.log(` HTTP ${page.status}`);
                console.error("Prydwen fetch failed. Weapon gate cannot pass.");
                process.exit(1);
            }
            if (page.status >= 500) {
                console.log(` HTTP ${page.status}`);
                fetchErrors++;
            } else if (page.status !== 200) {
                console.log(` HTTP ${page.status} - SKIPPED`);
            } else {
                const prydwenWeapon = extractWeapon(page.body);
                if (!prydwenWeapon) {
                    console.log(" Could not parse weapon - SKIPPED");
                } else if (prydwenWeapon !== entry.weapon) {
                    console.log(` MISMATCH! DB=${entry.weapon} Prydwen=${prydwenWeapon}`);
                    mismatches.push({ name: entry.name, dbWeapon: entry.weapon, prydwenWeapon, slug });
                } else {
                    console.log(` OK (${entry.weapon})`);
                }
            }
        } catch (err) {
            console.log(` ERROR: ${err.message}`);
            if (err.code === "PRYDWEN_BLOCKED") {
                console.error("Prydwen fetch failed. Weapon gate cannot pass.");
                process.exit(1);
            }
            fetchErrors++;
        }
        await sleep(400);
    }

    console.log(`\nMismatches: ${mismatches.length}`);
    console.log(`Fetch errors: ${fetchErrors}`);
    mismatches.forEach((m) => console.log(`  ${m.name}: DB="${m.dbWeapon}" Prydwen="${m.prydwenWeapon}"`));
    if (mismatches.length || fetchErrors) process.exit(1);
}

verify().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
