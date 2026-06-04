const { 
  SlashCommandBuilder, 
  ContainerBuilder, 
  TextDisplayBuilder, 
  MessageFlags 
} = require('discord.js');
const config = require('../../../config.json');

// ---------------- V2 RESPONSE ----------------
function createV2(message) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(message)
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete multiple messages in a channel.')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (default 10)')
        .setMinValue(1)
        .setMaxValue(100)
    ),

  async execute(interaction) {
    const { member, channel } = interaction;
    const amount = interaction.options.getInteger('amount') || 10;

    // Only allow owner from config.json
    if (member.id !== config.bot.ownerId) {
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [createV2('❌ Only the bot owner can use this command.')],
        ephemeral: true,
      });
    }

    try {
      const deleted = await channel.bulkDelete(amount, true);
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [createV2(`✅ Deleted ${deleted.size} message(s).`)],
        ephemeral: true,
      });
    } catch (err) {
      console.error(err);
      return interaction.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [createV2('❌ Failed to delete messages. Messages older than 14 days cannot be deleted.')],
        ephemeral: true,
      });
    }
  }
};