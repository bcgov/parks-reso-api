const AWS = require('aws-sdk');
const { getPassesByStatus, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions } = require('../permissionUtil');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.debug('Metric', event);
  logger.debug('event.queryStringParameters', event.queryStringParameters);

  let queryObj = {
    TableName: TABLE_NAME
  };

  try {
    if (!event.queryStringParameters) {
      logger.info("Invalid Request");
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }

    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);
    if (permissionObject.isAdmin !== true) {
      logger.info("Unauthorized");
      return sendResponse(403, { msg: 'Unauthorized' });
    }

    if (event.queryStringParameters.type == 'passTotals') {
      // Get all the passes for a specific facility

      const cancelled = await getPassesByStatus('cancelled');
      logger.info("cancelled:", cancelled.length)

      const active = await getPassesByStatus('active');
      logger.info("active:", active.length)

      const reserved = await getPassesByStatus('reserved');
      logger.info("reserved:", reserved.length)

      const expired = await getPassesByStatus('expired');
      logger.info("expired:", expired.length)

      return sendResponse(200, {
        cancelled: cancelled.length,
        active: active.length,
        reserved: reserved.length,
        expired: expired.length
      });
    } else {
      logger.error('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    logger.error(err);
    return sendResponse(400, err, context);
  }
};
