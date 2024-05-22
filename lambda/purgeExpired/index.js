const dynamoUtil = require('../dynamoUtil');
const jwt = require('jsonwebtoken');
const { logger } = require('../logger');

/**
 * Purges expired JWTs from the system.
 * @returns {Promise<void>} A promise that resolves when the purge process is complete.
 */
exports.handler = async (event, context) => {
  logger.info('Purging expired JWTs');
  const items = await dynamoUtil.getAllStoredJWTs(true);
  logger.info(`Going through ${items.length} expired items.`);

  for (const item of items) {
    logger.info('Processing item');
    try {
      logger.debug(item);
      const token = jwt.decode(item.sk);
      await dynamoUtil.restoreAvailablePass(item.pk,
                                            item.sk,
                                            token.parkOrcs,
                                            token.shortPassDate,
                                            token.facilityName,
                                            token.numberOfGuests,
                                            token.type);
    } catch (error) {
      logger.error('Error Deleting JWT:');
      logger.error(error);
    }
  }
};