const { 
SlashCommandBuilder,
ContainerBuilder,
TextDisplayBuilder,
MessageFlags
} = require("discord.js");

const { refreshTokens, moveTokens } = require("../../../functions/other/tokenupdate");

module.exports = {

data: new SlashCommandBuilder()
.setName("gen")
.setDescription("Manually refresh and move Free Fire tokens.")
.addStringOption(option =>
option
.setName("type")
.setDescription("Select the target region")
.setRequired(true)
.addChoices(
{ name: "NX", value: "NX" },
{ name: "IND", value: "IND" },
{ name: "AG", value: "AG" }
)
),

ownerOnly: true,

async execute(interaction) {

const region = interaction.options.getString("type").toUpperCase();

// Start UI
const startContainer = new ContainerBuilder()
.addTextDisplayComponents(
new TextDisplayBuilder().setContent(
`⚡ **Generating tokens for ${region}...**`
)
);

await interaction.reply({
flags: MessageFlags.IsComponentsV2,
components: [startContainer]
});

// Refresh tokens
const refreshed = await refreshTokens(region);

if (refreshed === 0) {

const noRefresh = new ContainerBuilder()
.addTextDisplayComponents(
new TextDisplayBuilder().setContent(
`⚠️ No tokens were refreshed for **${region}**.`
)
);

return interaction.editReply({
flags: MessageFlags.IsComponentsV2,
components: [noRefresh]
});
}

// Move tokens
const moved = await moveTokens(region);

const resultContainer = new ContainerBuilder()
.addTextDisplayComponents(
new TextDisplayBuilder().setContent(
moved
? `✅ Tokens for **${region}** successfully moved to main.`
: `⚠️ Tokens refreshed, but none were moved to main.`
)
);

await interaction.editReply({
flags: MessageFlags.IsComponentsV2,
components: [resultContainer]
});

}
};