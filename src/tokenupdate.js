const axios = require('axios');
const cron = require('node-cron');

const botConfig = require("src/events/handlers/tokenupdate.js");
const TOKEN_CHANNEL_ID = botConfig?.bot?.tokenChannelId || "";
const TOKEN_URL = "https://jwt-tokens-3-zeta.vercel.app/sg";

let schedulerStarted = false;

async function fetchTokenInfo() {
  try {
    const res = await axios.get(TOKEN_URL, { timeout: 60000 });
    if (res.status === 200 && res.data) return res.data;
    return null;
  } catch (err) {
    console.log("Token fetch failed: " + err.message);
    return null;
  }
}

async function sendTokenUpdate(client) {
  try {
    const channel = await client.channels.fetch(TOKEN_CHANNEL_ID).catch(() => null);
    if (!channel) {
      if (TOKEN_CHANNEL_ID) console.log("[TokenUpdate] Channel not found: " + TOKEN_CHANNEL_ID + " — set bot.tokenChannelId in config.json");
      return;
    }

    console.log("Token Scheduler fired - waiting 2 minutes before fetching...");

    // Wait 2 minutes to allow token to fully update
    await new Promise(res => setTimeout(res, 2 * 60 * 1000));

    const data = await fetchTokenInfo();

    if (!data) {
      await channel.send("Token fetch failed. API did not respond.").catch(() => null);
      return;
    }

    // Build message from API response fields dynamically
    const lines = [];
    lines.push("Token Update - SG");
    lines.push("");

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "object" && value !== null) {
        lines.push(key + ":");
        for (const [k, v] of Object.entries(value)) {
          lines.push("  " + k + ": " + v);
        }
      } else {
        lines.push(key + ": " + value);
      }
    }

    lines.push("");
    lines.push(
      "Updated at: " +
      new Date().toLocaleString("en-GB", { timeZone: "Asia/Kathmandu" }) +
      " (Nepal)"
    );

    await channel.send(lines.join("\n")).catch(() => null);
    console.log("Token update sent successfully.");

  } catch (err) {
    console.error("Token update error:", err);
  }
}

// ---------------- EXPORT AS READY EVENT ----------------
module.exports = {
  name: "ready",
  once: false,
  async execute(client) {
    if (schedulerStarted) return;
    schedulerStarted = true;

    cron.schedule("*/5 * * * *", async () => {
      await sendTokenUpdate(client);
    });

    console.log("Token Scheduler started - runs every 5 minutes with 2 minute fetch delay.");
  }
};