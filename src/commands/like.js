const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} = require('discord.js');
const axios = require('axios');
const mongoose = require('mongoose');
const GuildModel = require('../../schemas/guildConfig');

// ---------------- REGION MAP ----------------
const REGION_MAP = {
  sg: "sg",
  bd: "sg",
  eu: "sg",
  ind: "ind",
  in: "ind",
};

// ---------------- USER LIMITS ----------------
const USER_LIMITS = {
  "1150752224956403763": 20, // Owner bypass
  "1347611047338709052": 5,
  "1206992243198795838": 3,
};

// ---------------- DAILY LIMIT SCHEMA ----------------
const LikeLimitSchema = new mongoose.Schema({
  userId: String,
  count: { type: Number, default: 0 },
  lastReset: { type: Date, default: Date.now }
});

const LikeLimit =
  mongoose.models.LikeLimit ||
  mongoose.model("LikeLimit", LikeLimitSchema);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('like')
    .setDescription('Send Free Fire likes (V2)')
    .addStringOption(opt => 
      opt.setName('server')
        .setDescription('Server (sg, bd, eu, ind)')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('uid')
        .setDescription('Player UID')
        .setRequired(true)),

  async execute(interaction) {
    const userId = interaction.user.id;
    const args = [
      interaction.options.getString('server'),
      interaction.options.getString('uid')
    ];

    // ---------------- USER PERMISSION ----------------
    if (!USER_LIMITS[userId]) {
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent("❌ You cannot use this command.")
        )]
      });
    }

    if (args.length < 2) {
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent("⚠️ Usage: `/like <server> <uid>`\nServers: sg, bd, eu → sg; ind → ind")
        )]
      });
    }

    const guildId = interaction.guild.id;
    const channelId = interaction.channelId;

    // ---------------- CHECK LIKE CHANNEL ----------------
    if (userId !== "1150752224956403763") {
      const config = await GuildModel.findOne({ guildId });
      if (!config || !config.likeChannelId) {
        return interaction.reply({
          flags: MessageFlags.IsComponentsV2,
          components: [new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent("❌ Like channel is not set.")
          )]
        });
      }
      if (channelId !== config.likeChannelId) {
        const likeChannel = interaction.guild.channels.cache.get(config.likeChannelId);
        return interaction.reply({
          flags: MessageFlags.IsComponentsV2,
          components: [new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`❌ This command can only be used in ${likeChannel || 'the like channel'}`)
          )]
        });
      }
    }

    // ---------------- DAILY LIMIT ----------------
    const dailyLimit = USER_LIMITS[userId];
    const now = new Date();
    let limitData = await LikeLimit.findOne({ userId }) || new LikeLimit({ userId });
    const last = new Date(limitData.lastReset);

    if (
      last.getDate() !== now.getDate() ||
      last.getMonth() !== now.getMonth() ||
      last.getFullYear() !== now.getFullYear()
    ) {
      limitData.count = 0;
      limitData.lastReset = now;
    }

    if (limitData.count >= dailyLimit) {
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`❌ Daily limit reached. Limit: ${dailyLimit} per day.`)
        )]
      });
    }

    // ---------------- INPUT VALIDATION ----------------
    const serverInput = args[0].toLowerCase();
    const uid = args[1];

    if (!REGION_MAP[serverInput]) {
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent("❌ Invalid server. Use: sg, bd, eu, ind")
        )]
      });
    }

    if (!/^\d{8,12}$/.test(uid)) {
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent("❌ Invalid UID format.")
        )]
      });
    }

    const apiServer = REGION_MAP[serverInput];
    const regionText = serverInput === "bd" || serverInput === "eu" ? "Bangladesh"
                     : serverInput === "ind" || serverInput === "in" ? "India"
                     : serverInput.toUpperCase();

    // ---------------- API CALL ----------------
    await interaction.deferReply({ ephemeral: false });
    try {
      const { data } = await axios.get("", {
        params: { region: apiServer, uid: uid, key: "" },
        timeout: 15000
      });

      if (!data || data.status !== 1 || !data.response) {
        return interaction.followUp({
          flags: MessageFlags.IsComponentsV2,
          components: [new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`❌ Like failed. Reason: ${data?.message || "API cooldown / limit"}`)
          )]
        });
      }

      const r = data.response;
      limitData.count += 1;
      await limitData.save();

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
`🎮 **Garena Free Fire Likes**
**Player:** ${r.PlayerNickname}
**Level:** ${r.PlayerLevel}
**Region:** ${regionText}

**Likes Before:** ${r.LikesbeforeCommand}
**Likes Added:** +${r.LikesGivenByAPI}
**Likes After:** ${r.LikesafterCommand}

**UID:** ${r.UID}
**Daily Credit Remaining:** ${dailyLimit - limitData.count}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder());

      await interaction.followUp({
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      });

    } catch (err) {
      console.error("LIKE API ERROR:", err);
      return interaction.followUp({
        flags: MessageFlags.IsComponentsV2,
        components: [new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`❌ API request failed. Error: ${err.message}`)
        )]
      });
    }
  }
};