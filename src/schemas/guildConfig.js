const mongoose = require("mongoose");

const guildSchema = new mongoose.Schema({

  guildId:    { type: String, required: true, unique: true },
  guildName:  { type: String, required: true },
  guildOwner: { type: String, required: true },

  allowedRoles: { type: [String], default: [] },

  // ── Like system ─────────────────────────────────────────────────────────────
  likeChannelId:     { type: String, default: null },
  autoLikeChannelId: { type: String, default: null },
  isAllowed:         { type: Boolean, default: false },

  // ── Main system channels ────────────────────────────────────────────────────
  infoChannelId:    { type: String, default: null },
  bancheckChannelId:{ type: String, default: null },
  visitChannelId:   { type: String, default: null },
  bioChannelId:     { type: String, default: null },
  spamChannelId:    { type: String, default: null },
  emoteChannelId:   { type: String, default: null },

  // ── Extra systems ───────────────────────────────────────────────────────────
  ghostChannelId:        { type: String, default: null },
  outfitChannelId:       { type: String, default: null },
  addItemsChannelId:     { type: String, default: null },
  removeFriendChannelId: { type: String, default: null },

  // ── Search systems ──────────────────────────────────────────────────────────
  searchChannelId: { type: String, default: null },
  clanChannelId:   { type: String, default: null },

  // ── Room Spam system ────────────────────────────────────────────────────────
  roomspamChannelId: { type: String, default: null },

  // ── Role limits ─────────────────────────────────────────────────────────────
  role_limits: {
    type: Map,
    of: Number,
    default: {}
  }

}, { timestamps: true });

module.exports =
  mongoose.models.guilds ||
  mongoose.model("guilds", guildSchema);