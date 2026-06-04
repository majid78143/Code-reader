const { MongoClient } = require("mongodb");
  const fs = require("fs");
  const path = require("path");
  const axios = require("axios");
  const config = require(path.join(__dirname, "../../../config.json"));
  const pLimit = require("p-limit"); // v4 CommonJS compatible

  const REGIONS = ["IND", "NX", "AG"];
  const BATCH_SIZE = 2000;
  const REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24h
  const JWT_SERVERS = ["http://jwt.thug4ff.xyz/", "http://jwt.thug4ff.xyz/"];

  let mongoClient, db, tokenState = {}, managerStarted = false;

  async function initMongo() {
    if (!config.database.mongodbUrl) { console.log("[TokenManager] No MongoDB URL — skipping"); return false; }
    try {
      mongoClient = new MongoClient(config.database.mongodbUrl, { serverSelectionTimeoutMS: 10000 });
      await mongoClient.connect(); db = mongoClient.db("bot_xpert"); return true;
    } catch(err) { console.error("[TokenManager] MongoDB failed:", err.message); return false; }
  }

  async function loadTokenState() {
    const col = db.collection("token_state");
    for (const region of REGIONS) {
      const doc = await col.findOne({ region });
      if (!doc) { await col.insertOne({ region, success_count:0, last_token_update_time:null, current_index:0, refresh_done:false }); tokenState[region] = { success_count:0, last_token_update_time:null, current_index:0, refresh_done:false }; }
      else tokenState[region] = { success_count: doc.success_count||0, last_token_update_time: doc.last_token_update_time||null, current_index: doc.current_index||0, refresh_done: doc.refresh_done||false };
    }
  }

  async function refreshTokens(region) {
    const filePath = path.join(__dirname, `../data/${region.toLowerCase()}_data.json`);
    let data;
    try { data = JSON.parse(fs.readFileSync(filePath)); } catch(e) { return 0; }
    if (!data.length) return 0;
    const start = tokenState[region]?.current_index || 0;
    const tempCol = db.collection(`${region.toLowerCase()}_temp_tokens`);
    await tempCol.deleteMany({});
    const limit = pLimit(25);
    const tasks = [];
    for (let i = 0; i < Math.min(BATCH_SIZE, data.length); i++) {
      const entry = data[(start + i) % data.length];
      if (!entry?.uid || !entry?.password) continue;
      tasks.push(limit(async () => {
        for (const server of JWT_SERVERS) {
          try {
            const res = await axios.get(`${server}token`, { params:{ uid:entry.uid, password:entry.password }, timeout:15000 });
            if (res.status === 200 && res.data?.token) { await tempCol.insertOne({ uid:entry.uid, token:res.data.token, region, createdAt:new Date() }); return true; }
          } catch(e) {}
        }
        return false;
      }));
    }
    const results = await Promise.allSettled(tasks);
    const successes = results.filter(r => r.value === true).length;
    const newIndex = (start + BATCH_SIZE) % data.length;
    await db.collection("token_state").updateOne({ region }, { $set: { current_index:newIndex, success_count:successes, last_token_update_time:Date.now() } });
    if (tokenState[region]) Object.assign(tokenState[region], { current_index:newIndex, success_count:successes });
    return successes;
  }

  async function startTokenManager() {
    if (managerStarted) return; managerStarted = true;
    const ok = await initMongo(); if (!ok) return;
    await loadTokenState();
    console.log("[TokenManager] Started — regions:", REGIONS.join(", "));
    for (const region of REGIONS) {
      setInterval(async () => { try { await refreshTokens(region); } catch(e) { console.error(`[TokenManager] ${region}:`, e.message); } }, REFRESH_INTERVAL);
    }
  }
  module.exports = { startTokenManager, refreshTokens };
  
