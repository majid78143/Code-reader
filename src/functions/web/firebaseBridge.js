const { dbGet, dbUpdate, dbListen, dbListenChild, dbSet } = require("../../firebase");
const { sendWebLog, sendRequestLog } = require("./loggers");
const { processProfileRequest } = require("./profileAPI");
const { processLikeRequest } = require("./likeAPI");
const { processJWTRequest } = require("./jwtAPI");
const { publishScheduledAnnouncements } = require("./announcementSystem");
const chalk = require("chalk");

const processing = new Set();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processToolRequest(client, requestId, data) {
  if (processing.has(requestId)) return;
  processing.add(requestId);

  const type = data?.type;
  console.log(chalk.cyan(`[Bridge] Processing tool request: ${requestId} | type: ${type}`));

  try {
    switch (type) {
      case "profile":
        await processProfileRequest(client, requestId, data);
        break;
      case "like":
        await processLikeRequest(client, requestId, data);
        break;
      case "jwt":
        await processJWTRequest(client, requestId, data);
        break;
      case "combined":
        await dbUpdate(`/tool_requests/${requestId}`, { status: "processing" });
        await Promise.all([
          processProfileRequest(client, `${requestId}_profile`, { ...data, type: "profile" }),
          processLikeRequest(client, `${requestId}_like`, { ...data, type: "like" })
        ]);
        await dbUpdate(`/tool_requests/${requestId}`, { status: "done" });
        break;
      default:
        console.warn(`[Bridge] Unknown request type: ${type}`);
        await dbUpdate(`/tool_requests/${requestId}`, { status: "error", error: "Unknown type" });
    }
  } catch (err) {
    console.error(`[Bridge] Error processing ${requestId}:`, err.message);
    await dbUpdate(`/tool_requests/${requestId}`, { status: "error", error: err.message });
    await sendWebLog(`❌ **REQUEST ERROR**\n**ID:** \`${requestId}\`\n**Error:** ${err.message}`);
  } finally {
    processing.delete(requestId);
  }
}

let bridgeStarted = false;

async function startFirebaseBridge(client) {
  if (bridgeStarted) return;
  bridgeStarted = true;

  console.log(chalk.blue.bold("🔥 [Bridge] Starting Firebase Realtime Bridge..."));

  dbListenChild("/tool_requests", async (snap) => {
    const requestId = snap.key;
    const data = snap.val();
    if (!data || data.status !== "pending") return;
    console.log(chalk.yellow(`[Bridge] New tool request detected: ${requestId}`));
    await sendRequestLog(
      `📥 **REQUEST RECEIVED**\n` +
      `**ID:** \`${requestId}\`\n` +
      `**Type:** \`${data.type}\`\n` +
      `**UID:** \`${data.uid || "N/A"}\`\n` +
      `**Discord ID:** \`${data.discordId || "Guest"}\``
    );
    await processToolRequest(client, requestId, data);
  });

  await dbUpdate("/system", {
    botOnline: true,
    bridgeActive: true,
    lastSeen: Date.now()
  });

  setInterval(async () => {
    await dbUpdate("/system", {
      botOnline: true,
      bridgeActive: true,
      lastSeen: Date.now(),
      uptime: process.uptime()
    });
  }, 30000);

  setInterval(async () => {
    try {
      await publishScheduledAnnouncements(client);
    } catch (err) {
      console.error("[Bridge] Scheduled announcements error:", err.message);
    }
  }, 60000);

  await sendWebLog(
    `🟢 **FIREBASE BRIDGE ONLINE**\n` +
    `Listening to: /tool_requests\n` +
    `Features: OAuth2 login, Announcements, Notifications\n` +
    `Started at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
  );

  console.log(chalk.green.bold("✅ [Bridge] Firebase Realtime Bridge is active"));
}

module.exports = { startFirebaseBridge };
