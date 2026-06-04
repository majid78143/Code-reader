// src/functions/web/loggers.js

const chalk = require("chalk");

function sendWebLog(message) {
  console.log(chalk.blue("[WEB]"), message);
}

function sendRequestLog(message) {
  console.log(chalk.green("[REQ]"), message);
}

function sendErrorLog(message) {
  console.log(chalk.red("[ERROR]"), message);
}

module.exports = {
  sendWebLog,
  sendRequestLog,
  sendErrorLog
};
