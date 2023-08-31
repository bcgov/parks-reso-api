const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.debug('Websocket disconnect event', event);
  return {
    statusCode: 200
  }
};