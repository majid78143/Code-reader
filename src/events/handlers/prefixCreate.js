const chalk = require("chalk");
const config = require('../../../config.json');
const { 
    ContainerBuilder, 
    TextDisplayBuilder, 
    MessageFlags 
} = require('discord.js');
const { getSimilarCommands } = require('../../functions/handlers/similarity');
const path = require('path');
const fs = require('fs');

const errorsDir = path.resolve(__dirname, '../../../errors');

function ensureErrorDirectoryExists() {
    if (!fs.existsSync(errorsDir)) fs.mkdirSync(errorsDir);
}

function logErrorToFile(error) {
    ensureErrorDirectoryExists();
    const errorMessage = `${error.name}: ${error.message}\n${error.stack}`;
    const fileName = `${new Date().toISOString().replace(/:/g, '-')}.txt`;
    const filePath = path.join(errorsDir, fileName);
    fs.writeFileSync(filePath, errorMessage, 'utf8');
}

// Utility function for V2 responses
async function sendV2(message, content) {
    try {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        await message.reply({ flags: MessageFlags.IsComponentsV2, components: [container] });
    } catch (err) {
        console.warn("Failed to send V2 response:", err.message);
    }
}

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        try {
            const prefix = config.prefix.value;
            const content = message.content.toLowerCase();
            if (!prefix || !content.startsWith(prefix) || message.author.bot) return;

            const args = content.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            let command = client.prefix?.get(commandName);
            if (!command) {
                command = Array.from(client.prefix?.values() || []).find(
                    (cmd) => cmd.aliases && cmd.aliases.includes(commandName)
                );
            }

            if (!command) {
                console.log(chalk.yellow.bold('WARNING: ') + `Unknown command: "${commandName}"`);
                const similarCommands = getSimilarCommands(commandName, Array.from(client.prefix?.values() || []));
                if (similarCommands.length > 0) {
                    return sendV2(message, `🤔 | Command not found. Did you mean: ${similarCommands.join(', ')}?`);
                } else {
                    return;
                }
            }

            // Developer-only commands
            if (command.devOnly && !config.bot.developerCommandsServerIds.includes(message.guild?.id)) return;

            // Cooldowns
            if (!client.cooldowns) client.cooldowns = new Map();
            const now = Date.now();
            const cooldownAmount = (command.cooldown || 3) * 1000;
            if (!client.cooldowns.has(command.name)) client.cooldowns.set(command.name, new Map());
            const timestamps = client.cooldowns.get(command.name);

            if (timestamps.has(message.author.id)) {
                const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
                if (now < expirationTime) {
                    const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
                    return sendV2(message, `❌ | Please wait **${timeLeft}** more second(s) before reusing the \`${command.name}\` command.`);
                }
            }
            timestamps.set(message.author.id, now);

            // Admin-only
            if (command.adminOnly && !config.bot.admins.includes(message.author.id)) {
                return sendV2(message, "❌ | This command is admin-only. You cannot run this command.");
            }

            // Owner-only
            if (command.ownerOnly && message.author.id !== config.bot.ownerId) {
                return sendV2(message, "❌ | This command is owner-only. You cannot run this command.");
            }

            // User permissions
            if (command.userPermissions && message.member) {
                const missingPermissions = command.userPermissions.filter(perm => !message.member.permissions.has(perm));
                if (missingPermissions.length > 0) {
                    return sendV2(message, `❌ | You lack the necessary permissions: \`\`\`${missingPermissions.join(", ")}\`\`\``);
                }
            }

            // Bot permissions
            if (command.botPermissions && message.guild) {
                const botMember = message.guild.members.me;
                const missingBotPermissions = command.botPermissions.filter(perm => !botMember.permissions.has(perm));
                if (missingBotPermissions.length > 0) {
                    return sendV2(message, `❌ | I lack the necessary permissions: \`\`\`${missingBotPermissions.join(", ")}\`\`\``);
                }
            }

            // Execute command
            await message.channel.sendTyping();
            await command.run(client, message, args);

            // Logging
            if (message.guild && config.logging.commandLogsChannelId) {
                const logsChannel = await client.channels.fetch(config.logging.commandLogsChannelId).catch(() => null);
                if (logsChannel) {
                    const logContainer = new ContainerBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
`📌 **Command Executed**
👤 **User:** ${message.author.tag} (${message.author.id})
💻 **Command:** ${prefix}${command.name}
🏰 **Server:** ${message.guild.name} (${message.guild.id})
🕒 **Timestamp:** ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
                            )
                        );
                    await logsChannel.send({ flags: MessageFlags.IsComponentsV2, components: [logContainer] });
                } else {
                    console.warn(chalk.yellow(`Logs channel with ID ${config.logging.commandLogsChannelId} not found.`));
                }
            }

        } catch (error) {
            console.log(chalk.red.bold('ERROR: ') + `Failed to execute command.`);
            console.error(error);
            logErrorToFile(error);
            return sendV2(message, "❌ | There was an error while executing this command!");
        }
    }
};