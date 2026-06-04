const mongoose = require("mongoose");

const autoLikeSchema = new mongoose.Schema({
  guildId: { type: String, required: true },

  // log channel for autolike
  channelId: { type: String, default: null },

  entries: [
    {
      uid: { type: String, required: true },
      region: { type: String, required: true },
      addedBy: { type: String },

      createdAt: { type: Date, default: Date.now },
      lastLikedAt: { type: Date, default: null },

      // ✅ expiry date
      expireAt: { type: Date, default: null }
    }
  ]
});

// Prevent recompiling model
module.exports =
  mongoose.models.AutoLike ||
  mongoose.model("AutoLike", autoLikeSchema);