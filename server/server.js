const express = require("express");
const cors = require("cors");

const app = express();


// Allow our React frontend to make requests to this backend.
app.use(cors());


// --------------------------------------------------
// Helper functions
// --------------------------------------------------


// Convert a season slug into Raider.IO's expansion ID.
//
// Examples:
// season-mn-1  -> 11
// season-tww-3 -> 10
function getExpansionIdFromSeason(season) {
    if (season.startsWith("season-mn-")) {
        return 11;
    }

    if (season.startsWith("season-tww-")) {
        return 10;
    }

    return null;
}


// Get the full Raider.IO static-data object for one season.
//
// This lets the rest of our code work with:
//
// season-mn-1
//
// instead of repeatedly fetching static data and searching
// through the returned seasons array.
async function getSeasonData(season) {
    const expansionId = getExpansionIdFromSeason(season);

    if (!expansionId) {
        throw new Error(`Unknown season: ${season}`);
    }

    const url =
        `https://raider.io/api/v1/mythic-plus/static-data` +
        `?expansion_id=${expansionId}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new Error("Unable to retrieve Raider.IO static data");
    }

    const seasonData = data.seasons.find((item) => {
        return item.slug === season;
    });

    if (!seasonData) {
        throw new Error(`Season ${season} was not found`);
    }

    return seasonData;
}


// Get every recorded run for one character
// in one dungeon during one season.
async function getCharacterRunsForDungeon(
    season,
    characterId,
    dungeonId
) {
    const url =
        `https://raider.io/api/characters/mythic-plus-runs` +
        `?season=${season}` +
        `&characterId=${characterId}` +
        `&dungeonId=${dungeonId}` +
        `&role=all` +
        `&specId=0` +
        `&mode=scored` +
        `&affixes=all` +
        `&date=all`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `Unable to retrieve runs for dungeon ${dungeonId}`
        );
    }

    return data.runs ?? [];
}


// Get the full details for one completed Mythic+ run.
//
// This includes the roster of five players.
async function getRunDetails(season, runId) {
    const url =
        `https://raider.io/api/v1/mythic-plus/run-details` +
        `?season=${season}` +
        `&id=${runId}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Unable to retrieve run ${runId}`);
    }

    return data;
}


// Resolve Raider.IO's internal numeric character ID.
//
// Raider.IO's public character profile lookup does not give us
// the numeric characterId directly.
//
// Our workaround:
//
// 1. Look up the character normally.
// 2. Grab one recent run.
// 3. Get that run's full roster.
// 4. Find the matching character by name + realm + region.
// 5. Return that roster member's numeric Raider.IO ID.
async function getCharacterId(region, realm, name, season) {
    const profileUrl =
        `https://raider.io/api/v1/characters/profile` +
        `?region=${region}` +
        `&realm=${realm}` +
        `&name=${name}` +
        `&fields=mythic_plus_recent_runs`;

    const profileResponse = await fetch(profileUrl);
    const profileData = await profileResponse.json();

    if (!profileResponse.ok) {
        throw new Error(`Unable to find character ${name}`);
    }

    const recentRuns = profileData.mythic_plus_recent_runs;

    if (!recentRuns || recentRuns.length === 0) {
        throw new Error(`${name} has no recent Mythic+ runs`);
    }

    // We only need one completed run to find this character
    // inside a Raider.IO roster.
    const runId = recentRuns[0].keystone_run_id;

    const runDetails = await getRunDetails(season, runId);

    const matchingPlayer = runDetails.roster.find((player) => {
        const character = player.character;

        return (
            character.name.toLowerCase() === name.toLowerCase() &&
            character.realm.slug.toLowerCase() === realm.toLowerCase() &&
            character.region.slug.toLowerCase() === region.toLowerCase()
        );
    });

    if (!matchingPlayer) {
        throw new Error(
            `Could not find ${name}-${realm} in run ${runId}`
        );
    }

    return matchingPlayer.character.id;
}


// Get every recorded run for one character
// across every dungeon in a season.
async function getAllCharacterRuns(season, characterId) {
    const seasonData = await getSeasonData(season);

    const allRuns = [];

    for (const dungeon of seasonData.dungeons) {
        try {
            const runs = await getCharacterRunsForDungeon(
                season,
                characterId,
                dungeon.id
            );

            for (const run of runs) {
                allRuns.push({
                    dungeonId: dungeon.id,
                    dungeonName: dungeon.name,
                    ...run
                });
            }

        } catch (error) {
            // If one dungeon fails, don't fail the entire request.
            console.error(error.message);
        }
    }

    return {
        seasonData,
        runs: allRuns
    };
}


// --------------------------------------------------
// Routes
// --------------------------------------------------


// Simple health check.
app.get("/", (req, res) => {
    res.send("WoW API server is running");
});


// Look up Raider.IO character profile information.
//
// Example:
// /api/player/us/illidan/Limitdh
app.get("/api/player/:region/:realm/:name", async (req, res) => {
    const { region, realm, name } = req.params;

    const url =
        `https://raider.io/api/v1/characters/profile` +
        `?region=${region}` +
        `&realm=${realm}` +
        `&name=${name}` +
        `&fields=mythic_plus_recent_runs`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: data.message || "Unable to find player"
            });
        }

        res.json(data);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Server error while contacting Raider.IO"
        });
    }
});


// Resolve Raider.IO's internal numeric character ID.
//
// Example:
// /api/character-id/season-mn-1/us/emerald-dream/Skedragon
app.get(
    "/api/character-id/:season/:region/:realm/:name",
    async (req, res) => {
        const { season, region, realm, name } = req.params;

        try {
            const characterId = await getCharacterId(
                region,
                realm,
                name,
                season
            );

            res.json({
                region,
                realm,
                name,
                characterId
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error: error.message
            });
        }
    }
);


// Get full details for one completed run.
//
// Example:
// /api/run/season-mn-1/41746501
app.get("/api/run/:season/:id", async (req, res) => {
    const { season, id } = req.params;

    try {
        const runDetails = await getRunDetails(season, id);

        res.json(runDetails);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// Get the dungeon pool for one season.
//
// Example:
// /api/season-dungeons/season-mn-1
app.get("/api/season-dungeons/:season", async (req, res) => {
    const { season } = req.params;

    try {
        const seasonData = await getSeasonData(season);

        res.json({
            season: seasonData.slug,
            name: seasonData.name,
            dungeons: seasonData.dungeons
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});


// Get one character's runs for one dungeon.
//
// This is mainly useful as a debugging/testing endpoint.
//
// Example:
// /api/character-runs/season-mn-1/305811659/15829
app.get(
    "/api/character-runs/:season/:characterId/:dungeonId",
    async (req, res) => {
        const { season, characterId, dungeonId } = req.params;

        try {
            const runs = await getCharacterRunsForDungeon(
                season,
                characterId,
                dungeonId
            );

            res.json({
                characterId: Number(characterId),
                dungeonId: Number(dungeonId),
                totalRuns: runs.length,
                runs
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error: error.message
            });
        }
    }
);


// Get every recorded run for one character
// across every dungeon in the season.
//
// Example:
// /api/all-character-runs/season-mn-1/305811659
app.get(
    "/api/all-character-runs/:season/:characterId",
    async (req, res) => {
        const { season, characterId } = req.params;

        try {
            const { seasonData, runs } =
                await getAllCharacterRuns(
                    season,
                    characterId
                );

            res.json({
                characterId: Number(characterId),
                season: seasonData.slug,
                seasonName: seasonData.name,
                totalDungeons: seasonData.dungeons.length,
                totalRuns: runs.length,
                runs
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error: error.message
            });
        }
    }
);


// Find every completed run shared between
// Character A and Character B during one season.
//
// This currently accepts Raider.IO numeric IDs.
//
// Later, we'll make this accept:
// region + realm + character name
// and resolve the IDs automatically.
app.get(
    "/api/shared-runs/:season/:regionA/:realmA/:nameA/:regionB/:realmB/:nameB",
    async (req, res) => {
        const {
            season,
            regionA,
            realmA,
            nameA,
            regionB,
            realmB,
            nameB
        } = req.params;

        try {
            // Resolve Character A's Raider.IO internal ID.
            const characterId = await getCharacterId(
                regionA,
                realmA,
                nameA,
                season
            );

            // Resolve Character B's Raider.IO internal ID.
            const otherCharacterId = await getCharacterId(
                regionB,
                realmB,
                nameB,
                season
            );

            // Get every recorded run Character A completed
            // during this season.
            const { runs } = await getAllCharacterRuns(
                season,
                characterId
            );

            const sharedRuns = [];

            // Check every one of Character A's runs.
            for (const run of runs) {
                const runId = run.summary.keystone_run_id;

                try {
                    // Get the full run details, including roster.
                    const runDetails = await getRunDetails(
                        season,
                        runId
                    );

                    // Check whether Character B was in this roster.
                    const containsOtherCharacter =
                        runDetails.roster.some((player) => {
                            return (
                                player.character.id ===
                                otherCharacterId
                            );
                        });

                    // If Character B was there,
                    // save this as a shared run.
                    if (containsOtherCharacter) {
                        sharedRuns.push({
                            dungeonId: run.dungeonId,
                            dungeonName: run.dungeonName,
                            keystoneRunId: runId,
                            mythicLevel:
                                run.summary.mythic_level,
                            completedAt:
                                run.summary.completed_at,
                            score:
                                run.summary.score,
                            runDetails
                        });
                    }

                } catch (error) {
                    // One broken run should not stop
                    // the entire comparison.
                    console.error(error.message);
                }
            }

            res.json({
                season,

                characterA: {
                    id: characterId,
                    region: regionA,
                    realm: realmA,
                    name: nameA
                },

                characterB: {
                    id: otherCharacterId,
                    region: regionB,
                    realm: realmB,
                    name: nameB
                },

                totalCharacterRuns: runs.length,
                totalSharedRuns: sharedRuns.length,

                sharedRuns
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error: error.message
            });
        }
    }
);


// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(3001, () => {
    console.log(
        "Server running on http://localhost:3001"
    );
});