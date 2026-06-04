const config = require('../../../config.json');
  const mongoose = require('mongoose');
  const chalk = require('chalk');
  const path = require('path');
  const fs = require('fs');
  const { prefixHandler } = require('../../functions/handlers/prefixHandler');
  const { handleCommands } = require('../../functions/handlers/handleCommands');
  const errorsDir = path.join(__dirname, '../../../errors');
  let hasInitialized = false;

  function logError(error) {
    try {
      if (!fs.existsSync(errorsDir)) fs.mkdirSync(errorsDir, { recursive: true });
      fs.appendFileSync(path.join(errorsDir, 'error-log.txt'), `[${new Date().toLocaleString()}] ${error.name}: ${error.message}\n${error.stack}\n\n`, 'utf8');
    } catch(e) {}
  }

  module.exports = {
    name: 'ready', once: true,
    async execute(client) {
      if (hasInitialized) return; hasInitialized = true;
      console.log(`${chalk.green.bold('SUCCESS:')} ${client.user.tag} is online!`);
      if (config.database.mongodbUrl) {
        try {
          if (mongoose.connection.readyState === 0) {
            await mongoose.connect(config.database.mongodbUrl, { dbName:"kavach", serverSelectionTimeoutMS:30000 });
            console.log(chalk.green.bold('SUCCESS: Connected to MongoDB!'));
          }
        } catch(error) { console.log(chalk.red('❌ MongoDB failed (bot continues)')); logError(error); }
      } else { console.log(chalk.yellow('⚠️  No MongoDB URL — DB features disabled')); }
      try {
        prefixHandler(client, path.join(process.cwd(), 'src/messages'));
        await handleCommands(client, path.join(process.cwd(), 'src/commands'));
        console.log(chalk.green('✅ Handlers loaded'));
      } catch(error) { console.log(chalk.red('❌ Handler loading failed:'), error.message); logError(error); }
      try {
        const { startTokenManager } = require('../../functions/other/tokenupdate');
        await startTokenManager();
      } catch(err) { console.log(chalk.yellow('⚠️  Token manager skipped:'), err.message); }
    }
  };
  