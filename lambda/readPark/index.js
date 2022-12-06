const AWS = require('aws-sdk');
const { runQuery, TABLE_NAME, visibleFilter } = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { decodeJWT, roleFilter, resolvePermissions } = require('../permissionUtil');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.info('Read Park', event);
  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  let queryObj = {
    TableName: TABLE_NAME
  };

  try {
    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);

    if (!event.queryStringParameters) {
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
      queryObj.KeyConditionExpression = 'pk =:pk';
    } else if (event.queryStringParameters.park) {
      // Get specific park.
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
      queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.park };
      queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    } else {
      logger.info('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }

    // Public
    if (!permissionObject.isAuthenticated) {
      logger.info("**NOT AUTHENTICATED, PUBLIC**")
      logger.debug(permissionObject.roles);
      queryObj = await visibleFilter(queryObj, permissionObject.isAdmin);
      const parksData = await runQuery(queryObj);
      logger.info('Returning results:', parksData.length);
      return sendResponse(200, parksData, context);
    }

    let parksData = await runQuery(queryObj);

    if (permissionObject.isAdmin) {
      // Sysadmin, they get it all
      logger.info("**Sysadmin**")
    } else {
      // Some other authenticated role
      logger.info("**Some other authenticated person with parking-pass roles**")
      logger.debug(permissionObject.roles)
      parksData = await roleFilter(parksData, permissionObject.roles);
      logger.debug(JSON.stringify(parksData));
    }
    logger.info("Returning results:", parksData.length);
    return sendResponse(200, parksData, context);
  } catch (err) {
    logger.error(err);
    return sendResponse(400, err, context);
  }
};
