const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MessageFlags
} = require("discord.js");

const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const GuildModel = require("../../schemas/guildConfig");

function formatNumber(num) {
  return num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "N/A";
}

function formatTimestamp(ts) {
  if (!ts) return "N/A";
  return new Date(Number(ts) * 1000).toLocaleString();
}

// Convert custom emoji format <:prime_8:123456> to :prime_8:
function formatPrimeLevel(levelObj) {
  if (!levelObj?.primeLevel) return "N/A";
  let str = levelObj.primeLevel;
  // Replace all custom emoji patterns with :name:
  return str.replace(/<:([a-zA-Z0-9_]+):\d+>/g, ':$1:');
}

async function fetchPlayerInfo(uid) {
  const res = await fetch(`http://raw.sukhdaku.qzz.io/player/info?uid=${uid}`);
  if (!res.ok) throw new Error("Failed to fetch player info.");
  return res.json();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("get")
    .setDescription("Get full Free Fire player info by UID")
    .addStringOption(option =>
      option.setName("uid")
        .setDescription("Enter player UID")
        .setRequired(true)
    ),

  async execute(interaction) {
    const uid = interaction.options.getString("uid");
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    try {
      const config = await GuildModel.findOne({ guildId });
      if (!config || !config.infoChannelId) {
        return interaction.reply({
          content: "Server configuration missing or info channel not set.",
          ephemeral: true
        });
      }

      if (channelId !== config.infoChannelId) {
        return interaction.reply({
          content: `Please use this command in <#${config.infoChannelId}>.`,
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: false });

      const data = await fetchPlayerInfo(uid);

      const player = data.playerData || {};
      const profile = data.profileInfo || {};
      const guild = data.guildInfo || {};
      const guildOwner = data.guildOwnerInfo || {};
      const pet = data.petInfo || {};
      const social = data.socialInfo || {};
      const diamond = data.diamondCostRes || {};
      const credit = data.creditScoreInfo || {};

      const profileCard = `http://raw.sukhdaku.qzz.io/profile/profile?uid=${uid}`;
      const outfitImage = `https://outfit.sukhdaku.qzz.io/api/v1/profile?uid=${uid}&bg=3`;

      // ==================== BASIC INFO ====================
      const basic = `## 🍁 PLAYER BASIC INFO
Nickname: ${player.nickname}
UID: ${player.accountId}
Account Type: ${player.accountType}
Region: ${player.region}
Level: ${player.level}
Exp: ${formatNumber(player.exp)}
Likes: ${formatNumber(player.liked)}
Elite Pass: ${player.hasElitePass ? "Yes" : "No"}
Prime Level: ${formatPrimeLevel(player.primeLevel)}
Release Version: ${player.releaseVersion}
`;

      // ==================== RANK INFO ====================
      const rank = `### 🏆 RANK INFO
BR Rank: ${player.rank}
BR Points: ${player.rankingPoints}
CS Rank: ${player.csRank}
CS Points: ${player.csRankingPoints}
Max BR Rank: ${player.maxRank}
Max CS Rank: ${player.csMaxRank}
`;

      // ==================== ACCOUNT DETAILS ====================
      const account = `### 📊 ACCOUNT DETAILS
Badge Count: ${player.badgeCnt}
Badge ID: ${player.badgeId}
Banner ID: ${player.bannerId}
HeadPic ID: ${player.headPic}
Title ID: ${player.title}
Season ID: ${player.seasonId}
Role: ${player.role}
Created: ${formatTimestamp(player.createAt)}
Last Login: ${formatTimestamp(player.lastLoginAt)}
`;

      // ==================== PROFILE INFO ====================
      const profileInfo = `### 👤 PROFILE INFO
Avatar ID: ${profile.avatarId}
Clothes: ${profile.clothes?.join(", ") || "None"}
Equipped Items: ${profile.equippedItems?.join(", ") || "None"}
Equipped Skills: ${profile.EquippedSkills?.join(", ") || "None"}
PVE Weapon: ${profile.pvePrimaryWeapon}
`;

      // ==================== GUILD INFO ====================
      const guildInfo = `### 🏰 GUILD INFO
Name: ${guild.clanName || "None"}
Guild ID: ${guild.clanId || "None"}
Level: ${guild.clanLevel || "N/A"}
Members: ${guild.memberNum || 0}/${guild.capacity || 0}
Captain: ${guild.captainId || "N/A"}
`;

      // ==================== GUILD OWNER INFO ====================
      const guildOwnerInfo = `### 👑 GUILD OWNER
Nickname: ${guildOwner.nickname || "N/A"}
UID: ${guildOwner.accountId || "N/A"}
Level: ${guildOwner.level || "N/A"}
Region: ${guildOwner.region || "N/A"}
Likes: ${formatNumber(guildOwner.liked)}
`;

      // ==================== PET INFO ====================
      const petInfo = `### 🐾 PET INFO
Pet Name: ${pet.name || "None"}
Level: ${pet.level || "N/A"}
EXP: ${formatNumber(pet.exp)}
Selected: ${pet.isSelected ? "Yes" : "No"}
Skin ID: ${pet.skinId || "N/A"}
Skill ID: ${pet.selectedSkillId || "N/A"}
`;

      // ==================== SOCIAL INFO ====================
      const socialInfo = `### 📱 SOCIAL
Language: ${social.language}
Mode Prefer: ${social.modePrefer}
Signature: ${social.signature}
Rank Show: ${social.rankShow}
`;

      // ==================== DIAMOND COST ====================
      const diamondInfo = `### 💎 DIAMOND
Diamond Cost: ${diamond.diamondCost ?? "N/A"}
`;

      // ==================== CREDIT SCORE ====================
      const creditInfo = `### 📝 CREDIT SCORE
Score: ${credit.creditScore ?? "N/A"}
Reward State: ${credit.rewardState ?? "N/A"}
Summary End: ${formatTimestamp(credit.periodicSummaryEndTime)}
`;

      // ==================== OUTFIT ====================
      const outfitText = `## 🎮 Free Fire Player Outfit
Player UID: ${uid}
Background: 3
✅ Status: Successfully retrieved player outfit
👤 Requested by: ${interaction.user}
`;

      // ==================== BUILD COMPONENT ====================
      const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("## 🪪 Profile Card"))
        .addSeparatorComponents(new SeparatorBuilder())
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems([{ media: { url: profileCard } }]))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(basic))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(rank))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(account))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(profileInfo))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(guildInfo))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(guildOwnerInfo))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(petInfo))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(socialInfo))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(diamondInfo))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(creditInfo))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(outfitText))
        .addSeparatorComponents(new SeparatorBuilder())
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems([{ media: { url: outfitImage } }]));

      await interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      });

    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: `❌ Failed to fetch player info: ${err.message}`,
        ephemeral: true
      });
    }
  }
};