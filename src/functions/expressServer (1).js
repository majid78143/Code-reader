const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const { dbGet, dbSet, dbUpdate, dbPush, dbRemove } = require("../../firebase");
const { sendWebLog, sendRequestLog } = require("./loggers");
const { initiateOAuth, handleOAuthCallback } = require("./oauthSystem");
const { createAnnouncement, editAnnouncement, deleteAnnouncement, listAnnouncements, pinAnnouncement, broadcastAnnouncement } = require("./announcementSystem");
const chalk = require("chalk");

const PORT = process.env.EXPRESS_PORT || process.env.PORT || 2048;
let started = false;

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { success: false, error: "Rate limited" } });
const submitLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 5, message: { success: false, error: "Too many submissions" } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, error: "Too many auth attempts" } });

async function verifySession(req, res, next) {
  const token = req.headers["x-session-token"] || req.query.token;
  if (!token) return res.status(401).json({ success: false, error: "No session token" });
  try {
    const sessions = await dbGet("/auth_sessions");
    if (!sessions) return res.status(401).json({ success: false, error: "No sessions" });
    const match = Object.values(sessions).find(s => s.sessionToken === token && s.isActive);
    if (!match) return res.status(401).json({ success: false, error: "Invalid or expired session" });
    if (match.loginAt && (Date.now() - match.loginAt) > 7 * 24 * 60 * 60 * 1000) {
      await dbUpdate(`/auth_sessions/${match.discordId}`, { isActive: false });
      return res.status(401).json({ success: false, error: "Session expired" });
    }
    await dbUpdate(`/auth_sessions/${match.discordId}`, { lastSeen: Date.now() });
    req.user = match;
    next();
  } catch (e) {
    res.status(500).json({ success: false, error: "Auth error" });
  }
}

async function verifyAdmin(req, res, next) {
  await verifySession(req, res, async () => {
    try {
      const config = require("../../../../config.json");
      const allAdmins = [config.bot.ownerId, ...(config.bot.admins || [])];
      let WebConfig;
      try { WebConfig = require("../../schemas/webConfig"); } catch (e) {}
      if (WebConfig) {
        const cfg = await WebConfig.findOne({ key: "global" }).catch(() => null);
        if (cfg?.admins) allAdmins.push(...cfg.admins);
      }
      if (!allAdmins.includes(req.user?.discordId)) {
        return res.status(403).json({ success: false, error: "Admin only" });
      }
      next();
    } catch {
      next();
    }
  });
}

function startExpressServer(client) {
  if (started) return;
  started = true;
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-session-token,x-admin-key");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // ── STATUS ────────────────────────────────────────────────────────────────
  app.get("/health", (req, res) => res.json({ success: true, status: "online", bot: client?.user?.tag || "loading", ts: Date.now() }));
  app.get("/api/status", (req, res) => res.json({
    success: true,
    bot: { online: !!client?.user, tag: client?.user?.tag || null },
    uptime: process.uptime(),
    node: process.version,
    ts: Date.now()
  }));

  app.get("/api/system/status", async (req, res) => {
    try {
      const sys = await dbGet("/system");
      const firebaseOk = sys !== null;
      res.json({
        success: true,
        bot: { online: !!client?.user, tag: client?.user?.tag || null, ping: client?.ws?.ping || 0 },
        backend: { online: true, uptime: process.uptime(), node: process.version, port: PORT },
        firebase: { online: firebaseOk, bridgeActive: sys?.bridgeActive || false, lastSeen: sys?.lastSeen || null },
        database: { connected: firebaseOk },
        ts: Date.now()
      });
    } catch (e) {
      res.status(500).json({ success: false, error: "Status check failed" });
    }
  });

  // ── OAUTH2 AUTH ────────────────────────────────────────────────────────────
  app.get("/api/auth/discord", authLimiter, (req, res) => initiateOAuth(req, res));
  app.get("/api/auth/callback", authLimiter, (req, res) => handleOAuthCallback(client, req, res));

  app.post("/api/auth/logout", verifySession, apiLimiter, async (req, res) => {
    try {
      await dbUpdate(`/auth_sessions/${req.user.discordId}`, { isActive: false, logoutAt: Date.now() });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: "Logout failed" }); }
  });

  app.get("/api/auth/me", verifySession, apiLimiter, async (req, res) => {
    try {
      const sess = await dbGet(`/auth_sessions/${req.user.discordId}`);
      const config = require("../../../../config.json");
      const allAdmins = [config.bot.ownerId, ...(config.bot.admins || [])];
      let WebConfig;
      try { WebConfig = require("../../schemas/webConfig"); } catch (e) {}
      if (WebConfig) {
        const cfg = await WebConfig.findOne({ key: "global" }).catch(() => null);
        if (cfg?.admins) allAdmins.push(...cfg.admins);
      }
      res.json({ success: true, user: sess, isAdmin: allAdmins.includes(req.user.discordId) });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  // ── ANNOUNCEMENTS (PUBLIC) ─────────────────────────────────────────────────
  app.get("/api/announcements", apiLimiter, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const category = req.query.category || null;
      const result = await listAnnouncements({ page, limit, category });
      res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.get("/api/announcements/pinned", apiLimiter, async (req, res) => {
    try {
      const result = await listAnnouncements({ limit: 5, pinned: true });
      res.json({ success: true, items: result.items });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.get("/api/announcements/:id", apiLimiter, async (req, res) => {
    try {
      const ann = await dbGet(`/announcements/${req.params.id}`);
      if (!ann) return res.status(404).json({ success: false, error: "Not found" });
      res.json({ success: true, announcement: ann });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  // ── ANNOUNCEMENTS (ADMIN) ──────────────────────────────────────────────────
  app.post("/api/admin/announcements", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const { title, content, image, category, buttonUrl, pinned, scheduledAt } = req.body;
      if (!title || !content) return res.status(400).json({ success: false, error: "title + content required" });
      const sess = await dbGet(`/auth_sessions/${req.user.discordId}`);
      const ann = await createAnnouncement({
        title, content, image: image || null, category: category || "general",
        buttonUrl: buttonUrl || null, pinned: !!pinned,
        scheduledAt: scheduledAt || null,
        createdBy: req.user.discordId,
        createdByName: sess?.username || req.user.discordId
      });
      if (!ann.scheduledAt) await broadcastAnnouncement(client, ann.id);
      res.json({ success: true, announcement: ann });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.put("/api/admin/announcements/:id", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const updated = await editAnnouncement(req.params.id, req.body);
      res.json({ success: true, announcement: updated });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.delete("/api/admin/announcements/:id", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      await deleteAnnouncement(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post("/api/admin/announcements/:id/pin", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      await pinAnnouncement(req.params.id, true);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post("/api/admin/announcements/:id/unpin", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      await pinAnnouncement(req.params.id, false);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post("/api/admin/announcements/:id/broadcast", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      await broadcastAnnouncement(client, req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
  app.get("/api/notifications/:discordId", verifySession, apiLimiter, async (req, res) => {
    try {
      if (req.params.discordId !== req.user.discordId) return res.status(403).json({ success: false, error: "Forbidden" });
      const all = await dbGet(`/notifications/${req.params.discordId}`);
      const items = all ? Object.entries(all).map(([k, v]) => ({ _key: k, ...v })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) : [];
      const unread = items.filter(n => !n.read).length;
      res.json({ success: true, notifications: items, unread });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.put("/api/notifications/:discordId/:key/read", verifySession, apiLimiter, async (req, res) => {
    try {
      if (req.params.discordId !== req.user.discordId) return res.status(403).json({ success: false, error: "Forbidden" });
      await dbUpdate(`/notifications/${req.params.discordId}/${req.params.key}`, { read: true, readAt: Date.now() });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.put("/api/notifications/:discordId/read-all", verifySession, apiLimiter, async (req, res) => {
    try {
      if (req.params.discordId !== req.user.discordId) return res.status(403).json({ success: false, error: "Forbidden" });
      const all = await dbGet(`/notifications/${req.params.discordId}`);
      if (all) {
        for (const key of Object.keys(all)) {
          await dbUpdate(`/notifications/${req.params.discordId}/${key}`, { read: true, readAt: Date.now() });
        }
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.delete("/api/notifications/:discordId/:key", verifySession, apiLimiter, async (req, res) => {
    try {
      if (req.params.discordId !== req.user.discordId) return res.status(403).json({ success: false, error: "Forbidden" });
      await dbRemove(`/notifications/${req.params.discordId}/${req.params.key}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  // ── REQUESTS ──────────────────────────────────────────────────────────────
  app.post("/api/request/submit", apiLimiter, submitLimiter, async (req, res) => {
    try {
      const { discordId, type, uid, server, details, deviceFingerprint } = req.body;
      if (!type || !uid) return res.status(400).json({ success: false, error: "type + uid required" });
      const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const data = {
        requestId, discordId: discordId || "guest", type, uid, server: server || "sg",
        details: details || "", deviceFingerprint: deviceFingerprint || null,
        status: "pending", submittedAt: Date.now(), updatedAt: Date.now()
      };
      await dbSet(`/web_requests/${requestId}`, data);
      await sendRequestLog(`📥 **WEB REQUEST**\n**ID:** \`${requestId}\`\n**Type:** \`${type}\`\n**UID:** \`${uid}\`\n**Discord:** \`${discordId || "Guest"}\``);

      if (discordId && discordId !== "guest") {
        await dbPush(`/notifications/${discordId}`, {
          type: "system",
          title: "Request Submitted",
          message: `Your ${type} request (${uid}) is now pending review.`,
          relatedId: requestId,
          read: false,
          createdAt: Date.now()
        });
      }

      if (client?.isReady()) {
        let WebConfig; try { WebConfig = require("../../schemas/webConfig"); } catch (e) {}
        if (WebConfig) {
          const cfg = await WebConfig.findOne({ key: "global" }).catch(() => null);
          const ch = cfg?.requestsChannelId ? await client.channels.fetch(cfg.requestsChannelId).catch(() => null) : null;
          if (ch) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`accept_req_${requestId}`).setLabel("✅ Accept").setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`reject_req_${requestId}`).setLabel("❌ Reject").setStyle(ButtonStyle.Danger)
            );
            await ch.send({ content: `📥 **New Request** | \`${requestId}\` | UID: \`${uid}\` | Type: \`${type}\``, components: [row] }).catch(() => {});
          }
        }
      }
      res.json({ success: true, requestId, status: "pending" });
    } catch (e) { res.status(500).json({ success: false, error: "Submit failed" }); }
  });

  app.get("/api/request/status/:id", apiLimiter, async (req, res) => {
    try {
      const data = await dbGet(`/web_requests/${req.params.id}`);
      if (!data) return res.status(404).json({ success: false, error: "Not found" });
      res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.get("/api/request/history/:discordId", verifySession, apiLimiter, async (req, res) => {
    try {
      const all = await dbGet("/web_requests");
      const requests = all ? Object.values(all).filter(r => r.discordId === req.params.discordId).sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 50) : [];
      res.json({ success: true, requests });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.get("/api/request/search", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const { q, status, type, page = 1 } = req.query;
      const all = await dbGet("/web_requests");
      let list = all ? Object.values(all) : [];
      if (q) list = list.filter(r => r.uid?.includes(q) || r.discordId?.includes(q) || r.requestId?.includes(q));
      if (status) list = list.filter(r => r.status === status);
      if (type) list = list.filter(r => r.type === type);
      list.sort((a, b) => b.submittedAt - a.submittedAt);
      const per = 20, start = (parseInt(page) - 1) * per;
      res.json({ success: true, requests: list.slice(start, start + per), total: list.length, page: parseInt(page), pages: Math.ceil(list.length / per) });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  app.get("/api/admin/requests", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const all = await dbGet("/web_requests");
      const list = all ? Object.values(all).sort((a, b) => b.submittedAt - a.submittedAt) : [];
      res.json({ success: true, requests: list, total: list.length });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.post("/api/admin/request/:id/accept", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const { id } = req.params; const { note } = req.body;
      await dbUpdate(`/web_requests/${id}`, { status: "accepted", adminNote: note || "", updatedAt: Date.now(), acceptedBy: req.user.discordId });
      const data = await dbGet(`/web_requests/${id}`);
      if (data?.discordId && data.discordId !== "guest") {
        const user = await client?.users.fetch(data.discordId).catch(() => null);
        if (user) await user.send(`✅ Your request \`${id}\` has been **accepted**!${note ? "\nNote: " + note : ""}`).catch(() => {});
        await dbPush(`/notifications/${data.discordId}`, {
          type: "system", title: "Request Accepted",
          message: `Your ${data.type} request has been accepted!${note ? " Note: " + note : ""}`,
          relatedId: id, read: false, createdAt: Date.now()
        });
      }
      await sendWebLog(`✅ Request \`${id}\` accepted by ${req.user.discordId}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.post("/api/admin/request/:id/reject", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const { id } = req.params; const { reason } = req.body;
      await dbUpdate(`/web_requests/${id}`, { status: "rejected", rejectReason: reason || "No reason", updatedAt: Date.now(), rejectedBy: req.user.discordId });
      const data = await dbGet(`/web_requests/${id}`);
      if (data?.discordId && data.discordId !== "guest") {
        const user = await client?.users.fetch(data.discordId).catch(() => null);
        if (user) await user.send(`❌ Your request \`${id}\` was **rejected**.${reason ? "\nReason: " + reason : ""}`).catch(() => {});
        await dbPush(`/notifications/${data.discordId}`, {
          type: "system", title: "Request Rejected",
          message: `Your ${data.type} request was rejected.${reason ? " Reason: " + reason : ""}`,
          relatedId: id, read: false, createdAt: Date.now()
        });
      }
      await sendWebLog(`❌ Request \`${id}\` rejected by ${req.user.discordId}`);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.post("/api/admin/request/:id/note", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const { note } = req.body;
      await dbUpdate(`/web_requests/${req.params.id}`, { adminNote: note, updatedAt: Date.now() });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.get("/api/admin/stats", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const [allReqs, allUsers, allSessions, allAnns, sysData] = await Promise.all([
        dbGet("/web_requests"),
        dbGet("/users"),
        dbGet("/auth_sessions"),
        dbGet("/announcements"),
        dbGet("/system")
      ]);
      const list = allReqs ? Object.values(allReqs) : [];
      const users = allUsers ? Object.values(allUsers) : [];
      const sessions = allSessions ? Object.values(allSessions) : [];
      const announcements = allAnns ? Object.values(allAnns) : [];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const onlineThreshold = Date.now() - 5 * 60 * 1000;
      res.json({
        success: true,
        stats: {
          total: list.length,
          pending: list.filter(r => r.status === "pending").length,
          accepted: list.filter(r => r.status === "accepted").length,
          rejected: list.filter(r => r.status === "rejected").length,
          today: list.filter(r => r.submittedAt >= today.getTime()).length,
          totalUsers: users.length,
          onlineUsers: sessions.filter(s => s.isActive && s.lastSeen >= onlineThreshold).length,
          activeSessions: sessions.filter(s => s.isActive).length,
          announcements: announcements.filter(a => a.published).length,
          pinnedAnnouncements: announcements.filter(a => a.pinned).length,
          botPing: client?.ws?.ping || 0,
          uptime: process.uptime()
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.get("/api/admin/users", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const all = await dbGet("/users");
      const sessions = await dbGet("/auth_sessions");
      const users = all ? Object.values(all) : [];
      const enriched = users.map(u => {
        const sess = sessions?.[u.discordId];
        return { ...u, isActive: sess?.isActive || false, lastSeen: sess?.lastSeen || null };
      }).sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0));
      res.json({ success: true, users: enriched, total: enriched.length });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  app.get("/api/admin/analytics", verifyAdmin, apiLimiter, async (req, res) => {
    try {
      const [allReqs, allUsers, allAnns, loginHistory] = await Promise.all([
        dbGet("/web_requests"),
        dbGet("/users"),
        dbGet("/announcements"),
        dbGet("/login_history")
      ]);
      const reqs = allReqs ? Object.values(allReqs) : [];
      const anns = allAnns ? Object.values(allAnns) : [];
      const logins = loginHistory ? Object.values(loginHistory).flatMap(u => typeof u === "object" ? Object.values(u) : []) : [];
      const last7 = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const byDay = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        byDay[d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })] = 0;
      }
      reqs.filter(r => r.submittedAt >= last7).forEach(r => {
        const d = new Date(r.submittedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
        if (byDay[d] !== undefined) byDay[d]++;
      });
      const byType = {};
      reqs.forEach(r => { byType[r.type] = (byType[r.type] || 0) + 1; });
      const byStatus = { pending: 0, accepted: 0, rejected: 0 };
      reqs.forEach(r => { if (byStatus[r.status] !== undefined) byStatus[r.status]++; });
      res.json({
        success: true,
        analytics: {
          requests: { byDay, byType, byStatus, total: reqs.length },
          users: { total: allUsers ? Object.keys(allUsers).length : 0, newLast7: logins.filter(l => l.loginAt >= last7).length },
          announcements: { total: anns.length, published: anns.filter(a => a.published).length, pinned: anns.filter(a => a.pinned).length }
        }
      });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  // ── USER PROFILE ───────────────────────────────────────────────────────────
  app.get("/api/profile/:discordId", verifySession, apiLimiter, async (req, res) => {
    try {
      if (req.params.discordId !== req.user.discordId) return res.status(403).json({ success: false, error: "Forbidden" });
      const [sess, loginHist, reqs, notifs] = await Promise.all([
        dbGet(`/auth_sessions/${req.params.discordId}`),
        dbGet(`/login_history/${req.params.discordId}`),
        dbGet("/web_requests"),
        dbGet(`/notifications/${req.params.discordId}`)
      ]);
      const userReqs = reqs ? Object.values(reqs).filter(r => r.discordId === req.params.discordId).sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 20) : [];
      const loginList = loginHist ? Object.values(loginHist).sort((a, b) => (b.loginAt || b.timestamp || 0) - (a.loginAt || a.timestamp || 0)).slice(0, 20) : [];
      const notifList = notifs ? Object.entries(notifs).map(([k, v]) => ({ _key: k, ...v })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 30) : [];
      res.json({ success: true, session: sess, loginHistory: loginList, requests: userReqs, notifications: notifList, unreadNotifs: notifList.filter(n => !n.read).length });
    } catch (e) { res.status(500).json({ success: false, error: "Failed" }); }
  });

  // ── SERVE WEB ──────────────────────────────────────────────────────────────
  const webDir = path.join(__dirname, "../../../../web");
  app.use(express.static(webDir));
  app.get("/", (req, res) => res.sendFile(path.join(webDir, "dcweb.html")));

  app.use((req, res) => res.status(404).json({ success: false, error: "Not found" }));
  app.use((err, req, res, next) => res.status(500).json({ success: false, error: "Server error" }));

  app.listen(PORT, "0.0.0.0", () => console.log(chalk.green(`✅ Express Server on port ${PORT}`)));
}

module.exports = { startExpressServer };
