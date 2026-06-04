const mongoose = require("mongoose");

const usageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  count: { type: Number, default: 0 },
  firstUseTime: { type: Date, default: Date.now },
}, { timestamps: true });

usageSchema.index({ userId: 1, guildId: 1 }, { unique: true });
module.exports = mongoose.models.uses || mongoose.model("uses", usageSchema);