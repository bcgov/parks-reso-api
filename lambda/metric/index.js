const AWS = require('aws-sdk');
const { runScan, TABLE_NAME } = require('../dynamoUtil');
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
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }

    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);
    if (permissionObject.isAdmin !== true) {
      return sendResponse(403, { msg: 'Unauthorized' });
    }

    if (event.queryStringParameters.type == 'passTotals') {
      // Get all the passes for a specific facility
     
      const cancelled = await getPassNumbers(queryObj, 'cancelled');
      logger.debug("cancelled:", cancelled.length)
      const active = await getPassNumbers(queryObj, 'active');
      logger.debug("active:", active.length)
      const reserved = await getPassNumbers(queryObj, 'reserved');
      logger.debug("reserved:", reserved.length)
      const expired = await getPassNumbers(queryObj, 'expired');
      logger.debug("expired:", expired.length)

      return sendResponse(200, {
        cancelled: cancelled.length,
        active: active.length,
        reserved: reserved.length,
        expired: expired.length,
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

async function getPassNumbers(queryObj, status) {
  queryObj.ExpressionAttributeValues = {};
  queryObj.ExpressionAttributeValues[':ending'] = { S: 'pass::' };
  queryObj.ExpressionAttributeValues[':passStatus'] = { S: status };
  queryObj.FilterExpression = 'begins_with(pk, :ending) and passStatus=:passStatus';

  logger.debug('queryObj:', queryObj);
  let scanResults = [];
  do {
    passData = await runScan(queryObj, true);
    passData.data.forEach((item) => scanResults.push(item));
    queryObj.ExclusiveStartKey  = passData.LastEvaluatedKey;
  } while(typeof passData.LastEvaluatedKey !== "undefined");

  return scanResults;
}