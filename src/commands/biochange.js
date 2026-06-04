const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const GuildModel = require('../../schemas/guildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('changebio')
        .setDescription('Update the bio of a player using access token')
        .addStringOption(option =>
            option.setName('access_token')
                .setDescription('Enter the access token')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('bio')
                .setDescription('Enter the new bio')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        try {
            const accessToken = interaction.options.getString('access_token');
            const bio = interaction.options.getString('bio');
            const guildId = interaction.guildId;
            const channelId = interaction.channelId;

            const config = await GuildModel.findOne({ guildId });
            if (!config || !config.bioChannelId) {
                return interaction.editReply({
                    flags: MessageFlags.IsComponentsV2,
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                '❌ Bio channel is not configured on this server.'
                            )
                        )
                    ]
                });
            }

            if (channelId !== config.bioChannelId) {
                return interaction.editReply({
                    flags: MessageFlags.IsComponentsV2,
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `❌ Please use this command in the configured bio channel <#${config.bioChannelId}>.`
                            )
                        )
                    ]
                });
            }

            // Processing message
            const loadingMsg = await interaction.editReply({
                flags: MessageFlags.IsComponentsV2,
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`⏳ ${interaction.user}, Processing bio update...`)
                    )
                ]
            });

            const url = `https://wotaxxdev-api.vercel.app/update_bio?access_token=${encodeURIComponent(accessToken)}&bio=${encodeURIComponent(bio)}&key=nexx`;

            const res = await fetch(url);
            const result = await res.json();

            if (result.status === 'error' || result.status === 'failed') {
                return interaction.editReply({
                    flags: MessageFlags.IsComponentsV2,
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `❌ ${interaction.user}, ${result.message || 'Bio update failed.'}`
                            )
                        )
                    ]
                });
            }

            if (result.status === 'success') {
                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
`✅ Bio Updated Successfully

**Player UID:** ${result.uid || "Unknown"}
**Region:** ${(result.region || "Unknown").toUpperCase()}
**Nickname:** ${result.nickname || "Unknown"}
**Platform:** ${result.platform || "Unknown"}

**Updated Bio:**
${bio}

_Dev : Rebel Notorious Official_`
                        )
                    );

                return interaction.editReply({
                    flags: MessageFlags.IsComponentsV2,
                    components: [container]
                });
            }

            // Fallback unexpected response
            return interaction.editReply({
                flags: MessageFlags.IsComponentsV2,
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `⚠️ ${interaction.user}, Unexpected API response. Please try again later.`
                        )
                    )
                ]
            });

        } catch (err) {
            console.error('ChangeBio Error:', err);
            return interaction.editReply({
                flags: MessageFlags.IsComponentsV2,
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `❌ ${interaction.user}, Something went wrong while updating the bio.`
                        )
                    )
                ]
            });
        }
    }
};