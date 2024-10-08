
const { dynamoClient,
  TABLE_NAME,
  TIMEZONE,
  sendResponse,
  logger,
  marshall,
  unmarshall,
  DateTime,
  PutItemCommand,
  UpdateItemCommand } = require('/opt/baseLayer');
const { decodeJWT, resolvePermissions, getParkAccess } = require('/opt/permissionLayer');
const { processReservationObjects, getFutureReservationObjects, createNewReservationsObj } = require('/opt/reservationLayer');
const { unlockFacility, setFacilityLock } = require('/opt/facilityLayer');

exports.handler = async (event, context) => {
  if (!event || !event.headers) {
    logger.info("Unauthorized");
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (!(event.httpMethod === 'POST' || event.httpMethod === 'PUT')) {
    logger.info("Not Implemented");
    return sendResponse(405, { msg: 'Not Implemented' }, context);
  }

  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  if (permissionObject.isAuthenticated !== true) {
    logger.info("Unauthorized");
    logger.debug("permissionObject:", permissionObject);
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  try {
    logger.debug(event.body);
    const obj = JSON.parse(event.body);
    try {
      await getParkAccess(obj.parkOrcs, permissionObject);
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
        return sendResponse(403, { msg: 'Unauthorized' });
      }
    }
  } catch (err) {
    logger.error('err', err);
    return sendResponse(400, err, context);
  }
};

async function createFacility(obj) {
  let { parkOrcs, bookingTimes, name, status, type, visible, bookingOpeningHour, bookingDaysAhead, bookingDays, bookingDaysRichText, bookableHolidays, qrcode, ...otherProps } =
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
      pk: { S: `facility::${parkOrcs}` },
      sk: { S: name },
      bookingTimes: { M: marshall(bookingTimes) },
      name: { S: name },
      status: { M: marshall(status) },
      type: { S: type },
      visible: { BOOL: visible },
      qrcode: { BOOL: qrcode },
      isUpdating: { BOOL: false },
      bookingOpeningHour: bookingOpeningHourAttrValue,
      bookingDaysAhead: bookingDaysAheadAttrValue,
      bookingDays: { M: marshall(bookingDays) },
      bookingDaysRichText: { S: bookingDaysRichText },
      bookableHolidays: {M: marshall(bookableHolidays)}
    }
  };

  logger.debug('putting item:', facilityObj);

  const command = new PutItemCommand(facilityObj);
  const res = await dynamoClient.send(command);
  logger.info('res:', res.length);
  logger.debug('res:', res);
  return sendResponse(200, res);
}

async function updateFacility(obj) {
  let { pk, sk, parkOrcs, bookingTimes, name, status, type, visible, bookingOpeningHour, bookingDaysAhead, bookingDays, bookingDaysRichText, bookableHolidays, qrcode, ...otherProps } =
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
    const currentFacility = await setFacilityLock(`facility::${parkOrcs}`, sk);

    // Check if we are updating booking times
    if (!deepEqual(obj, currentFacility)) {
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
      // Status is changing.
      let newStatus;
      if (status.state !== currentFacility.status.state) {
        newStatus = status.state;
      }

      // Gather all future reservation objects
      let futureResObjects = [];
      if (timesToUpdate.length > 0 || timesToRemove.length > 0 || newStatus) {
        futureResObjects = await getFutureReservationObjects(parkOrcs, name);
      }
      if (futureResObjects.length > 0) {
        await processReservationObjects(futureResObjects, timesToUpdate, timesToRemove, newStatus);
      }
    }

    let updateParams = {
      Key: {
        pk: { S: pk },
        sk: { S: sk }
      },
      ExpressionAttributeValues: {
        ':name': {S: name},
        ':statusValue': { M: marshall(status) },
        ':visibility': { BOOL: visible },
        ':qrcode': { BOOL: qrcode },
        ':bookingTimes': { M: marshall(bookingTimes) },
        ':bookingOpeningHour': bookingOpeningHourAttrValue,
        ':bookingDaysAhead': bookingDaysAheadAttrValue,
        ':isUpdating': { BOOL: false },
        ':bookingDays': { M: marshall(bookingDays) },
        ":bookingDaysRichText": { S: bookingDaysRichText },
        ":bookableHolidays": {M: marshall(bookableHolidays)}
      },
      ExpressionAttributeNames: {
        '#facilityStatus': 'status',
        '#visibility': 'visible',
        '#name': 'name'
      },
      UpdateExpression:
        'SET #facilityStatus =:statusValue, bookingTimes =:bookingTimes, #visibility =:visibility, bookingOpeningHour = :bookingOpeningHour, bookingDaysAhead = :bookingDaysAhead, isUpdating = :isUpdating, bookingDays = :bookingDays, bookingDaysRichText = :bookingDaysRichText, bookableHolidays = :bookableHolidays, #name = :name, qrcode = :qrcode',
      ReturnValues: 'ALL_NEW',
      TableName: TABLE_NAME
    };
    
    const command = new UpdateItemCommand(updateParams)
    const {Attributes} = await dynamoClient.send(command)

    // Attempt to create a new reservation object for 'today' if it doesn't exist.
    // We want a record of every facility update when the updated data affects the reservation obj. 
    // If it already exists, this will intentionally fail.
    const reservationsObjectPK = `reservations::${parkOrcs}::${name}`;
    const todayShortDate = DateTime.now().setZone(TIMEZONE).toISODate();
    await createNewReservationsObj(obj, reservationsObjectPK, todayShortDate);

    return sendResponse(200, unmarshall(Attributes));
  } catch (error) {
    logger.error(JSON.stringify(error));
    await unlockFacility(`facility::${parkOrcs}`, sk);
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
