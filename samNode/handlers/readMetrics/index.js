const { DateTime } = require('luxon');
const { METRICS_TABLE_NAME, runQuery, logger, sendResponse } = require("/opt/baseLayer");
const { decodeJWT, resolvePermissions } = require("/opt/permissionLayer");

exports.handler = async (event, context) => {
  if (!event || !event.headers) {
    logger.info('Unauthorized');
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (event?.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, context);
  }
  logger.debug('Fetching metrics for selected date range');

  // 1. Get the relevant metrics information from the queryparameters

  try {
    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);

    if (permissionObject.isAuthenticated !== true) {
      logger.info('Unauthorized');
      return sendResponse(403, { msg: 'Unauthorized' }, context);
    }

    if (!event.queryStringParameters ||
      !event.queryStringParameters.park ||
      !event.queryStringParameters.facility ||
      !event.queryStringParameters.startDate) {
      logger.info('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request: Missing query parameters.' });
    }

    const park = event.queryStringParameters.park
    const facility = event.queryStringParameters.facility
    const startDate = event.queryStringParameters.startDate
    const endDate = event.queryStringParameters.endDate || startDate;

    // check if user has correct role
    if (!permissionObject.isAdmin && permissionObject.roles.indexOf(park) === -1) {
      logger.info('Unauthorized - user does not have the specific park role.');
      return sendResponse(403, { msg: 'Unauthorized - user does not have the specific park role.' });
    }

    // vali-date (haha get it?)
    try {
      if (!DateTime.fromISO(startDate).isValid) {
        throw `Start date (${startDate}) is invalid.`;
      }
      if (!DateTime.fromISO(endDate).isValid) {
        throw `End date (${endDate}) is invalid.`;
      }
      if (startDate > endDate) {
        throw `End date (${endDate}) must be greater than or equal to the start date (${startDate})`;
      }
    } catch (error) {
      logger.info('Invalid dates.');
      return sendResponse(400, { msg: 'Invalid or malformed dates.', title: 'Invalid dates', error: error });
    }

    // 2. Query DB for metrics for the park/facility within the date range.
    const metricsQueryObj = {
      TableName: METRICS_TABLE_NAME,
      KeyConditionExpression: `pk = :pk AND sk BETWEEN :startDate AND :endDate`,
      ExpressionAttributeValues: {
        ':pk': { S: `metrics::${park}::${facility}` },
        ':startDate': { S: startDate },
        ':endDate': { S: endDate },
      }
    }

    const res = await runQuery(metricsQueryObj);
    return sendResponse(200, res);

  } catch (error) {
    logger.error(error);
    return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation failed.', error: error })
  }

}
