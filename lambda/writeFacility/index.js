const AWS = require('aws-sdk');
const { DateTime } = require('luxon');

const { dynamodb, TABLE_NAME, TIMEZONE } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions } = require('../permissionUtil');
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
  if (permissionObject.isAdmin !== true) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  try {
    console.log(event.body);
    const obj = JSON.parse(event.body);

    // If this is a PUT operation ensure to protect against creating a new item instead of updating the old one.
    if (event.httpMethod === 'PUT') {
      return await updateFacility(obj);
    } else {
      return await createFacility(obj);
    }
  } catch (err) {
    console.log('err', err);
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
    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    Item: {
      pk: { S: `facility::${parkName}` },
      sk: { S: name },
      bookingTimes: { M: AWS.DynamoDB.Converter.marshall(bookingTimes) },
      name: { S: name },
      status: { M: AWS.DynamoDB.Converter.marshall(status) },
      type: { S: type },
      visible: { BOOL: visible },
      isUpdating: false,
      bookingOpeningHour: bookingOpeningHourAttrValue,
      bookingDaysAhead: bookingDaysAheadAttrValue
    }
  };

  console.log('putting item:', facilityObj);
  const res = await dynamodb.putItem(facilityObj).promise();
  console.log('res:', res);
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

  try {
    // Conditional update on updating flag
    const currentFacility = await setFacilityLock(`facility::${parkName}`, sk);

    // Check if we are updating booking times
    if (bookingTimes !== currentFacility.bookingTimes) {
      // We need to ensure that our future reservation objects are up to date
      let timesToUpdate = [];
      for (const bookingTime in bookingTimes) {
        if (
          !currentFacility.bookingTimes[bookingTime] ||
          bookingTimes[bookingTime] !== currentFacility.bookingTimes[bookingTime]
        ) {
          // Doesn't exist / needs to be updated
          timesToUpdate.push({
            time: bookingTime,
            capacityDiff: currentFacility.bookingTimes[bookingTime].max - bookingTimes[bookingTime].max
          });
        }
      }

      // Gather all future reservation objects
      let futureResObjects = [];
      if (timesToUpdate.length > 0) {
        futureResObjects = await getFutureReservationObjects(parkName, name);
      }

      if (futureResObjects.length > 0) {
        await processReservationObjects(futureResObjects, timesToUpdate);
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
    const res = await dynamodb.updateItem(updateParams).promise();
    return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(res.ExpressionAttributeNames));
  } catch (error) {
    logger.error(error);
    await unlockFacility(`facility::${parkName}`, sk);
    return sendResponse(400, error);
  }
}

async function setFacilityLock(pk, sk) {
  try {
    const facilityLockObject = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: pk },
        sk: { S: sk }
      },
      ExpressionAttributeValues: {
        ':isUpdating': AWS.DynamoDB.Converter.input(true)
      },
      UpdateExpression: 'SET isUpdating = :isUpdating',
      ConditionExpression: 'isUpdating = false',
      ReturnValues: 'ALL_NEW'
    };
    return await dynamodb.updateItem(facilityLockObject).promise()[0];
  } catch (error) {
    logger.error('Error in setFacilityLock');
    logger.error(facilityLockObject);
    throw {
      msg: 'This item is being updated by someone else. Please try again later.',
      title: 'Sorry, we are unable to fill your specific request.'
    };
  }
}

async function getFutureReservationObjects(parkName, facilityName) {
  let futureResObjects = [];
  try {
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
    futureResObjects = await runQuery(reservationsObjectQuery);
  } catch (error) {
    logger.error('Error in getFutureReservationObjects');
    logger.error(reservationsObjectQuery);
    throw { msg: 'Something went wrong.', title: 'Operation Failed' };
  }
  return futureResObjects;
}

async function processReservationObjects(resObjs, timesToUpdate) {
  for (let i = 0; i < resObjs.length; i++) {
    let resObj = resObjs[i];
    for (let j = 0; j < timesToUpdate.length; j++) {
      const timeToUpdate = timesToUpdate[j];
      let newCap = resObj.capacities[timeToUpdate.time].availablePasses + timeToUpdate.capacityDiff;
      if (newCap < 0) {
        try {
          // If we detect there's going to be an overflow, grab all overflow passes.
          newCap = await updatePassObjectsAsOverbooked(resObj.pk.split('::').pop(), sk, timeToUpdate.time, newcap * -1);
        } catch (error) {
          logger.error('Error occured while executing updatePassObjectsAsOverbooked()');
          throw error;
        }
      }
      // We want to do this instead of a batch operation. This is to prevent race conditions.
      try {
        await updateReservationsObjectCapacity(resObj.pk, resObj.sk, newCap);
      } catch (error) {
        logger.error('Error occured while executing updateReservationsObjectCapacity()');
        throw error;
      }
    }
  }
}

async function updateReservationsObjectCapacity(pk, sk, capToSet) {
  const updateReservationsObject = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: pk },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ':capToSet': capToSet
    },
    ExpressionAttributeNames: {
      '#type': type,
      '#availablePasses': 'availablePasses'
    },
    UpdateExpression: 'SET capacities.#type.#availablePasses = :capToSet'
  };

  const res = await dynamodb.updateItem(updateReservationsObject).promise();
  logger.debug('Reservation object updated:' + res);
  return;
}

async function updatePassObjectsAsOverbooked(facilityName, shortPassDate, type, numberOfPassesOverbooked) {
  const passesQuery = {
    TableName: TABLE_NAME,
    IndexName: 'shortPassDate-index',
    ExpressionAttributeValues: {
      ':shortPassDate': { S: shortPassDate },
      ':facilityName': { S: facilityName },
      ':passType': { S: type }
    },
    ExpressionAttributeNames: {
      '#theType': 'type'
    },
    KeyConditionExpression: 'shortPassDate =:shortPassDate AND facilityName =:facilityName',
    FilterExpression: '#theType =:passType'
  };
  let passes;
  try {
    passes = await runQuery(passesQuery);
  } catch (error) {
    logger.error('Error occured while getting overbooked passes in updatePassObjectsAsOverbooked');
    logger.error(passesQuery);
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
  return overbookObj.newCap;
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

async function getOverbookedPassSet(passes, numberOfPassesOverbooked) {
  passes.sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));
  let overbookObj = {
    overbookedPasses: [],
    newCap: 0
  };
  let cancelledGuestTally = 0;
  for (let i = 0; i < passes.length; i++) {
    if (numberOfPassesOverbooked <= cancelledGuestTally) {
      break;
    }
    const pass = passes[i];
    cancelledGuestTally += pass.numberOfGuests;
    overbookObj.overbookedPasses.push(pass);
  }
  overbookObj.newCap = cancelledGuestTally - numberOfPassesOverbooked;
  return overbookObj;
}
