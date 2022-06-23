const { createLogger, format, transports } = require('winston');
const { combine, timestamp } = format;

const LEVEL = process.env.LOG_LEVEL || 'error';

exports.logger = createLogger({
  level: LEVEL,
  format: combine(
    timestamp(),
    format.printf((info) => {
      let meta = ''
      let symbols = Object.getOwnPropertySymbols(info)
      if (symbols.length == 2) {
        meta = JSON.stringify(info[symbols[1]])

      }
      return `${info.timestamp} ${[info.level.toUpperCase()]}: ${info.message} ${meta}`;
    })
  ),
  transports: [new transports.Console()]
});