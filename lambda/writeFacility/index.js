const AWS = require('aws-sdk');

const { dynamodb, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions, getParkAccess } = require('../permissionUtil');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  if (!event || !event.headers) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (!(event.httpMethod === 'POST' || event.httpMethod === 'PUT')) {
    return sendResponse(405, { msg: 'Not Implemented' }, context);
  }

  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  if (permissionObject.isAuthenticated !== true) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  try {
    logger.debug(event.body);
    const obj = JSON.parse(event.body);

    try {
      await getParkAccess(obj.parkName, permissionObject);
    } catch (error) {
      logger.error("ERR:", error);
      return sendResponse(403, { msg: error.msg });
    }

    // If this is a PUT operation ensure to protect against creating a new item instead of updating the old one.
    if (event.httpMethod === 'PUT') {
      return await updateFacility(obj);
    } else {
      // Only let admins create facilities
      if (permissionObject.isAdmin) {
        return await createFacility(obj);
      } else {
        throw "Unauthorized Access.";
      }
    }
  } catch (err) {
    logger.error('err', err);
    return sendResponse(400, err, context);
  }
};

async function createFacility(obj) {
  let {
    parkName,
    bookingTimes,
    name,
    status,
    type,
    visible,
    mode,
    stateReason,
    bookingOpeningHour,
    bookingDaysAhead,
    ...otherProps
  } = obj;

  const bookingOpeningHourAttrValue = {};
  const bookingDaysAheadAttrValue = {};

  if (bookingOpeningHour || bookingOpeningHour === 0) {
    bookingOpeningHourAttrValue.N = bookingOpeningHour.toString();
  } else {
    bookingOpeningHourAttrValue.NULL = true;
  }
  if (bookingDaysAhead || bookingDaysAhead === 0) {
    bookingDaysAheadAttrValue.N = bookingDaysAhead.toString();
  } else {
    bookingDaysAheadAttrValue.NULL = true;
  }

  const facilityObj = {
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_not_exists(sk)',
    Item: {
      pk: { S: `facility::${parkName}` },
      sk: { S: name },
      bookingTimes: { M: AWS.DynamoDB.Converter.marshall(bookingTimes) },
      name: { S: name },
      status: { M: AWS.DynamoDB.Converter.marshall(status) },
      type: { S: type },
      visible: { BOOL: visible },
      reservations: { M: {} },
      bookingOpeningHour: bookingOpeningHourAttrValue,
      bookingDaysAhead: bookingDaysAheadAttrValue
    }
  };

  logger.debug('putting item:', facilityObj);
  const res = await dynamodb.putItem(facilityObj).promise();
  logger.debug('res:', res);
  return sendResponse(200, res);
}

async function updateFacility(obj) {
  let {
    sk,
    parkName,
    bookingTimes,
    name,
    status,
    type,
    visible,
    mode,
    stateReason,
    bookingOpeningHour,
    bookingDaysAhead,
    ...otherProps
  } = obj;

  const bookingOpeningHourAttrValue = {};
  const bookingDaysAheadAttrValue = {};

  if (bookingOpeningHour || bookingOpeningHour === 0) {
    bookingOpeningHourAttrValue.N = bookingOpeningHour.toString();
  } else {
    bookingOpeningHourAttrValue.NULL = true;
  }
  if (bookingDaysAhead || bookingDaysAhead === 0) {
    bookingDaysAheadAttrValue.N = bookingDaysAhead.toString();
  } else {
    bookingDaysAheadAttrValue.NULL = true;
  }

  let updateParams = {
    Key: {
      pk: { S: `facility::${parkName}` },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ':statusValue': { M: AWS.DynamoDB.Converter.marshall(status) },
      ':visibility': { BOOL: visible },
      ':bookingTimes': { M: AWS.DynamoDB.Converter.marshall(bookingTimes) },
      ':bookingOpeningHour': bookingOpeningHourAttrValue,
      ':bookingDaysAhead': bookingDaysAheadAttrValue
    },
    ExpressionAttributeNames: {
      '#facilityStatus': 'status',
      '#visibility': 'visible'
    },
    UpdateExpression:
      'SET #facilityStatus =:statusValue, bookingTimes =:bookingTimes, #visibility =:visibility, bookingOpeningHour = :bookingOpeningHour, bookingDaysAhead = :bookingDaysAhead',
    ReturnValues: 'ALL_NEW',
    TableName: TABLE_NAME
  };
  const res = await dynamodb.updateItem(updateParams).promise();
  return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(res.ExpressionAttributeNames));
}
