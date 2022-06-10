const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

const LEVEL = process.env.LOG_LEVEL || 'info';

exports.logger = createLogger({
  level: LEVEL,
  format: combine(
    timestamp(),
    myFormat
  ),
  transports: [new transports.Console()]
});