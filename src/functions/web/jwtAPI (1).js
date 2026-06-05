const axios = require("axios");
const { dbUpdate, dbPush } = require("../../firebase");
const { sendWebLog, sendRequestLog } = require("./loggers");
const WebConfig = require("../../schemas/webConfig");

const JWT_BASE_URL = "https://bhuwan-jwt-api.vercel.app/token";

async function processJWTRequest(client, requestId, data) {
  const { uid, password, discordId } = data;

  console.log(`[JWTAPI] Processing JWT request ${requestId} | UID: ${uid}`);

  await dbUpdate(`/tool_requests/${requestId}`, { status: "processing" });

  await sendRequestLog(
    `🔑 **JWT REQUEST**\n` +
    `**Request ID:** \`${requestId}\`\n` +
    `**UID:** \`${uid}\`\n` +
    `**Discord ID:** \`${discordId || "Guest"}\`\n` +
    `**Status:** Processing`
  );

  const cfg = await WebConfig.findOne({ key: "global" });
  const jwtUrl = cfg?.apiConfig?.jwtUrl || JWT_BASE_URL;

  try {
    const res = await axios.get(jwtUrl, {
      params: { uid, password },
      timeout: 20000
    });

    if (!res.data || res.status !== 200) {
      await dbUpdate(`/tool_requests/${requestId}`, { status: "error" });
      await dbUpdate(`/tool_results/${requestId}`, {
        status: "failed",
        message: "JWT API returned empty response",
        uid
      });
      return;
    }

    const d = res.data;

    const result = {
      status: "success",
      uid,
      accountId: d.account_id || d.accountId || uid,
      accountName: d.account_name || d.accountName || "Unknown",
      region: d.region || "N/A",
      platform: d.platform || "N/A",
      openId: d.open_id || d.openId || "N/A",
      accessToken: d.access_token || d.accessToken || null,
      token: d.token || d.jwt || d.access_token || null,
      processedAt: Date.now(),
      requestId
    };

    await dbUpdate(`/tool_requests/${requestId}`, { status: "done" });
    await dbUpdate(`/tool_results/${requestId}`, result);

    await dbPush("/jwt_logs", {
      uid,
      discordId: discordId || null,
      region: result.region,
      accountName: result.accountName,
      timestamp: Date.now()
    });

    const { dbPush: push } = require("../../firebase");
    await push("/live_activity", {
      type: "jwt_generated",
      uid,
      accountName: result.accountName,
      region: result.region,
      timestamp: Date.now()
    });

    await sendWebLog(
      `🔑 **JWT GENERATED**\n` +
      `UID: \`${uid}\` | Account: **${result.accountName}** | Region: ${result.region}`
    );

    await sendRequestLog(
      `✅ **JWT DONE**\n` +
      `**Request ID:** \`${requestId}\`\n` +
      `**UID:** \`${uid}\`\n` +
      `**Account:** ${result.accountName}\n` +
      `**Region:** ${result.region}`
    );

    console.log(`[JWTAPI] JWT request ${requestId} completed for ${result.accountName}`);

  } catch (err) {
    console.error(`[JWTAPI] Error:`, err.message);
    await dbUpdate(`/tool_requests/${requestId}`, { status: "error" });
    await dbUpdate(`/tool_results/${requestId}`, {
      status: "error",
      message: err.message,
      uid
    });

    await sendRequestLog(
      `❌ **JWT FAILED**\n` +
      `**Request ID:** \`${requestId}\`\n` +
      `**UID:** \`${uid}\`\n` +
      `**Error:** ${err.message}`
    );
  }
}

module.exports = { processJWTRequest };
