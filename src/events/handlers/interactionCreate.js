const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
  const chalk = require('chalk');
  const config = require('../../../config.json');
  const path = require('path');
  const fs = require('fs');
  const errorsDir = path.join(__dirname, '../../../errors');

  function logError(error) {
    try {
      if (!fs.existsSync(errorsDir)) fs.mkdirSync(errorsDir, { recursive: true });
      fs.writeFileSync(path.join(errorsDir, new Date().toISOString().replace(/:/g,'-')+'.txt'), `${error.name}: ${error.message}\n${error.stack}`, 'utf8');
    } catch(e) {}
  }
  async function sendV2(interaction, content, ephemeral = true) {
    try {
      const c = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
      const opts = { flags: MessageFlags.IsComponentsV2, components:[c] };
      if (ephemeral) opts.ephemeral = true;
      if (interaction.replied || interaction.deferred) await interaction.editReply(opts);
      else await interaction.reply(opts);
    } catch(e) {}
  }

  module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
      try {
        // ── Button: Accept/Reject web requests ──────────────────
        if (interaction.isButton()) {
          const id = interaction.customId;
          const isAdmin = config.bot.admins?.includes(interaction.user.id) || interaction.user.id === config.bot.ownerId;
          if (id.startsWith('accept_req_') || id.startsWith('reject_req_')) {
            if (!isAdmin) return sendV2(interaction, "❌ Admin only.");
            const reqId = id.replace(/^(accept_req_|reject_req_)/, '');
            const isAccept = id.startsWith('accept_req_');
            await interaction.deferUpdate();
            try {
              const { dbUpdate, dbGet } = require('../../firebase');
              await dbUpdate(`/web_requests/${reqId}`, { status: isAccept ? "accepted":"rejected", updatedAt:Date.now(), [isAccept?"acceptedBy":"rejectedBy"]: interaction.user.id });
              const data = await dbGet(`/web_requests/${reqId}`);
              if (data?.discordId && data.discordId !== "guest") {
                const user = await client.users.fetch(data.discordId).catch(()=>null);
                if (user) await user.send(`${isAccept?"✅":"❌"} Request \`${reqId}\` ${isAccept?"accepted":"rejected"} by admin.`).catch(()=>{});
              }
              await interaction.message.edit({ content: `${isAccept?"✅":"❌"} \`${reqId}\` ${isAccept?"accepted":"rejected"} by ${interaction.user.tag}`, components:[] }).catch(()=>{});
            } catch(e) { console.error("[Button]", e.message); }
            return;
          }
        }

        // ── Slash Commands ───────────────────────────────────────
        if (!interaction.isChatInputCommand()) return;
        const command = client.commands?.get(interaction.commandName);
        if (!command) return;
        if (command.adminOnly && !config.bot.admins?.includes(interaction.user.id)) return sendV2(interaction, "❌ Admin only.");
        if (command.ownerOnly && interaction.user.id !== config.bot.ownerId) return sendV2(interaction, "❌ Owner only.");
        if (command.userPermissions) {
          const missing = command.userPermissions.filter(p => !interaction.member?.permissions?.has(p));
          if (missing.length) return sendV2(interaction, `❌ Missing: \`${missing.join(", ")}\``);
        }
        if (!client.cooldowns) client.cooldowns = new Map();
        const now = Date.now(), key = `${interaction.user.id}_${command.data?.name}`, cd = (command.cooldown||3)*1000;
        if (client.cooldowns.has(key)) {
          const exp = client.cooldowns.get(key) + cd;
          if (now < exp) return sendV2(interaction, `⏳ Wait ${((exp-now)/1000).toFixed(1)}s`);
        }
        client.cooldowns.set(key, now);
        setTimeout(() => client.cooldowns.delete(key), cd);
        await command.execute(interaction, client);
      } catch(error) {
        console.error(chalk.red('interactionCreate error:'), error.message);
        logError(error);
        try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content:"❌ Error running command.", ephemeral:true }); } catch(e) {}
      }
    }
  };
  