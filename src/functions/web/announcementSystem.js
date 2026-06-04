const crypto = require("crypto");
const { dbGet, dbSet, dbUpdate, dbPush, dbRemove } = require("../../firebase");
const { sendWebLog } = require("./loggers");

function genId() {
  return `ann_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
}

async function createAnnouncement(data) {
  const {
    title, content, image = null, category = "general",
    buttonUrl = null, pinned = false, scheduledAt = null,
    createdBy, createdByName
  } = data;

  const id = genId();
  const now = Date.now();
  const published = !scheduledAt || scheduledAt <= now;

  const ann = {
    id,
    title,
    content,
    image,
    category,
    buttonUrl,
    pinned,
    scheduledAt: scheduledAt || null,
    published,
    createdBy,
    createdByName,
    createdAt: now,
    updatedAt: now,
    discordChannelPosted: false,
    dmStats: { total: 0, delivered: 0, failed: 0, pending: 0 }
  };

  await dbSet(`/announcements/${id}`, ann);
  return ann;
}

async function editAnnouncement(id, updates) {
  const ann = await dbGet(`/announcements/${id}`);
  if (!ann) throw new Error("Announcement not found");
  const allowed = ["title", "content", "image", "category", "buttonUrl", "pinned", "scheduledAt"];
  const patch = { updatedAt: Date.now() };
  for (const k of allowed) {
    if (updates[k] !== undefined) patch[k] = updates[k];
  }
  await dbUpdate(`/announcements/${id}`, patch);
  return { ...ann, ...patch };
}

async function deleteAnnouncement(id) {
  const ann = await dbGet(`/announcements/${id}`);
  if (!ann) throw new Error("Announcement not found");
  await dbRemove(`/announcements/${id}`);
  return ann;
}

async function listAnnouncements({ page = 1, limit = 10, category = null, pinned = null } = {}) {
  const all = await dbGet("/announcements");
  if (!all) return { items: [], total: 0 };

  let items = Object.values(all).filter(a => a.published);
  if (category) items = items.filter(a => a.category === category);
  if (pinned !== null) items = items.filter(a => !!a.pinned === pinned);

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const total = items.length;
  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), total, page, pages: Math.ceil(total / limit) };
}

async function pinAnnouncement(id, pinned = true) {
  await dbUpdate(`/announcements/${id}`, { pinned, updatedAt: Date.now() });
}

async function broadcastAnnouncement(client, id) {
  const ann = await dbGet(`/announcements/${id}`);
  if (!ann) throw new Error("Announcement not found");

  const config = require("../../../../config.json");
  const webConfig = await dbGet("/web_config");
  const announceChannelId = webConfig?.announceChannelId || null;

  if (announceChannelId && client?.isReady()) {
    try {
      const ch = await client.channels.fetch(announceChannelId).catch(() => null);
      if (ch) {
        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder()
          .setTitle(ann.title)
          .setDescription(ann.content)
          .setColor(0x00e5ff)
          .setFooter({ text: `Category: ${ann.category} | By: ${ann.createdByName}` })
          .setTimestamp(ann.createdAt);
        if (ann.image) embed.setImage(ann.image);
        await ch.send({ embeds: [embed] }).catch(() => null);
        await dbUpdate(`/announcements/${id}`, { discordChannelPosted: true });
      }
    } catch (err) {
      console.error("[Announce] Channel post error:", err.message);
    }
  }

  await dmBroadcastAnnouncement(client, ann);
}

async function dmBroadcastAnnouncement(client, ann) {
  const allUsers = await dbGet("/users");
  if (!allUsers || !client?.isReady()) return;

  const userIds = Object.keys(allUsers);
  const stats = { total: userIds.length, delivered: 0, failed: 0, pending: userIds.length };

  await dbUpdate(`/announcements/${ann.id}`, {
    dmStats: { ...stats }
  });

  for (const userId of userIds) {
    try {
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) { stats.failed++; stats.pending--; continue; }

      const msg = `📢 **${ann.title}**\n\n${ann.content}` +
        (ann.buttonUrl ? `\n\n🔗 ${ann.buttonUrl}` : "");
      await user.send(msg).catch(() => null);

      stats.delivered++;
      stats.pending--;

      await dbPush(`/notifications/${userId}`, {
        type: "announcement",
        title: ann.title,
        message: ann.content.slice(0, 100) + (ann.content.length > 100 ? "..." : ""),
        relatedId: ann.id,
        category: ann.category,
        buttonUrl: ann.buttonUrl || null,
        read: false,
        createdAt: Date.now()
      });
    } catch {
      stats.failed++;
      stats.pending--;
    }
  }

  await dbUpdate(`/announcements/${ann.id}`, { dmStats: stats });

  await sendWebLog(
    `📢 **ANNOUNCEMENT BROADCAST**\n` +
    `**Title:** ${ann.title}\n` +
    `**Total:** ${stats.total} | **Delivered:** ${stats.delivered} | **Failed:** ${stats.failed}`
  );
}

async function publishScheduledAnnouncements(client) {
  const all = await dbGet("/announcements");
  if (!all) return;
  const now = Date.now();
  for (const ann of Object.values(all)) {
    if (!ann.published && ann.scheduledAt && ann.scheduledAt <= now) {
      await dbUpdate(`/announcements/${ann.id}`, { published: true });
      await broadcastAnnouncement(client, ann.id);
    }
  }
}

module.exports = {
  createAnnouncement,
  editAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  pinAnnouncement,
  broadcastAnnouncement,
  publishScheduledAnnouncements
};
