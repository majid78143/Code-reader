const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageFlags
} = require("discord.js");
const config = require("../../../config.json");

function isAuth(userId) {
  return userId === config.bot.ownerId || config.bot.admins.includes(userId);
}

function v2(content) {
  return new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

const CATEGORIES = {
  home: {
    label: "🏠 Home",
    content: (username, isAdmin) =>
      `# 🎮 MJ DEVLOPER Bot\n\n` +
      `Hey **${username}**, welcome to **MJ DEVLOPER**!\n\n` +
      `**Prefix:** \`!\`\n` +
      `**Slash Commands:** \`/\`\n` +
      `**Platform:** Free Fire SaaS\n\n` +
      `**Select a category below to explore commands.**\n\n` +
      (isAdmin ? `⚙️ *Admin commands are visible because you are an admin.*` : ``),
  },
  tools: {
    label: "🎮 Free Fire Tools",
    content: () =>
      `# 🎮 Free Fire Tools\n\n` +
      `**Website Tools (via website):**\n` +
      `• Profile Generator — Generate Free Fire profile cards\n` +
      `• Like Sender — Send likes to any Free Fire player\n` +
      `• JWT Generator — Generate JWT tokens\n` +
      `• Combined Request — Profile + Likes at once\n\n` +
      `**Discord Commands:**\n` +
      `\`!like <server> <uid>\` — Send likes to player\n` +
      `\`!info <uid>\` — View player info\n` +
      `\`!search <name>\` — Search player by name\n` +
      `\`!clan <tag>\` — Search clan\n` +
      `\`/like <server> <uid>\` — Send likes (slash)\n` +
      `\`/info <uid>\` — Player info (slash)`,
  },
  login: {
    label: "🔐 Login System",
    content: () =>
      `# 🔐 Login System\n\n` +
      `**How to Login:**\n` +
      `1. Open the website and click **Login**\n` +
      `2. Join the official Discord server\n` +
      `3. Enter your **Discord User ID**\n` +
      `4. Wait for OTP via **Discord DM**\n` +
      `5. Enter OTP on the website\n` +
      `6. You're in! ✅\n\n` +
      `**Notes:**\n` +
      `• OTP expires in **5 minutes**\n` +
      `• Max **3 attempts** before lockout\n` +
      `• Must have DMs open from server members\n` +
      `• Sessions persist across browser refreshes`,
  },
  website: {
    label: "🌐 Website Controls",
    content: (username, isAdmin) => isAdmin
      ? `# 🌐 Website Admin Controls\n\n` +
        `\`/weblogs set #channel\` — Set API/system logs channel\n` +
        `\`/userlogs set #channel\` — Set user/login logs channel\n` +
        `\`/requests set #channel\` — Set all-requests monitor channel\n` +
        `\`/setserverinvite <link>\` — Set the server invite shown at login\n` +
        `\`/branding set <field> <value>\` — Edit website branding\n` +
        `\`/branding dev <field> <value>\` — Edit developer panel\n` +
        `\`/branding view\` — View all branding settings\n` +
        `\`/html upload\` — Upload safe HTML block\n` +
        `\`/html list\` — List all HTML blocks\n` +
        `\`/html delete <id>\` — Delete HTML block`
      : `# 🌐 Website\n\nVisit the official website to use Free Fire tools.\n\nUse \`!help\` for public commands.`,
  },
  api: {
    label: "📡 API Commands",
    content: (username, isAdmin) => isAdmin
      ? `# 📡 API Management\n\n` +
        `\`/api profile set <url>\` — Set profile image API URL\n` +
        `\`/api like set <url>\` — Set like API URL\n` +
        `\`/api like key <key>\` — Set like API key\n` +
        `\`/api jwt set <url>\` — Set JWT API URL\n` +
        `\`/api list\` — View all API configs\n` +
        `\`/api status\` — Check API status\n` +
        `\`/api test\` — Test all APIs\n` +
        `\`/api start\` — Bring APIs online\n` +
        `\`/api stop\` — Put APIs in maintenance\n` +
        `\`/api maintenance\` — Toggle maintenance\n` +
        `\`/api cooldown <secs>\` — Set request cooldown`
      : `# 📡 API Status\n\nUse \`/status\` to check API status.`,
  },
  premium: {
    label: "💎 Premium System",
    content: () =>
      `# 💎 Premium System\n\n` +
      `**Roles:**\n` +
      `• 🥈 VIP — Priority queue, higher limits\n` +
      `• 🥇 PREMIUM — Faster requests, exclusive tools\n` +
      `• 💎 ELITE — Reduced cooldowns, all features\n\n` +
      `**Like Limits:**\n` +
      `• Free: 1 like request per device per day\n` +
      `• Buy more credits: Use the website "Buy Credits" button\n\n` +
      `**Profile & JWT:** Unlimited requests`,
  },
  security: {
    label: "🛡️ Security",
    content: () =>
      `# 🛡️ Security System\n\n` +
      `• OTP expires after **5 minutes**\n` +
      `• Max **3 failed OTP attempts** → Account locked\n` +
      `• Device fingerprint tracking\n` +
      `• IP hash tracking (not stored in plain text)\n` +
      `• 1 like per device per day limit\n` +
      `• All sessions tracked in Firebase\n` +
      `• HTML upload validation (blocks dangerous scripts)\n` +
      `• All requests logged to Discord channels`,
  },
  admin: {
    label: "⚙️ Admin Commands",
    adminOnly: true,
    content: () =>
      `# ⚙️ Admin Commands\n\n` +
      `\`/admins add @user\` — Add an admin\n` +
      `\`/admins remove @user\` — Remove an admin\n` +
      `\`/admins list\` — List all admins\n` +
      `\`/admin type:likesetup\` — Configure like channel\n` +
      `\`/admin type:autolike\` — Configure auto-like\n` +
      `\`/setup type:searchchannel\` — Set search channel\n` +
      `\`/buycreditlink set <url>\` — Set buy credits URL\n` +
      `\`/buycreditlink view\` — View buy credits URL\n` +
      `\`/buycreditlink remove\` — Remove it`,
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show the help menu")
    .addStringOption(o =>
      o.setName("command").setDescription("Specific command to look up")
    ),

  async execute(interaction) {
    const admin = isAuth(interaction.user.id);
    const query = interaction.options.getString("command");

    const menuOptions = Object.entries(CATEGORIES)
      .filter(([, cat]) => !cat.adminOnly || admin)
      .map(([key, cat]) => ({ label: cat.label, value: key }));

    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("help_category")
        .setPlaceholder("📖 Select Category")
        .addOptions(menuOptions)
    );

    const brandingName = config.branding?.main || "MJ DEVLOPER";

    const quickButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("🌐 Website").setStyle(ButtonStyle.Link).setURL("https://your-website.netlify.app"),
      new ButtonBuilder().setLabel("📢 Discord").setStyle(ButtonStyle.Link).setURL("https://discord.gg/"),
      new ButtonBuilder().setCustomId("help_close").setLabel("✖ Close").setStyle(ButtonStyle.Danger)
    );

    const homeContent = CATEGORIES.home.content(interaction.user.username, admin);

    const msg = await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [v2(homeContent), selectMenu, quickButtons],
      fetchReply: true
    });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120000
    });

    collector.on("collect", async i => {
      if (i.isStringSelectMenu() && i.customId === "help_category") {
        const key = i.values[0];
        const cat = CATEGORIES[key];
        if (!cat) return i.deferUpdate();

        const content = typeof cat.content === "function"
          ? cat.content(i.user.username, admin)
          : cat.content;

        await i.update({
          flags: MessageFlags.IsComponentsV2,
          components: [v2(content), selectMenu, quickButtons]
        });
      }

      if (i.isButton() && i.customId === "help_close") {
        await msg.delete().catch(() => {});
      }
    });

    collector.on("end", () => {
      msg.edit({ components: [v2(homeContent)] }).catch(() => {});
    });
  }
};
