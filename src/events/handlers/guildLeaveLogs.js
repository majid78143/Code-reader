const { 
    ContainerBuilder, 
    TextDisplayBuilder, 
    MessageFlags 
} = require('discord.js');
const config = require('../../../config.json');
const GuildModel = require('../../schemas/guildConfig');

module.exports = {
    name: 'guildDelete',
    async execute(guild, client) {
        const channelId = config.logging.guildLeaveLogsId;
        if (!channelId || channelId === 'GUILD_LEAVE_LOGS_CHANNEL_ID') return;

        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            console.error(`Channel with ID ${channelId} does not exist or is not a text channel for guild leave logs.`);
            return;
        }

        const memberCount = guild.memberCount;

        // 🔹 Build V2 container embed for leave logs
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
`📤 **Bot Left a Guild**

🏷️ **Guild Name:** ${guild.name}
👥 **Total Members:** ${memberCount}
🆔 **Guild ID:** ${guild.id}
🕒 **Left At:** ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Powered by Bot • ULTIGER IOS`
                )
            );

        try {
            await channel.send({
                flags: MessageFlags.IsComponentsV2,
                components: [container]
            });
        } catch (error) {
            console.error(`Failed to send V2 message to channel ${channelId}:`, error);
        }

        // ✅ Delete guild from MongoDB
        try {
            const result = await GuildModel.findOneAndDelete({ guildId: guild.id });
            if (result) {
                console.log(`🗑️ Guild removed from DB: ${guild.name}`);
            } else {
                console.log(`ℹ️ Guild not found in DB: ${guild.name}`);
            }
        } catch (err) {
            console.error(`❌ Error deleting guild from DB: ${guild.name}`, err);
        }
    }
};