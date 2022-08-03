const AWS = require('aws-sdk');

const { dynamodb, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions, getParkAccess } = require('../permissionUtil');
const { logger } = require('../logger');
const { processReservationObjects, getFutureReservationObjects } = require('../reservationObjUtils');

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
        if (
          bookingTimes[bookingTime].max !== oldCapacity
        ) {
          if (bookingTimes[bookingTime].max < 0) {
            throw 'You can not set a negative booking time.';
          }
          // Doesn't exist / needs to be updated
          timesToUpdate.push({
            time: bookingTime,
            newCapacity: bookingTimes[bookingTime].max,
            passDiff: bookingTimes[bookingTime].max - oldCapacity
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
        };
      };
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

async function setFacilityLock(pk, sk) {
  const facilityLockObject = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: pk },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ':isUpdating': AWS.DynamoDB.Converter.input(true),
      ':false': AWS.DynamoDB.Converter.input(false)
    },
    UpdateExpression: 'SET isUpdating = :isUpdating',
    ConditionExpression: 'isUpdating = :false',
    ReturnValues: 'ALL_NEW'
  };
  try {
    const { Attributes } = await dynamodb.updateItem(facilityLockObject).promise();
    return AWS.DynamoDB.Converter.unmarshall(Attributes);
  } catch (error) {
    logger.error('Error in setFacilityLock', facilityLockObject);
    logger.error(error);
    throw {
      msg: 'This item is being updated by someone else. Please try again later.',
      title: 'Sorry, we are unable to fill your specific request.'
    };
  }
}

async function getFutureReservationObjects(parkName, facilityName) {
  let futureResObjects = [];
  const todaysShortDate = DateTime.now().setZone(TIMEZONE).toISODate();
  const reservationsObjectQuery = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
      // TODO: change this to use orcs
      ':pk': { S: `reservations::${parkName}::${facilityName}` },
      ':date': { S: todaysShortDate }
    },
    KeyConditionExpression: 'pk = :pk AND sk >= :date'
  };
  try {
    futureResObjects = await runQuery(reservationsObjectQuery);
  } catch (error) {
    logger.error('Error in getFutureReservationObjects', reservationsObjectQuery);
    logger.error(error);
    throw { msg: 'Something went wrong.', title: 'Operation Failed' };
  }
  return futureResObjects;
}

async function processReservationObjects(resObjs, timesToUpdate, timesToRemove) {
  for (let i = 0; i < resObjs.length; i++) {
    let resObj = resObjs[i];
    for (let k = 0; k < timesToRemove.length; k++) {
      const timeToRemove = timesToRemove[k];
      try {
        // send all passes to overbooked
        await updatePassObjectsAsOverbooked(
          resObj.pk.split('::').pop(),
          resObj.sk,
          timeToRemove.time,
          resObj.capacities[timeToRemove.time]?.baseCapacity + resObj.capacities[timeToRemove.time]?.capacityModifier
        );
      } catch (error) {
        logger.error('Error removing passes in updatePassObjectsOverbooked():', error);
      }
      try {
        // update future removed booking times to 0 capacity, 0 availability
        await updateReservationsObjectCapacity(
          resObj.pk,
          resObj.sk,
          timeToRemove.time,
          0,
          0
        );
      } catch (error) {
        logger.error('Error removing passes in updatereservationObjectCapacity():', error);
        throw error;
      }
    }
    for (let j = 0; j < timesToUpdate.length; j++) {
      const timeToUpdate = timesToUpdate[j];
      const oldResAvailability = resObj.capacities[timeToUpdate.time]?.availablePasses ?? 0;

      let newBaseCapacity = timeToUpdate.newCapacity;
      let passDiff = timeToUpdate.passDiff;
      let newResAvailability = oldResAvailability + passDiff;

      // If newResAvailability is negative, then we have overbooked passes.
      if (newResAvailability < 0) {
        try {
          // If we detect there's going to be an overflow, grab all overflow passes.
          newResAvailability = await updatePassObjectsAsOverbooked(
            resObj.pk.split('::').pop(),
            resObj.sk,
            timeToUpdate.time,
            newResAvailability * -1
          );
        } catch (error) {
          logger.error('Error occured while executing updatePassObjectsAsOverbooked()');
          throw error;
        }
      } else {
        // If we are increasing capacity, we need to pull overbooked passes.
        let overbookedPasses = [];
        try {
          if (resObj.capacities[timeToUpdate.time]) {
            overbookedPasses = await checkForOverbookedPasses(resObj.pk.split('::').pop(), resObj.sk, timeToUpdate.time);
          }
        } catch (error) {
          logger.error('Error occured while executing checkForOverbookedPasses()');
          throw error;
        }
        if (overbookedPasses.length > 0) {
          try {
            const restoredPassQuantity = await reverseOverbookedPasses(overbookedPasses, newResAvailability);
            newResAvailability -= restoredPassQuantity;
          } catch (error) {
            logger.error('Error occured while executing reverseOverbookedPasses()');
            throw error;
          }
        }
      }
      try {
        await updateReservationsObjectCapacity(
          resObj.pk,
          resObj.sk,
          timeToUpdate.time,
          newBaseCapacity,
          newResAvailability
        );
      } catch (error) {
        logger.error('Error occured while executing updateReservationsObjectCapacity()', error);
        throw error;
      }
    }
  }
}

async function updateReservationsObjectCapacity(pk, sk, type, newBaseCapacity, newResAvailability) {
  // TODO: update this to include modifiers when ready
  const mapType = AWS.DynamoDB.Converter.marshall({
    capacityModifier: 0,
    baseCapacity: newBaseCapacity,
    availablePasses: newResAvailability
  });
  const updateReservationsObject = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: pk },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ':type': { M: mapType }
    },
    ExpressionAttributeNames: {
      '#type': type,
    },
    UpdateExpression:
      'SET capacities.#type = :type'
  };
  logger.debug('updateReservationsObject:', updateReservationsObject);
  const res = await dynamodb.updateItem(updateReservationsObject).promise();
  logger.debug('Reservation object updated:' + res);
  return;
}

async function checkForOverbookedPasses(facilityName, shortPassDate, type) {
  const passesQuery = {
    TableName: TABLE_NAME,
    IndexName: 'shortPassDate-index',
    ExpressionAttributeValues: {
      ':shortPassDate': { S: shortPassDate },
      ':facilityName': { S: facilityName },
      ':passType': { S: type },
      ':isOverbooked': { BOOL: true },
      ':reservedStatus': { S: 'reserved' },
      ':activeStatus': { S: 'active' }
    },
    ExpressionAttributeNames: {
      '#theType': 'type'
    },
    KeyConditionExpression: 'shortPassDate =:shortPassDate AND facilityName =:facilityName',
    FilterExpression: '#theType =:passType AND isOverbooked =:isOverbooked AND passStatus IN (:reservedStatus, :activeStatus)'
  };
  let passes = [];
  try {
    passes = await runQuery(passesQuery);
    passes.sort((a, b) => new Date(a.creationDate) - new Date(b.creationDate));
  } catch (error) {
    logger.error('Error occured while getting overbooked passes in reverseOverbookedPasses');
    logger.error(passesQuery);
    logger.error(error);
    throw { msg: 'Something went wrong.', title: 'Operation Failed' };
  }
  return passes;
}

async function reverseOverbookedPasses(passes, passDiff) {
  // Figure out which passes we want to reverse
  let passTally = 0;
  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    if (passTally + pass.numberOfGuests > passDiff) {
      break;
    }
    passTally += pass.numberOfGuests;

    // Reverse the pass
    const updatePassObject = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: pass.pk },
        sk: { S: pass.sk }
      },
      ExpressionAttributeValues: {
        ':isOverbooked': AWS.DynamoDB.Converter.input(false)
      },
      UpdateExpression: 'SET isOverbooked = :isOverbooked',
      ReturnValues: 'ALL_NEW'
    };
    try {
      const res = await dynamodb.updateItem(updatePassObject).promise();
      logger.debug('Reversed pass overbooked status', res);
    } catch (error) {
      logger.error('Error occured while updating pass in reverseOverbookedPasses');
      logger.error(updatePassObject);
      throw { msg: 'Something went wrong.', title: 'Operation Failed' };
    }
  }
  return passTally;
}

async function updatePassObjectsAsOverbooked(facilityName, shortPassDate, type, numberOfPassesOverbooked) {
  const passesQuery = {
    TableName: TABLE_NAME,
    IndexName: 'shortPassDate-index',
    ExpressionAttributeValues: {
      ':shortPassDate': { S: shortPassDate },
      ':facilityName': { S: facilityName },
      ':passType': { S: type },
      ':false': { BOOL: false }
    },
    ExpressionAttributeNames: {
      '#theType': 'type'
    },
    KeyConditionExpression: 'shortPassDate =:shortPassDate AND facilityName =:facilityName',
    FilterExpression: '#theType =:passType AND isOverbooked =:false'
  };
  let passes;
  try {
    passes = await runQuery(passesQuery);
    passes.sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));
  } catch (error) {
    logger.error('Error occured while getting overbooked passes in updatePassObjectsAsOverbooked');
    logger.error(passesQuery);
    logger.error(error);
    throw { msg: 'Something went wrong.', title: 'Operation Failed' };
  }

  const overbookObj = await getOverbookedPassSet(passes, numberOfPassesOverbooked);
  const overbookedPasses = overbookObj.overbookedPasses;
  logger.debug('Overbooked passes:', overbookedPasses);

  for (let i = 0; i < overbookedPasses.length; i++) {
    const pass = overbookedPasses[i];
    const updatePassObject = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: pass.pk },
        sk: { S: pass.sk }
      },
      ExpressionAttributeValues: {
        ':isOverbooked': AWS.DynamoDB.Converter.input(true)
      },
      UpdateExpression: 'SET isOverbooked = :isOverbooked',
      ReturnValues: 'ALL_NEW'
    };
    try {
      const res = await dynamodb.updateItem(updatePassObject).promise();
      logger.debug('Pass set to overbooked', res);
    } catch (error) {
      logger.error('Error occured while updating pass in updatePassObjectsAsOverbooked');
      logger.error(updatePassObject);
      throw { msg: 'Something went wrong.', title: 'Operation Failed' };
    }
  }
  // Return remainder.
  // We might not get a perfect number of passes due to group so this number could be > 0
  return overbookObj.remainder;
}

async function unlockFacility(pk, sk) {
  try {
    const facilityLockObject = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: pk },
        sk: { S: sk }
      },
      ExpressionAttributeValues: {
        ':isUpdating': AWS.DynamoDB.Converter.input(false)
      },
      UpdateExpression: 'SET isUpdating = :isUpdating',
      ReturnValues: 'ALL_NEW'
    };
    await dynamodb.updateItem(facilityLockObject).promise();
  } catch (error) {
    logger.error(error);
    // TODO: Retry this until we can unlock facility.
    return sendResponse(400, {
      msg: 'Failed to unlock facility. Please alert a developer as soon as possible.',
      title: 'Sorry, we are unable to fill your specific request.'
    });
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
