const { 
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const axios = require('axios');
const GuildModel = require('../../schemas/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('visits')
    .setDescription('Send visit requests to a Free Fire player')
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Select the player region')
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
        .setDescription('Enter the player UID')
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const region = interaction.options.getString('region').toLowerCase();
    const uid = interaction.options.getString('uid');

    const validRegions = ['bd','ind','br','me','europe','pk','vn','sg'];
    if (!validRegions.includes(region)) {
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
`❌ **Invalid Region**

Valid regions: bd, ind, br, me, europe, pk, vn, sg`
            )
          )
        ]
      });
    }

    // ---------------- CHANNEL CONFIG CHECK ----------------
    try {
      const config = await GuildModel.findOne({ guildId });

      if (!config || !config.visitChannelId) {
        return interaction.reply({
          flags: MessageFlags.IsComponentsV2,
          components: [
            new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
`⚠️ **Server Configuration Missing**

Visit channel is not configured. Please contact server admins.`
              )
            )
          ]
        });
      }

      if (channelId !== config.visitChannelId) {
        const visitChannel = interaction.guild.channels.cache.get(config.visitChannelId);
        return interaction.reply({
          flags: MessageFlags.IsComponentsV2,
          components: [
            new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
`❌ **Wrong Channel**

Use this command in:
${visitChannel || "Configured visit channel"}`
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
    await interaction.deferReply({ ephemeral: false });
    const loading = await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
`⏳ **Sending Visit Requests**

UID: ${uid}
Region: ${region.toUpperCase()}

Please wait...`
          )
        )
      ]
    });

    // ---------------- API CALL ----------------
    try {
      const apiUrl = `https://wotaxxdev-api.vercel.app/visits?uid=${uid}&region=${region}`;
      const response = await axios.get(apiUrl, { timeout: 30000 });
      const data = response.data;

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
`✅ **Visit Requests Sent**

**Nickname:** ${data.nickname || "Unknown"}
**UID:** ${data.uid || uid}
**Region:** ${data.region || region.toUpperCase()}
**Level:** ${data.level || "Unknown"}
**Likes:** ${data.likes || 0}

**Success:** ${data.success || 0}
**Failed:** ${data.fail || 0}

_Dev Rebel_`
          )
        );

      await interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      });

    } catch (error) {
      console.error("API Error:", error.message);
      return interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
`❌ **API Error**

UID: ${uid}
Region: ${region.toUpperCase()}

API not responding or UID invalid.`
            )
          )
        ]
      });
    }
  }
};