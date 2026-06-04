const mongoose = require("mongoose");
  const schema = new mongoose.Schema({
    requestId:         { type:String, required:true, unique:true },
    discordId:         { type:String, default:"guest" },
    type:              { type:String, required:true },
    uid:               { type:String, required:true },
    server:            { type:String, default:"sg" },
    details:           { type:String, default:"" },
    status:            { type:String, default:"pending" },
    adminNote:         { type:String, default:null },
    rejectReason:      { type:String, default:null },
    acceptedBy:        { type:String, default:null },
    rejectedBy:        { type:String, default:null },
    deviceFingerprint: { type:String, default:null },
    ipHash:            { type:String, default:null },
    submittedAt:       { type:Number, default:Date.now },
    updatedAt:         { type:Number, default:Date.now },
  }, { timestamps: true });
  schema.index({ discordId:1 }); schema.index({ status:1 }); schema.index({ submittedAt:-1 });
  module.exports = mongoose.model("WebRequest", schema, "web_requests");
  