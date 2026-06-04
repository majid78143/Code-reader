const crypto = require("crypto");
const fetch = require("node-fetch");
const { dbGet, dbSet, dbUpdate, dbPush } = require("../../firebase");
const { sendUserLog, sendWebLog } = require("./loggers");

const DISCORD_API = "https://discord.com/api/v10";

const pendingStates = new Map();

function getOAuthConfig() {
  const config = require("../../../../config.json");
  return {
    clientId: process.env.DISCORD_CLIENT_ID || config.oauth?.clientId || "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET || config.oauth?.clientSecret || "",
    redirectUri: process.env.DISCORD_REDIRECT_URI || config.oauth?.redirectUri || "",
    guildId: config.bot?.guildId || ""
  };
}

function generateState() {
  return crypto.randomBytes(24).toString("hex");
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function buildOAuthUrl(state) {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json();
}

async function getDiscordUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("Failed to get user info");
  return res.json();
}

async function getUserGuilds(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return [];
  return res.json();
}

async function checkGuildMembership(client, guildId, userId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    return !!member;
  } catch {
    return false;
  }
}

async function initiateOAuth(req, res) {
  const state = generateState();
  const { deviceFingerprint } = req.query;
  pendingStates.set(state, {
    deviceFingerprint: deviceFingerprint || null,
    ip: req.ip,
    createdAt: Date.now()
  });
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);

  const url = buildOAuthUrl(state);
  res.redirect(url);
}

async function handleOAuthCallback(client, req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect("/?auth_error=" + encodeURIComponent(error));
  }

  if (!code || !state) {
    return res.redirect("/?auth_error=missing_params");
  }

  const pending = pendingStates.get(state);
  if (!pending) {
    return res.redirect("/?auth_error=invalid_state");
  }
  pendingStates.delete(state);

  try {
    const tokenData = await exchangeCode(code);
    const discordUser = await getDiscordUser(tokenData.access_token);

    const { guildId } = getOAuthConfig();
    const inGuild = await checkGuildMembership(client, guildId, discordUser.id);

    if (!inGuild) {
      const serverInvite = await dbGet("/server_invite");
      const inviteLink = serverInvite?.link || "https://discord.gg/your-server";
      return res.redirect(`/?auth_error=not_in_server&invite=${encodeURIComponent(inviteLink)}`);
    }

    const sessionToken = generateSessionToken();
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || "0") % 5}.png`;

    const sessionData = {
      discordId: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator || "0",
      globalName: discordUser.global_name || discordUser.username,
      avatar: avatarUrl,
      email: discordUser.email || null,
      sessionToken,
      deviceFingerprint: pending.deviceFingerprint || null,
      ipHash: crypto.createHash("sha256").update(pending.ip || "unknown").digest("hex").slice(0, 16),
      loginAt: Date.now(),
      lastSeen: Date.now(),
      isActive: true,
      loginMethod: "oauth2"
    };

    await dbSet(`/auth_sessions/${discordUser.id}`, sessionData);

    await dbPush(`/login_history/${discordUser.id}`, {
      loginAt: Date.now(),
      method: "oauth2",
      deviceFingerprint: pending.deviceFingerprint || null,
      ipHash: sessionData.ipHash,
      timestamp: Date.now()
    });

    await dbPush(`/notifications/${discordUser.id}`, {
      type: "login",
      title: "New Login",
      message: `You logged in via Discord OAuth2`,
      read: false,
      createdAt: Date.now()
    });

    await dbUpdate(`/users/${discordUser.id}`, {
      discordId: discordUser.id,
      username: discordUser.username,
      globalName: discordUser.global_name || discordUser.username,
      avatar: avatarUrl,
      lastLogin: Date.now(),
      loginCount: null
    });

    await sendUserLog(
      `🎉 **OAUTH LOGIN SUCCESS**\n` +
      `**User:** ${discordUser.username} (\`${discordUser.id}\`)\n` +
      `**Avatar:** ${avatarUrl}\n` +
      `**Method:** Discord OAuth2`
    );

    const params = new URLSearchParams({
      token: sessionToken,
      uid: discordUser.id,
      username: discordUser.global_name || discordUser.username,
      avatar: avatarUrl,
      auth: "success"
    });

    return res.redirect(`/?${params.toString()}`);

  } catch (err) {
    console.error("[OAuth] Callback error:", err.message);
    await sendWebLog(`❌ **OAUTH ERROR**\n${err.message}`);
    return res.redirect("/?auth_error=" + encodeURIComponent("Authentication failed. Try again."));
  }
}

module.exports = {
  initiateOAuth,
  handleOAuthCallback,
  getOAuthConfig
};
