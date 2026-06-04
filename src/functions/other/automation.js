const axios = require("axios");
const cron = require("node-cron");

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} = require("discord.js");

const AutoLikeModel = require("../../schemas/autolike");
const GuildModel = require("../../schemas/guildConfig");

const API_KEY_1 = "YouLost";
const API_KEY_2 = "freeXwotax";

const REGION_NAMES = {
  ind: "India",
  sg: "Singapore",
  bd: "Bangladesh"
};

let schedulerStarted = false;

/**
 * Starts the cron scheduler for AutoLikes.
 * Set to 5:00 AM Nepal Time.
 */
function startAutoLikeScheduler(client) {
  if (schedulerStarted) {
    console.log("AutoLike Scheduler already running. Skipping duplicate start.");
    return;
  }

  schedulerStarted = true;

  // Cron format: minute hour day-of-month month day-of-week
  cron.schedule(
    "0 5 * * *", 
    async () => {
      console.log("AutoLike Job Started (5:00 AM Nepal)");
      await sendAutoLikes(client);
    },
    {
      scheduled: true,
      timezone: "Asia/Kathmandu"
    }
  );

  console.log("AutoLike Scheduler started - Daily 5:00 AM Nepal Time");
}

// ---------------- API 1 CALL ----------------
async function callAPI1(uid, regionCode) {
  try {
    const apiRegion = regionCode === "ind" ? "ind" : "sg";
    const url = `https://ff.deaddos.online/api/likes/v2?region=${apiRegion}&uid=${uid}&key=${API_KEY_1}`;
    const res = await axios.get(url, { timeout: 30000 });
    if (res.status === 200 && res.data) return res.data;
    return null;
  } catch (err) {
    console.log(`API 1 failed for UID ${uid}: ${err.message}`);
    return null;
  }
}

// ---------------- API 2 CALL ----------------
async function callAPI2(uid) {
  try {
    const url = `https://wotaxxdev-api.vercel.app/like?uid=${uid}&key=${API_KEY_2}`;
    const res = await axios.get(url, { timeout: 30000 });
    if (res.status === 200 && res.data) return res.data;
    return null;
  } catch (err) {
    console.log(`API 2 failed for UID ${uid}: ${err.message}`);
    return null;
  }
}

// ---------------- MAIN AUTO LIKE SENDER ----------------
async function sendAutoLikes(client) {
  try {
    const autoLikeDocs = await AutoLikeModel.find({});

    if (!autoLikeDocs.length) {
      console.log("No AutoLike documents found.");
      return;
    }

    for (const doc of autoLikeDocs) {
      const guildConfig = await GuildModel.findOne({ guildId: doc.guildId });
      if (!guildConfig) continue;

      const logChannelId = guildConfig.autoLikeChannelId;
      if (!logChannelId) continue;

      const dbChannel = await client.channels.fetch(logChannelId).catch(() => null);
      if (!dbChannel) continue;

      const nowDate = new Date();

      // Clean up expired entries
      doc.entries = doc.entries.filter(e => !e.expireAt || new Date(e.expireAt) > nowDate);
      await doc.save();

      for (const entry of doc.entries) {
        const uid = entry.uid;
        const regionCode = entry.region ? entry.region.toLowerCase() : "sg";
        const regionName = REGION_NAMES[regionCode] || "Unknown";

        // Cooldown check - reset every midnight Nepal time
        if (entry.lastLikedAt) {
          const nepalOffset = 5.75 * 60 * 60 * 1000;
          const nowNepal = new Date(Date.now() + nepalOffset);
          const nowNepalDate = nowNepal.toISOString().slice(0, 10);
          
          const lastNepal = new Date(entry.lastLikedAt.getTime() + nepalOffset);
          const lastNepalDate = lastNepal.toISOString().slice(0, 10);

          if (nowNepalDate === lastNepalDate) {
            console.log(`UID ${uid} already liked today. Skipping.`);
            continue;
          }
        }

        console.log(`Processing UID: ${uid} | Step 1/2: Calling API 1...`);

        // ---------------- STEP 1: API 1 ----------------
        const api1Data = await callAPI1(uid, regionCode);
        let r1 = {};
        let api1DailyLimit = false;
        let api1LikesGiven = 0;
        let api1StatusMsg = "Failed";

        if (api1Data) {
          if (api1Data.status === 1 && api1Data.response) {
            r1 = api1Data.response;
            api1LikesGiven = parseInt(r1.LikesGivenByAPI) || 0;
            api1StatusMsg = `Success (+${api1LikesGiven} likes)`;
          } else if (api1Data.status === 2) {
            api1DailyLimit = true;
            api1StatusMsg = "Max likes reached";
          }
        }

        console.log(`UID ${uid} | API 1 done: ${api1StatusMsg} | Step 2/2: Calling API 2...`);

        // ---------------- STEP 2: API 2 ----------------
        const api2Data = await callAPI2(uid);
        let r2 = {};
        let api2DailyLimit = false;
        let api2LikesGiven = 0;
        let api2StatusMsg = "Failed";

        if (api2Data) {
          if (api2Data.status === 1) {
            r2 = api2Data;
            const after = parseInt(api2Data.LikesafterCommand) || 0;
            const before = parseInt(api2Data.LikesbeforeCommand) || 0;
            api2LikesGiven = Math.max(after - before, 0);
            api2StatusMsg = `Success (+${api2LikesGiven} likes)`;
          } else if (api2Data.status === 2) {
            api2DailyLimit = true;
            r2 = api2Data;
            api2StatusMsg = "Max likes reached";
          }
        }

        console.log(`UID ${uid} | API 2 done: ${api2StatusMsg}`);

        if (!api1Data && !api2Data) {
          console.log(`Both APIs failed for UID ${uid}. Skipping.`);
          continue;
        }

        // Save progress
        entry.lastLikedAt = new Date();
        await doc.save();

        const expireStr = entry.expireAt ? new Date(entry.expireAt).toLocaleString("en-GB") : "N/A";
        const totalLikesGiven = api1LikesGiven + api2LikesGiven;
        const bothDailyLimit = api1DailyLimit && api2DailyLimit;

        const playerNickname = r1.PlayerNickname || r2.PlayerNickname || "Unknown";
        const playerLevel = r1.PlayerLevel || r2.PlayerLevel || "N/A";

        const likesBeforeRaw = r1.LikesbeforeCommand ?? r2.LikesbeforeCommand ?? null;
        const likesBeforeCommand = likesBeforeRaw !== null ? likesBeforeRaw : "N/A";
        const likesAfterCommand = likesBeforeRaw !== null ? parseInt(likesBeforeRaw) + totalLikesGiven : "N/A";

        const loginUsed = r1.MajorLogin || r1.MajorLoginUsed || r1.Login || "Garena Official";

        let messageContent = "";

        if (bothDailyLimit) {
          messageContent = 
            `**Auto Like Logs**\n\n` +
            `⚠️ Both APIs reached daily like limit\n\n` +
            `**UID:** ${uid}\n` +
            `**Region:** ${regionName}\n` +
            `**Expires:** ${expireStr}`;
        } else {
          messageContent = 
            `**Garena Free Fire Auto Likes**\n\n` +
            `**Player:** ${playerNickname}\n` +
            `**Level:** ${playerLevel}\n` +
            `**Major Login:** ${loginUsed}\n\n` +
            `**Likes Before:** ${likesBeforeCommand}\n` +
            `**Total Likes Added:** +${totalLikesGiven}\n` +
            `**Likes After:** ${likesAfterCommand}\n\n` +
            `**UID:** ${uid}\n` +
            `**Expires:** ${expireStr}`;
        }

        const container = new ContainerBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(messageContent))
          .addSeparatorComponents(new SeparatorBuilder());

        await dbChannel.send({
          flags: MessageFlags.IsComponentsV2,
          components: [container]
        }).catch(err => console.error("Error sending log message:", err));

        // Wait 5 seconds to avoid spamming the APIs/Discord
        await new Promise(res => setTimeout(res, 5000));
      }
    }
  } catch (error) {
    console.error("Critical AutoLike error:", error);
  }

  console.log("AutoLike Job Completed Successfully");
}

module.exports = {
  startAutoLikeScheduler,
  sendAutoLikes
};
