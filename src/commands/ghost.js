const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

const REGION_ENDPOINTS = {
  BR: 'http://r1.ultigerios.qzz.io:2027/execute_command_all',
  IND: 'http://r1.ultigerios.qzz.io:2027/execute_command_all',
  BD: 'http://r3.ultigerios.qzz.io:2084/execute_command_all',
  ME: 'http://r1.ultigerios.qzz.io:2027/execute_command_all',
  EU: 'http://r3.ultigerios.qzz.io:2019/execute_command_all'
};

const GIF = 'https://cdn.discordapp.com/attachments/1439444873324396595/1446747060941488320/giphy.gif';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ghost')
    .setDescription('Send GHOST request (1–4 players)')
    .addStringOption(o =>
      o.setName('region')
        .setDescription('Server region')
        .setRequired(true)
        .addChoices(
          { name: 'BR', value: 'BR' },
          { name: 'IND', value: 'IND' },
          { name: 'BD', value: 'BD' },
          { name: 'ME', value: 'ME' },
          { name: 'EU', value: 'EU' }
        )
    )
    .addStringOption(o =>
      o.setName('teamcode')
        .setDescription('Team Code')
        .setRequired(true)
    )
    .addStringOption(o => o.setName('name1').setDescription('Player 1').setRequired(true))
    .addStringOption(o => o.setName('name2').setDescription('Player 2'))
    .addStringOption(o => o.setName('name3').setDescription('Player 3'))
    .addStringOption(o => o.setName('name4').setDescription('Player 4')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    try {
      const region = interaction.options.getString('region');
      const teamCode = interaction.options.getString('teamcode');

      // Collect names and filter out null/empty
      const namesArray = [
        interaction.options.getString('name1'),
        interaction.options.getString('name2'),
        interaction.options.getString('name3'),
        interaction.options.getString('name4')
      ].filter(Boolean);

      const endpoint = REGION_ENDPOINTS[region];
      if (!endpoint) throw new Error('Invalid region selected');

      // Build API URL
      const apiUrl = `${endpoint}?command=/wotx=${teamCode}&names=${namesArray.join(',')}`;

      const response = await axios.get(apiUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      if (response.status !== 200) throw new Error('API responded with non-200 status');

      // V2 ContainerBuilder response
      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
`👻 **GHOST REQUEST SENT SUCCESSFULLY**

**User:** ${interaction.user}
**Region:** ${region}
**Players:** ${namesArray.join(', ')}
**Team Code:** ${teamCode}

_Dev Rebel_`
          )
        );

      await interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      });

    } catch (err) {
      console.error('GHOST COMMAND ERROR:', err.message);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
`❌ **GHOST REQUEST FAILED**

⚠️ Error: ${err.message}

_Dev Rebel_`
          )
        );

      await interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      });
    }
  }
};