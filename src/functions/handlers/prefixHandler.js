const { Collection } = require('discord.js');
  const fs = require('fs');
  const path = require('path');
  const chokidar = require('chokidar');
  const chalk = require('chalk');
  const errorsDir = path.join(__dirname, '../../../errors');

  function logErrorToFile(error) {
    try {
      if (!fs.existsSync(errorsDir)) fs.mkdirSync(errorsDir, { recursive: true });
      fs.writeFileSync(path.join(errorsDir, new Date().toISOString().replace(/:/g,'-')+'.txt'),
        `${error.name}: ${error.message}\n${error.stack}`, 'utf8');
    } catch(e) {}
  }

  function debounce(func, delay) {
    let id;
    return function(...args) { clearTimeout(id); id = setTimeout(() => func.apply(null, args), delay); };
  }

  function prefixHandler(client, prefixPath) {
    client.prefix = new Collection();
    const log = (msg, type='INFO') => {
      const c = { INFO:chalk.blue.bold('INFO:'), SUCCESS:chalk.green.bold('SUCCESS:'), ERROR:chalk.red.bold('ERROR:'), WARNING:chalk.yellow.bold('WARNING:') };
      console.log((c[type]||c.INFO) + ' ' + msg);
    };
    const loadCmd = (fp) => {
      try {
        delete require.cache[require.resolve(fp)];
        const cmd = require(fp);
        if (cmd.name) {
          client.prefix.set(cmd.name, cmd);
          if (cmd.aliases?.length) cmd.aliases.forEach(a => client.prefix.set(a, cmd));
          log(`Loaded: ${chalk.green(cmd.name)}`, 'SUCCESS');
        } else { log(`Missing name in ${path.basename(fp)}`, 'WARNING'); }
      } catch(e) { log(`Failed: ${path.basename(fp)}`, 'ERROR'); logErrorToFile(e); }
    };
    const unloadCmd = (fp) => {
      try {
        delete require.cache[require.resolve(fp)];
        const name = path.basename(fp, '.js');
        if (client.prefix.has(name)) client.prefix.delete(name);
      } catch(e) {}
    };
    const loadAll = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const item of fs.readdirSync(dir)) {
        const fp = path.join(dir, item);
        if (fs.statSync(fp).isDirectory()) loadAll(fp);
        else if (item.endsWith('.js')) loadCmd(fp);
      }
    };
    loadAll(prefixPath);
    try {
      const watcher = chokidar.watch(prefixPath, { persistent:true, ignoreInitial:true, awaitWriteFinish:true });
      const dLoad = debounce(loadCmd, 500), dUnload = debounce(unloadCmd, 500);
      watcher
        .on('add', fp => { if (fp.endsWith('.js')) dLoad(fp); })
        .on('change', fp => { if (fp.endsWith('.js')) { dUnload(fp); dLoad(fp); } })
        .on('unlink', fp => { if (fp.endsWith('.js')) dUnload(fp); })
        .on('error', e => log(`Watcher error: ${e.message}`, 'ERROR'));
    } catch(e) { log(`Watcher skipped: ${e.message}`, 'WARNING'); }
  }
  module.exports = { prefixHandler };
  