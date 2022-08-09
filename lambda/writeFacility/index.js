const AWS = require('aws-sdk');

const { dynamodb, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions, getParkAccess } = require('../permissionUtil');
const { logger } = require('../logger');
const { processReservationObjects, getFutureReservationObjects } = require('../reservationObjUtils');
const { unlockFacility, setFacilityLock } = require('../facilityUtils');

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
      logger.error('ERR:', error);
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
        throw 'Unauthorized Access.';
      }
    }
  } catch (err) {
    logger.error('err', err);
    return sendResponse(400, err, context);
  }
};

async function createFacility(obj) {
  let { parkName, bookingTimes, name, status, type, visible, bookingOpeningHour, bookingDaysAhead, ...otherProps } =
    obj;

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
      isUpdating: { BOOL: false },
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
  let { sk, parkName, bookingTimes, name, status, type, visible, bookingOpeningHour, bookingDaysAhead, ...otherProps } =
    obj;

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

  try {
    // Conditional update on updating flag
    const currentFacility = await setFacilityLock(`facility::${parkName}`, sk);

    // Check if we are updating booking times
    if (!deepEqual(bookingTimes, currentFacility.bookingTimes)) {
      // We need to ensure that our future reservation objects are up to date
      let timesToUpdate = [];
      for (const bookingTime in bookingTimes) {
        const oldCapacity = currentFacility.bookingTimes[bookingTime]?.max ?? 0;
        if (bookingTimes[bookingTime].max !== oldCapacity) {
          if (bookingTimes[bookingTime].max < 0) {
            throw 'You can not set a negative booking time.';
          }
          // Doesn't exist / needs to be updated
          timesToUpdate.push({
            time: bookingTime,
            capacityToSet: bookingTimes[bookingTime].max
          });
        }
      }
      // Needs to be removed (closing a timeslot)
      let timesToRemove = [];
      for (const currentTime in currentFacility.bookingTimes) {
        if (!bookingTimes[currentTime]) {
          timesToRemove.push({
            time: currentTime
          });
        }
      }
      // Gather all future reservation objects
      let futureResObjects = [];
      if (timesToUpdate.length > 0 || timesToRemove.length > 0) {
        futureResObjects = await getFutureReservationObjects(parkName, name);
      }
      if (futureResObjects.length > 0 || timesToRemove.length > 0) {
        await processReservationObjects(futureResObjects, timesToUpdate, timesToRemove);
      }
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
        ':bookingDaysAhead': bookingDaysAheadAttrValue,
        ':isUpdating': { BOOL: false }
      },
      ExpressionAttributeNames: {
        '#facilityStatus': 'status',
        '#visibility': 'visible'
      },
      UpdateExpression:
        'SET #facilityStatus =:statusValue, bookingTimes =:bookingTimes, #visibility =:visibility, bookingOpeningHour = :bookingOpeningHour, bookingDaysAhead = :bookingDaysAhead, isUpdating = :isUpdating',
      ReturnValues: 'ALL_NEW',
      TableName: TABLE_NAME
    };
    const { Attributes } = await dynamodb.updateItem(updateParams).promise();
    return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(Attributes));
  } catch (error) {
    logger.error(JSON.stringify(error));
    await unlockFacility(`facility::${parkName}`, sk);
    return sendResponse(400, error);
  }
}

function deepEqual(object1, object2) {
  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (const key of keys1) {
    const val1 = object1[key];
    const val2 = object2[key];
    const areObjects = isObject(val1) && isObject(val2);
    if ((areObjects && !deepEqual(val1, val2)) || (!areObjects && val1 !== val2)) {
      return false;
    }
  }
  return true;
}
function isObject(object) {
  return object != null && typeof object === 'object';
}
