const axios = require("axios");
const { dbGet, dbUpdate, dbPush } = require("../../firebase");
const { sendWebLog, sendRequestLog } = require("./loggers");
const WebConfig = require("../../schemas/webConfig");

const REGION_MAP = {
  sg: "sg", bd: "sg", eu: "sg",
  ind: "ind", in: "ind"
};

async function getLikeApiConfig() {
  const cfg = await WebConfig.findOne({ key: "global" });
  return cfg?.apiConfig || {};
}

async function checkDeviceLimit(deviceKey) {
  const limits = await dbGet(`/device_limits/${deviceKey}`);
  if (!limits) return { allowed: true, count: 0 };

  const now = new Date();
  const lastDate = new Date(limits.lastDate || 0);
  const isNewDay =
    now.getFullYear() !== lastDate.getFullYear() ||
    now.getMonth() !== lastDate.getMonth() ||
    now.getDate() !== lastDate.getDate();

  if (isNewDay) return { allowed: true, count: 0 };
  if (limits.count >= 1) return { allowed: false, count: limits.count };
  return { allowed: true, count: limits.count };
}

async function updateDeviceLimit(deviceKey) {
  const now = new Date();
  const limits = await dbGet(`/device_limits/${deviceKey}`);
  const lastDate = new Date(limits?.lastDate || 0);

  const isNewDay =
    now.getFullYear() !== lastDate.getFullYear() ||
    now.getMonth() !== lastDate.getMonth() ||
    now.getDate() !== lastDate.getDate();

  const count = isNewDay ? 1 : (limits?.count || 0) + 1;
  await dbUpdate(`/device_limits/${deviceKey}`, { count, lastDate: now.toISOString() });
}

async function callLikeAPI1(apiServer, uid, apiKey, apiUrl) {
  try {
    if (!apiUrl) return null;
    const res = await axios.get(apiUrl, {
      params: { region: apiServer, uid, key: apiKey },
      timeout: 30000
    });
    return res.status === 200 ? res.data : null;
  } catch (err) {
    console.log(`[LikeAPI] API1 failed: ${err.message}`);
    return null;
  }
}

async function callLikeAPI2(uid) {
  try {
    const url = `https://wotaxxdev-api.vercel.app/like?uid=${uid}&key=freeXwotax`;
    const res = await axios.get(url, { timeout: 30000 });
    return res.status === 200 ? res.data : null;
  } catch (err) {
    console.log(`[LikeAPI] API2 failed: ${err.message}`);
    return null;
  }
}

async function processLikeRequest(client, requestId, data) {
  const { uid, server, discordId, deviceFingerprint, ipHash } = data;

  console.log(`[LikeAPI] Processing like request ${requestId} | UID: ${uid}`);

  await dbUpdate(`/tool_requests/${requestId}`, { status: "processing" });

  await sendRequestLog(
    `❤️ **LIKE REQUEST**\n` +
    `**Request ID:** \`${requestId}\`\n` +
    `**UID:** \`${uid}\`\n` +
    `**Server:** \`${server}\`\n` +
    `**Discord ID:** \`${discordId || "Guest"}\`\n` +
    `**Device Hash:** \`${(deviceFingerprint || "N/A").slice(0, 16)}\`\n` +
    `**Status:** Processing`
  );

  const apiCfg = await getLikeApiConfig();

  if (apiCfg.maintenance) {
    await dbUpdate(`/tool_requests/${requestId}`, { status: "error", error: "API under maintenance" });
    return;
  }

  const deviceKey = `${(ipHash || "").slice(0, 8)}_${(deviceFingerprint || "").slice(0, 16)}`;
  const limitCheck = await checkDeviceLimit(deviceKey);

  if (!limitCheck.allowed) {
    const buyLink = await dbGet("/buy_links/default");
    await dbUpdate(`/tool_results/${requestId}`, {
      status: "limit_reached",
      message: "Daily limit reached. 1 like per device per day.",
      buyLink: buyLink?.link || null
    });
    await dbUpdate(`/tool_requests/${requestId}`, { status: "limit_reached" });
    return;
  }

  const serverInput = (server || "sg").toLowerCase();
  const apiServer = REGION_MAP[serverInput] || "sg";

  let api1Data = null;
  let api2Data = null;

  await dbUpdate(`/tool_requests/${requestId}`, { statusMsg: "Calling Like API 1..." });
  api1Data = await callLikeAPI1(apiServer, uid, apiCfg.likeApiKey || "", apiCfg.likeUrl);

  await dbUpdate(`/tool_requests/${requestId}`, { statusMsg: "Calling Like API 2..." });
  api2Data = await callLikeAPI2(uid);

  let r1 = {}, r2 = {};
  let api1LikesGiven = 0, api2LikesGiven = 0;
  let api1Success = false, api2Success = false;

  if (api1Data?.status === 1 && api1Data?.response) {
    r1 = api1Data.response;
    api1LikesGiven = parseInt(r1.LikesGivenByAPI) || 0;
    api1Success = true;
  }

  if (api2Data?.status === 1) {
    r2 = api2Data;
    const after = parseInt(r2.LikesafterCommand) || 0;
    const before = parseInt(r2.LikesbeforeCommand) || 0;
    api2LikesGiven = Math.max(after - before, 0);
    api2Success = true;
  }

  if (!api1Success && !api2Success) {
    await dbUpdate(`/tool_requests/${requestId}`, { status: "error" });
    await dbUpdate(`/tool_results/${requestId}`, {
      status: "failed",
      message: "Both APIs are on cooldown. Try again later.",
      uid
    });
    return;
  }

  const totalLikesGiven = api1LikesGiven + api2LikesGiven;
  const playerNickname = r1.PlayerNickname || r2.PlayerNickname || "Unknown";
  const playerLevel = r1.PlayerLevel || r2.PlayerLevel || "N/A";
  const likesBeforeRaw = r1.LikesbeforeCommand ?? r2.LikesbeforeCommand ?? null;
  const likesAfter = likesBeforeRaw !== null ? parseInt(likesBeforeRaw) + totalLikesGiven : "N/A";

  await updateDeviceLimit(deviceKey);

  const result = {
    status: "success",
    uid: r1.UID || r2.UID || uid,
    playerName: playerNickname,
    playerLevel,
    server: serverInput,
    likesBefore: likesBeforeRaw ?? "N/A",
    likesAfter,
    totalLikesAdded: totalLikesGiven,
    api1Status: api1Success ? `+${api1LikesGiven}` : "Failed",
    api2Status: api2Success ? `+${api2LikesGiven}` : "Failed",
    processedAt: Date.now(),
    requestId
  };

  await dbUpdate(`/tool_requests/${requestId}`, { status: "done" });
  await dbUpdate(`/tool_results/${requestId}`, result);

  await dbPush(`/likes_history`, {
    ...result,
    deviceKey,
    discordId: discordId || null
  });

  const { dbPush: push } = require("../../firebase");
  await push("/live_activity", {
    type: "likes_sent",
    uid,
    playerName: playerNickname,
    totalLikesAdded: totalLikesGiven,
    timestamp: Date.now()
  });

  await sendRequestLog(
    `✅ **LIKE DONE**\n` +
    `**Request ID:** \`${requestId}\`\n` +
    `**UID:** \`${uid}\`\n` +
    `**Player:** ${playerNickname}\n` +
    `**Total Likes:** +${totalLikesGiven}\n` +
    `**API1:** ${api1Success ? `+${api1LikesGiven}` : "Failed"} | **API2:** ${api2Success ? `+${api2LikesGiven}` : "Failed"}`
  );

  await sendWebLog(
    `❤️ **LIKES PROCESSED**\n` +
    `UID: \`${uid}\` | Player: **${playerNickname}** | +${totalLikesGiven} likes`
  );

  console.log(`[LikeAPI] Like request ${requestId} completed | +${totalLikesGiven} likes to ${playerNickname}`);
}

module.exports = { processLikeRequest, checkDeviceLimit };
