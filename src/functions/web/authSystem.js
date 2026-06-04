const crypto = require("crypto");
const { dbGet, dbSet, dbUpdate, dbRemove } = require("../../firebase");
const { sendUserLog, sendWebLog, sendRequestLog } = require("./loggers");

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashIP(ip) {
  return crypto.createHash("sha256").update(ip || "unknown").digest("hex").slice(0, 16);
}

async function getServerInvite() {
  const inv = await dbGet("/server_invite");
  return inv?.link || null;
}

async function isUserInServer(client, guildId, userId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    return !!member;
  } catch {
    return false;
  }
}

async function processPendingLogin(client, requestId, data) {
  const { discordId, deviceFingerprint, ipHash, timestamp } = data;

  console.log(`[Auth] Processing login request ${requestId} for Discord ID: ${discordId}`);

  await dbUpdate(`/auth_requests/${requestId}`, { status: "processing" });

  await sendRequestLog(
    `🔐 **LOGIN REQUEST**\n` +
    `**Request ID:** \`${requestId}\`\n` +
    `**Discord ID:** \`${discordId}\`\n` +
    `**Device:** \`${deviceFingerprint?.slice(0, 16) || "N/A"}\`\n` +
    `**IP Hash:** \`${ipHash || "N/A"}\`\n` +
    `**Status:** Processing`
  );

  // guildId fallback: Firebase → config.json → first bot guild
  const webConfig = await dbGet("/web_config");
  const botConfig = require("../../../../config.json");

  const guildId =
    webConfig?.guildId ||
    botConfig?.bot?.guildId ||
    botConfig?.bot?.developerCommandsServerIds?.[0] ||
    client.guilds.cache.first()?.id ||
    null;

  if (!guildId) {
    await dbUpdate(`/auth_requests/${requestId}`, {
      status: "error",
      message: "Bot is not in any Discord server yet."
    });
    return;
  }

  const inServer = await isUserInServer(client, guildId, discordId);

  if (!inServer) {
    await dbUpdate(`/auth_requests/${requestId}`, {
      status: "not_in_server",
      message: "User has not joined the Discord server"
    });
    await sendUserLog(
      `🚫 **LOGIN DENIED** — Not in server\n` +
      `**Discord ID:** \`${discordId}\`\n` +
      `**Request:** \`${requestId}\``
    );
    return;
  }

  const otp = generateOTP();
  const otpExpiry = Date.now() + OTP_EXPIRY_MS;

  await dbUpdate(`/auth_requests/${requestId}`, {
    status: "otp_sent",
    otp,
    otpExpiry,
    otpAttempts: 0
  });

  try {
    const user = await client.users.fetch(discordId);
    const dmChannel = await user.createDM();
    await dmChannel.send(
      `🔐 **MJ DEVLOPER Login OTP**\n\n` +
      `Your one-time password is:\n\n` +
      `## \`${otp}\`\n\n` +
      `⏰ Expires in **5 minutes**\n` +
      `🛡️ Never share this OTP with anyone.\n` +
      `📱 Request ID: \`${requestId}\``
    );

    await sendUserLog(
      `✅ **OTP SENT**\n` +
      `**Discord ID:** \`${discordId}\`\n` +
      `**Request:** \`${requestId}\`\n` +
      `**Expires:** ${new Date(otpExpiry).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
    );

    console.log(`[Auth] OTP sent to Discord user ${discordId}`);
  } catch (err) {
    console.error(`[Auth] Failed to DM user ${discordId}:`, err.message);
    await dbUpdate(`/auth_requests/${requestId}`, {
      status: "dm_failed",
      message: "Could not send DM. Enable DMs from server members."
    });
    await sendUserLog(
      `❌ **DM FAILED**\n` +
      `**Discord ID:** \`${discordId}\`\n` +
      `**Request:** \`${requestId}\`\n` +
      `**Error:** ${err.message}`
    );
  }
}

async function processOTPVerification(client, verifyId, data) {
  const { requestId, otpEntered, discordId, deviceFingerprint, browser, country } = data;

  console.log(`[Auth] OTP verification attempt for request ${requestId}`);

  const request = await dbGet(`/auth_requests/${requestId}`);

  if (!request) {
    await dbUpdate(`/auth_requests/${verifyId}`, { status: "invalid_request" });
    return;
  }

  if (request.status === "verified") {
    await dbUpdate(`/auth_requests/${verifyId}`, { status: "already_verified" });
    return;
  }

  if (Date.now() > request.otpExpiry) {
    await dbUpdate(`/auth_requests/${requestId}`, { status: "otp_expired" });
    await dbUpdate(`/auth_requests/${verifyId}`, { status: "otp_expired" });
    await sendUserLog(
      `⏰ **OTP EXPIRED**\n` +
      `**Discord ID:** \`${discordId}\`\n` +
      `**Request:** \`${requestId}\``
    );
    return;
  }

  const attempts = (request.otpAttempts || 0) + 1;

  if (request.otp !== otpEntered) {
    await dbUpdate(`/auth_requests/${requestId}`, { otpAttempts: attempts });

    if (attempts >= MAX_ATTEMPTS) {
      await dbUpdate(`/auth_requests/${requestId}`, { status: "otp_locked" });
      await dbUpdate(`/auth_requests/${verifyId}`, { status: "otp_locked" });
      await sendUserLog(
        `🔒 **OTP LOCKED** — Too many attempts\n` +
        `**Discord ID:** \`${discordId}\`\n` +
        `**Attempts:** ${attempts}/${MAX_ATTEMPTS}`
      );
      return;
    }

    await dbUpdate(`/auth_requests/${verifyId}`, {
      status: "wrong_otp",
      attemptsLeft: MAX_ATTEMPTS - attempts
    });
    return;
  }

  const sessionToken = generateSessionToken();
  const sessionData = {
    discordId,
    sessionToken,
    deviceFingerprint: deviceFingerprint || null,
    browser: browser || null,
    country: country || null,
    loginAt: Date.now(),
    lastSeen: Date.now(),
    isActive: true
  };

  await dbSet(`/auth_sessions/${discordId}`, sessionData);
  await dbUpdate(`/auth_requests/${requestId}`, { status: "verified", sessionToken });
  await dbUpdate(`/auth_requests/${verifyId}`, { status: "verified", sessionToken, discordId });

  const userInfo = await client.users.fetch(discordId).catch(() => null);
  const username = userInfo?.username || "Unknown";
  const avatar = userInfo?.displayAvatarURL({ size: 128 }) || null;

  await dbUpdate(`/auth_sessions/${discordId}`, { username, avatar });

  await dbPushLoginHistory(discordId, {
    loginAt: Date.now(),
    deviceFingerprint,
    browser,
    country,
    requestId
  });

  await sendUserLog(
    `🎉 **LOGIN SUCCESS**\n` +
    `**Discord ID:** \`${discordId}\`\n` +
    `**Username:** ${username}\n` +
    `**Request:** \`${requestId}\`\n` +
    `**Session:** \`${sessionToken.slice(0, 16)}...\``
  );

  console.log(`[Auth] User ${discordId} (${username}) logged in successfully`);
}

async function dbPushLoginHistory(discordId, data) {
  const { dbPush } = require("../../firebase");
  await dbPush(`/login_history/${discordId}`, {
    ...data,
    timestamp: Date.now()
  });
}

module.exports = {
  generateOTP,
  generateSessionToken,
  hashIP,
  getServerInvite,
  isUserInServer,
  processPendingLogin,
  processOTPVerification
};
