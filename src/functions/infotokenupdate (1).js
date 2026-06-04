const fs = require('fs').promises;
const axios = require('axios');
const { MongoClient } = require('mongodb');
const path = require('path');
const config = require('../../../config.json');

const mongoUri = config.database.mongodbUrl;
const jwtUrl = "http://92.118.206.166:30113/token?uid={uid}&password={password}";
const updateThresholdHours = 4;
const checkIntervalMs = 1 * 60 * 1000; // 1 min

// ===== Dynamic import for p-limit (ESM-safe) =====
let _pLimit = null;
async function getPLimit() {
    if (!_pLimit) {
        const mod = await import('p-limit');
        _pLimit = mod.default;
    }
    return _pLimit;
}

class TokenUpdater {
    constructor() {
        this.client = new MongoClient(mongoUri);
        this.db = null;
        this.tokensCollection = null;
        this.init();
    }

    async init() {
        try {
            await this.client.connect();
            this.db = this.client.db("info");
            this.tokensCollection = this.db.collection("tokens");
            console.log("✅ Connected to MongoDB");

            await this.checkTimer(); // first run
            setInterval(() => this.checkTimer(), checkIntervalMs); // repeat safely
        } catch (err) {
            console.error("MongoDB connection failed:", err);
        }
    }

    async loadAccounts(filename = path.join(__dirname, '../data/info_acc.json')) {
        try {
            const data = await fs.readFile(filename, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            console.error("Error reading info_acc.json:", err.message);
            return [];
        }
    }

    async fetchToken(uid, password, retries = 2, delay = 2000) {
        const url = jwtUrl.replace("{uid}", uid).replace("{password}", password);

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const res = await axios.get(url, { timeout: 10000 });
                if (res.status === 200 && res.data.token && res.data.server) {
                    return {
                        region: res.data.server.toLowerCase(),
                        token: res.data.token
                    };
                } else {
                    console.log(`⚠️ Invalid response for UID ${uid}:`, res.data);
                }
            } catch (err) {
                console.log(`⛔ Error fetching token for UID ${uid}:`, err.message);
            }
            if (attempt < retries - 1) {
                console.log(`🔁 Retrying ${uid} in ${delay / 1000}s...`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
        return { region: null, token: null };
    }

    async updateTokenInDb(region, token) {
        await this.tokensCollection.updateOne(
            { region },
            { $set: { token, updatedAt: new Date() } },
            { upsert: true }
        );
    }

    // ===== Updated run() to use concurrency safely =====
    async run() {
        const accounts = await this.loadAccounts();
        if (!accounts.length) return console.log("No accounts to process.");

        const pLimit = await getPLimit();
        const limit = pLimit(5); // max 5 concurrent requests

        const tasks = accounts.map(({ uid, password }) =>
            limit(async () => {
                if (!uid || !password) return;

                const { region, token } = await this.fetchToken(uid, password);
                if (region && token) {
                    console.log(`✅ Updated token for '${region}' (UID ${uid})`);
                    await this.updateTokenInDb(region, token);
                } else {
                    console.log(`⚠️ Failed for UID ${uid}`);
                }

                await new Promise(res => setTimeout(res, 1500)); // small delay
            })
        );

        await Promise.all(tasks);
        console.log("🎉 All tokens updated.");
    }

    async checkTimer() {
        if (!this.tokensCollection) return;

        const latest = await this.tokensCollection.findOne({}, { sort: { updatedAt: -1 } });
        if (!latest?.updatedAt) {
            console.log("⏱ No updatedAt found. Running now...");
            return await this.run();
        }

        const hoursSinceUpdate = (Date.now() - new Date(latest.updatedAt).getTime()) / 1000 / 60 / 60;
        if (hoursSinceUpdate >= updateThresholdHours) {
            console.log(`⏱ ${hoursSinceUpdate.toFixed(2)}h passed. Running update.`);
            await this.run();
        }
    }
}

module.exports = TokenUpdater;
