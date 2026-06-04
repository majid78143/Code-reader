const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const GuildModel = require('../../schemas/guildConfig');

function getRegionDetails(regionCode) {
    const regions = {
        'ID': { name: 'Indonesia', logo: '🇮🇩' },
        'TH': { name: 'Thailand', logo: '🇹🇭' },
        'IND': { name: 'India', logo: '🇮🇳' },
        'BR': { name: 'Brazil', logo: '🇧🇷' },
        'SG': { name: 'Singapore', logo: '🇸🇬' },
        'BD': { name: 'Bangladesh', logo: '🇧🇩' },
        'PK': { name: 'Pakistan', logo: '🇵🇰' },
        'US': { name: 'United States', logo: '🇺🇸' },
        'MY': { name: 'Malaysia', logo: '🇲🇾' },
        'VN': { name: 'Vietnam', logo: '🇻🇳' },
        'SSA': { name: 'Africa', logo: '🌍' },
        'EU': { name: 'Europe', logo: '🇪🇺' },
        'RU': { name: 'Russia', logo: '🇷🇺' },
        'ME': { name: 'Middle East and Africa', logo: '🌍' },
        'SAC': { name: 'South America Central', logo: '🌎' },
        'NA': { name: 'North America', logo: '🌎' }
    };
    return regions[regionCode] || { name: 'Unknown', logo: '❔' };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check')
        .setDescription('Check if a Free Fire player is banned or not')
        .addStringOption(option =>
            option.setName('uid')
                .setDescription('Enter the player UID')
                .setRequired(true)
        ),

    async execute(interaction) {
        const uid = interaction.options.getString('uid');
        const guildId = interaction.guildId;
        const channelId = interaction.channelId;

        try {
            const config = await GuildModel.findOne({ guildId });

            if (!config || !config.bancheckChannelId) {
                return interaction.reply({
                    flags: MessageFlags.IsComponentsV2,
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                '⚠️ Ban check channel is not configured on this server. Please contact admins.'
                            )
                        )
                    ]
                });
            }

            if (channelId !== config.bancheckChannelId) {
                return interaction.reply({
                    flags: MessageFlags.IsComponentsV2,
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `❌ Please use this command in the configured channel: <#${config.bancheckChannelId}>`
                            )
                        )
                    ]
                });
            }

            await interaction.deferReply({ ephemeral: false });

            const fetch = (await import('node-fetch')).default;
            const res = await fetch(`https://free-fire-check-ban.vercel.app/ban-info?uid=${uid}`);
            if (!res.ok) {
                return interaction.editReply({
                    flags: MessageFlags.IsComponentsV2,
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                '❌ Failed to fetch ban info from server. Try again later.'
                            )
                        )
                    ]
                });
            }

            const result = await res.json();

            const nickname = result.nickname || 'Unknown';
            const level = result.level || 'N/A';
            const region = getRegionDetails(result.region);
            const banned = result.banned === true;
            const banStatus = banned ? '🚫 BANNED' : '✅ NOT BANNED';
            const banDate = result.banDate || 'N/A';
            const currentDate = new Date();

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
`❄️ **Player Ban Status Check**

🍁 **Nickname:** ${nickname}
🌸 **Level:** ${level}

❄️ **Region:** ${region.name} ${region.logo}

🌿 **Account Status:** ${banStatus}
🍂 **Ban Date:** ${banDate}

🦕 **Checked UID:** ${uid}
🫧 **Checked By:** ${interaction.user.username}
🌱 **Check Time:** ${currentDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Free Fire • Ban Check System`
                    )
                );

            return interaction.editReply({
                flags: MessageFlags.IsComponentsV2,
                components: [container]
            });

        } catch (error) {
            console.error('Ban check error:', error);
            return interaction.editReply({
                flags: MessageFlags.IsComponentsV2,
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '❌ System Error: Something went wrong. Please try again later.'
                        )
                    )
                ]
            });
        }
    }
};
