const axios = require('axios');
  const config = require('../../../config.json');
  const chalk = require('chalk');
  const fs = require('fs');
  const path = require('path');

  function antiCrash() {
    const webhookURL = config.logging?.errorLogs || null;
    const errorsDir = path.join(__dirname, '../../../errors');
    function ensureDir() { if (!fs.existsSync(errorsDir)) fs.mkdirSync(errorsDir, { recursive: true }); }
    function logFile(msg) {
      try { ensureDir(); fs.writeFileSync(path.join(errorsDir, new Date().toISOString().replace(/:/g,'-')+'.txt'), msg, 'utf8'); } catch(e) {}
    }
    async function sendWebhook(msg) {
      if (!webhookURL || webhookURL.startsWith("YOUR_")) return;
      try { await axios.post(webhookURL, { embeds:[{ title:"⚠️ Bot Error", description: msg.slice(0,4000), color:0xff0000, timestamp: new Date().toISOString() }] }, { timeout:5000 }); } catch(e) {}
    }
    process.on('unhandledRejection', async (reason) => {
      const msg = reason instanceof Error ? `Unhandled Rejection: ${reason.message}\n${reason.stack}` : `Unhandled Rejection: ${String(reason)}`;
      console.error(chalk.red.bold('❌ ANTI-CRASH:'), msg.slice(0,200));
      logFile(msg); await sendWebhook(msg);
    });
    process.on('uncaughtException', async (error) => {
      const msg = `Uncaught Exception: ${error.message}\n${error.stack||''}`;
      console.error(chalk.red.bold('❌ ANTI-CRASH:'), msg.slice(0,200));
      logFile(msg); await sendWebhook(msg);
      if (error.message?.includes("Used disallowed intents")) process.exit(1);
    });
    console.log(chalk.green('✅ Anti-crash handler active'));
  }
  module.exports = { antiCrash };
  