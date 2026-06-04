const mongoose = require("mongoose");

const webConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "global" },

  weblogsChannelId:      { type: String, default: null },
  userlogsChannelId:     { type: String, default: null },
  requestsChannelId:     { type: String, default: null },
  announceChannelId:     { type: String, default: null },

  serverInvite:          { type: String, default: null },
  buyCreditLink:         { type: String, default: null },

  apiConfig: {
    profileUrl:          { type: String, default: null },
    likeUrl:             { type: String, default: null },
    jwtUrl:              { type: String, default: "https://bhuwan-jwt-api.vercel.app/token" },
    backupUrl:           { type: String, default: null },
    likeApiKey:          { type: String, default: "" },
    profileApiKey:       { type: String, default: "" },
    maintenance:         { type: Boolean, default: false },
    cooldownSecs:        { type: Number, default: 10 }
  },

  admins:                { type: [String], default: [] }

}, { timestamps: true });

module.exports =
  mongoose.models.WebConfig ||
  mongoose.model("WebConfig", webConfigSchema);
