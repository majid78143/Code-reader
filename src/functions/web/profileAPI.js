const axios = require("axios");
const { dbGet, dbUpdate } = require("../../firebase");
const { sendWebLog, sendRequestLog } = require("./loggers");
const WebConfig = require("../../schemas/webConfig");

async function getProfileApiConfig() {
  const cfg = await WebConfig.findOne({ key: "global" });
  return cfg?.apiConfig || {};
}

async function uploadToCDN(client, imageBuffer, filename) {
  const { dbGet } = require("../../firebase");
  const weblogsChannelId = (await WebConfig.findOne({ key: "global" }))?.weblogsChannelId;
  if (!weblogsChannelId) return null;

  try {
    const channel = await client.channels.fetch(weblogsChannelId);
    if (!channel) return null;

    const { AttachmentBuilder } = require("discord.js");
    const attachment = new AttachmentBuilder(imageBuffer, { name: filename });
    const msg = await channel.send({ files: [attachment] });
    const cdnUrl = msg.attachments.first()?.url || null;
    return cdnUrl;
  } catch (err) {
    console.error("[ProfileAPI] CDN upload failed:", err.message);
    return null;
  }
}

async function processProfileRequest(client, requestId, data) {
  const { uid, server, discordId } = data;

  console.log(`[ProfileAPI] Processing profile request ${requestId} | UID: ${uid}`);

  await dbUpdate(`/tool_requests/${requestId}`, { status: "processing" });

  await sendRequestLog(
    `🎮 **PROFILE REQUEST**\n` +
    `**Request ID:** \`${requestId}\`\n` +
    `**UID:** \`${uid}\`\n` +
    `**Server:** \`${server}\`\n` +
    `**Discord ID:** \`${discordId || "Guest"}\`\n` +
    `**Status:** Processing`
  );

  const apiCfg = await getProfileApiConfig();

  if (apiCfg.maintenance) {
    await dbUpdate(`/tool_requests/${requestId}`, {
      status: "error",
      error: "API under maintenance"
    });
    return;
  }

  let profileImageUrl = null;
  let profileData = null;

  if (apiCfg.profileUrl) {
    try {
      const res = await axios.get(apiCfg.profileUrl, {
        params: {
          uid,
          region: server,
          key: apiCfg.profileApiKey || ""
        },
        timeout: 30000,
        responseType: "arraybuffer"
      });

      if (res.status === 200) {
        const imageBuffer = Buffer.from(res.data);
        const cdnUrl = await uploadToCDN(client, imageBuffer, `profile_${uid}_${Date.now()}.png`);
        if (cdnUrl) {
          profileImageUrl = cdnUrl;
          await sendWebLog(
            `📸 **PROFILE CDN UPLOAD**\n` +
            `**UID:** \`${uid}\`\n` +
            `**CDN URL:** ${cdnUrl}`
          );
        }
      }
    } catch (err) {
      console.error(`[ProfileAPI] Profile image fetch failed:`, err.message);
    }
  }

  if (!profileImageUrl) {
    profileImageUrl = `https://wotaxxdev-api.vercel.app/profilecard?uid=${uid}`;
  }

  const result = {
    status: "success",
    uid,
    server,
    profileImageUrl,
    cdnUrl: profileImageUrl,
    processedAt: Date.now(),
    requestId
  };

  await dbUpdate(`/tool_requests/${requestId}`, { status: "done" });
  await dbUpdate(`/tool_results/${requestId}`, result);

  await dbUpdate(`/generated_profiles/${requestId}`, {
    uid,
    server,
    imageUrl: profileImageUrl,
    createdAt: Date.now(),
    discordId: discordId || null
  });

  await addLiveActivity({
    type: "profile_generated",
    uid,
    server,
    imageUrl: profileImageUrl,
    timestamp: Date.now()
  });

  await sendRequestLog(
    `✅ **PROFILE DONE**\n` +
    `**Request ID:** \`${requestId}\`\n` +
    `**UID:** \`${uid}\`\n` +
    `**CDN URL:** ${profileImageUrl}`
  );

  console.log(`[ProfileAPI] Profile request ${requestId} completed`);
}

async function addLiveActivity(data) {
  const { dbPush } = require("../../firebase");
  await dbPush("/live_activity", { ...data, timestamp: Date.now() });
}

module.exports = { processProfileRequest, uploadToCDN };
