const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require("discord.js");
const { dbGet } = require("../../firebase");
const WebConfig = require("../../schemas/webConfig");

function v2(msg) {
  return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(msg));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Check system and API status"),

  async execute(interaction) {
    await interaction.deferReply();

    const cfg = await WebConfig.findOne({ key: "global" }) || {};
    const apiCfg = cfg.apiConfig || {};
    const system = await dbGet("/system") || {};
    const apiStatus = await dbGet("/api_status") || {};

    const botOnline = system.botOnline ? "🟢 Online" : "🔴 Offline";
    const bridgeActive = system.bridgeActive ? "🟢 Active" : "🔴 Inactive";
    const maintenance = (apiStatus.maintenance || apiCfg.maintenance) ? "🔴 Maintenance" : "🟢 Online";
    const lastSeen = system.lastSeen ? new Date(system.lastSeen).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "N/A";

    const msg =
      `📊 **MJ DEVLOPER System Status**\n\n` +
      `**Bot:** ${botOnline}\n` +
      `**Firebase Bridge:** ${bridgeActive}\n` +
      `**API Status:** ${maintenance}\n` +
      `**Profile API:** ${apiCfg.profileUrl ? "✅ Configured" : "⚠️ Not set"}\n` +
      `**Like API:** ${apiCfg.likeUrl ? "✅ Configured" : "⚠️ Not set"}\n` +
      `**JWT API:** ✅ Ready\n` +
      `**Web Logs:** ${cfg.weblogsChannelId ? "✅" : "⚠️ Not set"}\n` +
      `**User Logs:** ${cfg.userlogsChannelId ? "✅" : "⚠️ Not set"}\n` +
      `**Requests:** ${cfg.requestsChannelId ? "✅" : "⚠️ Not set"}\n\n` +
      `**Last Heartbeat:** ${lastSeen}\n` +
      `**Ping:** ${interaction.client.ws.ping}ms`;

    return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [v2(msg)] });
  }
};
