const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');

const GuildModel = require('../../schemas/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spam')
    .setDescription('Send spam requests to Free Fire player')
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Select player region')
        .setRequired(true)
        .addChoices(
          { name: 'BD', value: 'bd' },
          { name: 'IND', value: 'ind' },
          { name: 'BR', value: 'br' },
          { name: 'ME', value: 'me' },
          { name: 'EUROPE', value: 'europe' },
          { name: 'PK', value: 'pk' },
          { name: 'VN', value: 'vn' },
          { name: 'SG', value: 'sg' }
        )
    )
    .addStringOption(option =>
      option.setName('uid')
        .setDescription('Enter player UID')
        .setRequired(true)
    ),

  async execute(interaction) {

    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    const region = interaction.options.getString('region');
    const uid = interaction.options.getString('uid');

    // ---------------- CHECK CHANNEL CONFIG ----------------
    try {

      const config = await GuildModel.findOne({ guildId });

      if (!config || !config.spamChannelId) {
        return interaction.reply({
          flags: MessageFlags.IsComponentsV2,
          components: [
            new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
`⚠️ **Server Configuration Missing**

Spam channel is not configured.`
              )
            )
          ]
        });
      }

      if (channelId !== config.spamChannelId) {

        const spamChannel = interaction.guild.channels.cache.get(config.spamChannelId);

        return interaction.reply({
          flags: MessageFlags.IsComponentsV2,
          components: [
            new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
`❌ **Wrong Channel**

Use this command in:
${spamChannel || "Configured spam channel"}`
              )
            )
          ]
        });
      }

    } catch (err) {

      console.error("Database Error:", err);

      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
`❌ **Database Error**

Please try again later.`
            )
          )
        ]
      });

    }

    // ---------------- LOADING MESSAGE ----------------
    await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
`⏳ **Sending Spam Requests...**

UID: ${uid}
Region: ${region.toUpperCase()}

Please wait...`
          )
        )
      ]
    });

    try {

      const fetch = (await import('node-fetch')).default;

      const apiUrl = `https://wotaxxdev-spamxvisit-api.vercel.app/send_requests?uid=${uid}&region=${region}`;

      const res = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const data = await res.json();

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
`✅ **Spam Requests Sent**

**UID:** ${uid}
**Region:** ${region.toUpperCase()}
**Nickname:** ${data.nickname || "Unknown"}
**Level:** ${data.level || "Unknown"}

**Success:** ${data.success || 0}
**Failed:** ${data.fail || 0}

**Dev:** Rebel`
          )
        );

      await interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      });

    } catch (error) {

      console.error("System Error:", error);

      await interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
`❌ **System Error**

UID: ${uid}
Region: ${region}

API slow or unreachable.`
            )
          )
        ]
      });

    }
  }
};