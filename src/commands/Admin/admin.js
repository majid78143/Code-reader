const { 
  SlashCommandBuilder,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require("discord.js");

const GuildModel = require("../../../schemas/guildConfig");
const AutoLikeModel = require("../../../schemas/autolike");
const mongoose = require("mongoose");
const fetch = require("node-fetch");

// ---------------- V2 RESPONSE ----------------
function createV2(message) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(message)
    );
}

// ---------------- TIME PARSER ----------------
function parseDuration(input) {

  if (!input) return null;

  const match = input.match(/^(\d+)([mhdwM])$/);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers = {
    m: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000,
    M: 2592000000
  };

  return value * multipliers[unit];
}

// ---------------- FRIEND API ----------------
async function friendControlAPI(action, uid) {

  try {

    const url = `https://wotax-frn-controller-api.vercel.app/${action}?id=${uid}`;
    const res = await fetch(url);
    const data = await res.json();

    return { success: res.ok, status: res.status, data };

  } catch (err) {

    return { success: false, error: err.message };

  }
}

// ---------------- COMMAND ----------------
module.exports = {

  ownerOnly: true,

  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin setup & configuration")

    .addStringOption(opt =>
      opt.setName("type")
        .setDescription("Select setup type")
        .setRequired(true)
        .addChoices(
          { name: "Like System Setup", value: "likesetup" },
          { name: "Auto-Like Setup", value: "autolike" },
          { name: "Friend Request Control", value: "friendreq" },
          { name: "Token State Info", value: "tokenstate" }
        )
    )

    .addStringOption(opt =>
      opt.setName("action")
        .setDescription("Action")
        .addChoices(
          { name: "Set / Add", value: "set" },
          { name: "Remove", value: "remove" }
        )
    )

    .addChannelOption(opt =>
      opt.setName("channel")
        .setDescription("Log channel")
        .addChannelTypes(ChannelType.GuildText)
    )

    .addStringOption(opt =>
      opt.setName("uid")
        .setDescription("Free Fire UID")
    )

    .addStringOption(opt =>
      opt.setName("region")
        .setDescription("Player region")
        .addChoices(
          { name: "Singapore", value: "sg" },
          { name: "India", value: "ind" },
          { name: "Bangladesh", value: "bd" },
          { name: "Pakistan", value: "pk" },
          { name: "Thailand", value: "th" },
          { name: "Indonesia", value: "id" },
          { name: "Vietnam", value: "vn" },
          { name: "North America", value: "na" },
          { name: "Malaysia", value: "my" },
          { name: "Brazil", value: "br" },
          { name: "USA", value: "us" },
          { name: "Russia", value: "ru" },
          { name: "Europe", value: "eu" }
        )
    )

    .addStringOption(opt =>
      opt.setName("time")
        .setDescription("Expiry time (10m, 2h, 7d, 1w, 1M)")
    ),

  async execute(interaction) {

    const type = interaction.options.getString("type");
    const action = interaction.options.getString("action");
    const guildId = interaction.guild.id;

    try {

      let cfg = await GuildModel.findOne({ guildId });

      if (!cfg) {
        cfg = new GuildModel({
          guildId,
          guildName: interaction.guild.name,
          guildOwner: interaction.guild.ownerId
        });
      }

      // ================= LIKE SYSTEM =================
      if (type === "likesetup") {

        const channel = interaction.options.getChannel("channel");

        if (action === "set") {

          if (!channel)
            return interaction.reply({
              flags: MessageFlags.IsComponentsV2,
              components: [createV2("❌ Channel required.")]
            });

          cfg.likeChannelId = channel.id;
          cfg.isAllowed = true;

          await cfg.save();

          return interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [createV2(`✅ Like system enabled in ${channel}`)]
          });
        }

        if (action === "remove") {

          cfg.likeChannelId = null;
          cfg.isAllowed = false;

          await cfg.save();

          return interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [createV2("✅ Like system disabled.")]
          });
        }
      }

      // ================= AUTO LIKE =================
      if (type === "autolike") {

        const uid = interaction.options.getString("uid");
        const region = interaction.options.getString("region");
        const channel = interaction.options.getChannel("channel");
        const timeInput = interaction.options.getString("time");

        let doc = await AutoLikeModel.findOne({ guildId });

        if (!doc) doc = new AutoLikeModel({ guildId, entries: [] });

        // ----- SET AUTO LIKE LOG CHANNEL -----
        if (action === "set" && channel && !uid) {

          doc.channelId = channel.id;
          await doc.save();

          cfg.autoLikeChannelId = channel.id;
          await cfg.save();

          return interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [createV2(`✅ AutoLike log channel set to ${channel}`)]
          });
        }

        // ----- REMOVE UID -----
        if (action === "remove") {

          if (!uid)
            return interaction.reply({
              flags: MessageFlags.IsComponentsV2,
              components: [createV2("❌ UID required.")]
            });

          const index = doc.entries.findIndex(e => e.uid === uid);

          if (index === -1)
            return interaction.reply({
              flags: MessageFlags.IsComponentsV2,
              components: [createV2(`❌ UID ${uid} not found.`)]
            });

          doc.entries.splice(index, 1);
          await doc.save();

          return interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [createV2(`✅ UID ${uid} removed from AutoLike.`)]
          });
        }

        // ----- ADD UID -----
        if (action === "set") {

          if (!uid || !region || !timeInput)
            return interaction.reply({
              flags: MessageFlags.IsComponentsV2,
              components: [createV2("❌ Provide UID + Region + Time.")]
            });

          const exists = doc.entries.find(e => e.uid === uid);

          if (exists)
            return interaction.reply({
              flags: MessageFlags.IsComponentsV2,
              components: [createV2("❌ UID already exists.")]
            });

          const duration = parseDuration(timeInput);

          if (!duration)
            return interaction.reply({
              flags: MessageFlags.IsComponentsV2,
              components: [createV2("❌ Invalid time format.")]
            });

          doc.entries.push({
            uid,
            region,
            addedBy: interaction.user.id,
            createdAt: new Date(),
            lastLikedAt: null,
            expireAt: new Date(Date.now() + duration)
          });

          await doc.save();

          return interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [createV2(`✅ UID ${uid} added to AutoLike.`)]
          });
        }
      }

      // ================= FRIEND REQUEST =================
      if (type === "friendreq") {

        const uid = interaction.options.getString("uid");

        if (!uid)
          return interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [createV2("❌ UID required.")]
          });

        await interaction.deferReply();

        const result = await friendControlAPI(
          action === "set" ? "add" : "remove",
          uid
        );

        return interaction.editReply({
          flags: MessageFlags.IsComponentsV2,
          components: [
            createV2(
              result.success
                ? `✅ Friend request updated for ${uid}`
                : `❌ ${result.error}`
            )
          ]
        });
      }

      // ================= TOKEN STATE =================
      if (type === "tokenstate") {

        const db = mongoose.connection.client.db();

        const tokens = await db
          .collection("token_state")
          .find({})
          .toArray();

        if (!tokens.length)
          return interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [createV2("❌ No token state data found.")]
          });

        let msg = "🔑 **Token State Info**\n\n";

        for (const t of tokens) {

          msg += `🌍 ${t.region}
Success: ${t.success_count}
Index: ${t.current_index}

`;
        }

        return interaction.reply({
          flags: MessageFlags.IsComponentsV2,
          components: [createV2(msg)]
        });
      }

    } catch (err) {

      console.error("Admin command error:", err);

      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [createV2("❌ Unexpected error occurred.")]
      });

    }
  }
};
