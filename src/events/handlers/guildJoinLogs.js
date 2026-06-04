const { 
    ContainerBuilder, 
    TextDisplayBuilder, 
    MessageFlags 
} = require('discord.js');
const config = require('../../../config.json');
const GuildModel = require('../../schemas/guildConfig');

module.exports = {
    name: 'guildCreate',
    async execute(guild, client) {
        const channelId = config.logging.guildJoinLogsId;
        if (!channelId || channelId === 'GUILD_JOIN_LOGS_CHANNEL_ID') return;

        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            console.error(`Channel with ID ${channelId} does not exist or is not a text channel for guild join logs.`);
            return;
        }

        const memberCount = guild.memberCount;

        // 🔹 Build V2 container embed
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
`📥 **Bot Joined New Guild**

🏷️ **Guild Name:** ${guild.name}
👑 **Owner:** Fetching...
👥 **Total Members:** ${memberCount}
🆔 **Guild ID:** ${guild.id}
🕒 **Joined At:** ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Powered by 7xEnity v2`
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

        // ✅ Insert or update guild info in MongoDB
        try {
            const existing = await GuildModel.findOne({ guildId: guild.id });

            if (!existing) {
                const owner = await guild.fetchOwner();
                await GuildModel.create({
                    guildId: guild.id,
                    guildName: guild.name,
                    guildOwner: owner.user.username || 'Unknown'
                });
                console.log(`✅ Guild saved to DB: ${guild.name}`);
            } else {
                console.log(`ℹ️ Guild already in DB: ${guild.name}`);
            }
        } catch (err) {
            console.error(`❌ Failed to save guild to DB: ${guild.name}`, err);
        }
    }
};