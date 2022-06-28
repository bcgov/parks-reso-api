const { runQuery, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { decodeJWT, resolvePermissions, getParkAccess } = require('../permissionUtil');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.debug('Read Facility', event);
  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  let queryObj = {
    TableName: TABLE_NAME
  };

  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }

    if (event.queryStringParameters.facilities && event.queryStringParameters.park) {
      logger.debug('Grab facilities for this park');
      // Grab facilities for this park.
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + event.queryStringParameters.park };
      queryObj.KeyConditionExpression = 'pk =:pk';

      if (permissionObject.isAdmin) {
        // Get get everything
        logger.debug("**Sysadmin**")
      } else if (permissionObject.isAuthenticated) {
        logger.debug("**Some other authenticated person with parking-pass roles**")
        try {
          await getParkAccess(event.queryStringParameters.park, permissionObject);
        } catch (error) {
          logger.error("ERR:", error);
          return sendResponse(403, { msg: error.msg });
        }
      }

      if (await parkVisible(event.queryStringParameters.park, permissionObject.isAuthenticated)) {
        queryObj = visibleFilter(queryObj, permissionObject.isAuthenticated);
        const facilityData = await runQuery(queryObj);
        return sendResponse(200, facilityData, context);
      } else {
        return sendResponse(400, { msg: 'Invalid Request' }, context);
      }
    } else if (event.queryStringParameters.facilityName && event.queryStringParameters.park) {
      logger.debug('Get the specific Facility');
      // Get the specific Facility
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + event.queryStringParameters.park };
      queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.facilityName };
      queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';

      if (permissionObject.isAdmin) {
        // Get get everything
        logger.debug("**Sysadmin**")
      } else if (permissionObject.isAuthenticated) {
        logger.debug("**Some other authenticated person with parking-pass roles**")
        try {
          await getParkAccess(event.queryStringParameters.park, permissionObject);
        } catch (error) {
          logger.error("ERR:", error);
          return sendResponse(403, { msg: error.msg });
        }
      }

      if (await parkVisible(event.queryStringParameters.park, permissionObject.isAuthenticated)) {
        queryObj = visibleFilter(queryObj, permissionObject.isAuthenticated);
        const facilityData = await runQuery(queryObj);
        return sendResponse(200, facilityData, context);
      } else {
        return sendResponse(400, { msg: 'Invalid Request' }, context);
      }
    } else {
      logger.debug('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    logger.error(err);
    return sendResponse(400, err, context);
  }
};

const parkVisible = async function (park, isAdmin) {
  logger.debug(park, isAdmin);
  if (isAdmin) {
    return true;
  } else {
    let queryObj = {
      TableName: TABLE_NAME,
      ExpressionAttributeValues: {}
    };
    queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
    queryObj.ExpressionAttributeValues[':sk'] = { S: park };
    queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    logger.debug('queryObj', queryObj);
    const parkData = await runQuery(queryObj);
    logger.debug('ParkData:', parkData);
    if (parkData.length > 0) {
      return parkData[0].visible;
    } else {
      return false;
    }
  }
};

const visibleFilter = function (queryObj, isAdmin) {
  logger.debug('visibleFilter:', queryObj, isAdmin);
  if (!isAdmin) {
    queryObj.ExpressionAttributeValues[':visible'] = { BOOL: true };
    queryObj.FilterExpression = 'visible =:visible';
  }
  return queryObj;
};
