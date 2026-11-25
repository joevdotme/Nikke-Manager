const { fetchJson } = require("./http");

const QUERY = {
    query: `query soloRaidSummaries {
      soloRaidSummaries {
        wave_name
        raid_number
        weakness
        data
      }
    }`,
};

const WEAKNESS = {
    Electronic: "Electric",
    Electric: "Electric",
    Fire: "Fire",
    Water: "Water",
    Wind: "Wind",
    Iron: "Iron",
};

// Boss element is the one weak to the published weakness.
const ELEMENT_WEAK_TO = {
    Water: "Fire",
    Wind: "Water",
    Fire: "Wind",
    Iron: "Electric",
    Electric: "Iron",
};

const WINDOW_MS = 8 * 24 * 60 * 60 * 1000;

async function fetchSoloRaids() {
    const data = await fetchJson("https://enikk.app/api/graphql", {
        method: "POST",
        body: JSON.stringify(QUERY),
    });
    const rows = (data.data && data.data.soloRaidSummaries) || null;
    if (!rows) throw new Error("enikk response did not include soloRaidSummaries");
    return rows
        .map((row) => {
            const weakness = WEAKNESS[row.weakness] || null;
            const element = weakness ? ELEMENT_WEAK_TO[weakness] : null;
            if (!row.raid_number || !row.wave_name || !weakness || !element) return null;
            return {
                season: row.raid_number,
                name: row.wave_name,
                element,
                weakness,
                lastUpdated: row.data && row.data.lastupdated ? row.data.lastupdated : null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.season - b.season);
}

function seasonWindow(state, latestSeason, now) {
    const enikk = (state && state.enikk) || {};
    const seen = enikk.latestSeason;
    if (seen !== latestSeason) {
        return {
            active: true,
            enikk: {
                latestSeason,
                firstSeenAt: now.toISOString(),
                windowEndsAt: new Date(now.getTime() + WINDOW_MS).toISOString(),
            },
        };
    }
    const ends = enikk.windowEndsAt ? new Date(enikk.windowEndsAt) : null;
    return {
        active: !ends || now.getTime() <= ends.getTime(),
        enikk,
    };
}

module.exports = { fetchSoloRaids, seasonWindow, WINDOW_MS };
