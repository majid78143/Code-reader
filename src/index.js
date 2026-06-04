const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
  const chalk = require("chalk");
  const fs = require("fs");
  const path = require("path");
  const config = require(path.join(__dirname, "../config.json"));

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions, GatewayIntentBits.DirectMessageTyping,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
  });
  module.exports.client = client;

  const { eventsHandler } = require("./functions/handlers/handelEvents");
  const { antiCrash } = require("./functions/handlers/antiCrash");
  const { checkMissingIntents } = require("./functions/handlers/requiredIntents");
  const { startAutoLikeScheduler } = require("./functions/other/automation");
  const { initFirebase } = require("./firebase");
  const { startFirebaseBridge } = require("./functions/web/firebaseBridge");
  const { setClient } = require("./functions/web/loggers");
  const { startExpressServer } = require("./functions/web/expressServer");

  let mentionHandler = null;
  try { mentionHandler = require("./messages/Other/mention"); } catch(e) {}

  global.AUTO_LIKE_STARTED = false;

  function logErrorToFile(error) {
    try {
      const d = path.join(__dirname, "errors");
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      fs.appendFileSync(path.join(d, "error-log.txt"),
        `[${new Date().toLocaleString()}] ${error.name}: ${error.message}\n${error.stack}\n\n`, "utf8");
    } catch(e) {}
  }

  antiCrash();
  try { require("./functions/handlers/watchFolders"); } catch(err) {
    console.warn(chalk.yellow("⚠️  watchFolders skipped:"), err.message);
  }

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    try { if (mentionHandler?.execute) await mentionHandler.execute(client, message); } catch(err) { logErrorToFile(err); }
  });

  client.once(Events.ClientReady, async () => {
    console.log(chalk.green.bold(`✅ Logged in as ${client.user.tag}`));
    setClient(client);
    try { checkMissingIntents(client); } catch(err) { logErrorToFile(err); }
    if (!global.AUTO_LIKE_STARTED) {
      try { startAutoLikeScheduler(client); global.AUTO_LIKE_STARTED = true; console.log(chalk.blue("⏰ AutoLike Scheduler Started")); }
      catch(err) { logErrorToFile(err); }
    }
    try { initFirebase(); await startFirebaseBridge(client); console.log(chalk.green("🔥 Firebase Bridge Started")); }
    catch(err) { console.error(chalk.red("❌ Firebase Bridge failed:"), err.message); logErrorToFile(err); }
    try { startExpressServer(client); console.log(chalk.green("🌐 Express Web Server Started")); }
    catch(err) { console.error(chalk.red("❌ Express failed:"), err.message); logErrorToFile(err); }
  });

  (async () => {
    try {
      await eventsHandler(client, path.join(__dirname, "events"));
      await client.login(config.bot.token);
      console.log(chalk.green("✅ Bot login initiated..."));
    } catch(err) {
      console.error(chalk.red("❌ Bot failed to start:"), err.message);
      logErrorToFile(err);
      process.exit(1);
    }
  })();
  
