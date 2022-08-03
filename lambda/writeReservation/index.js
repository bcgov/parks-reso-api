const AWS = require('aws-sdk');
const { dynamodb, getFacility, TABLE_NAME } = require('../dynamoUtil');
const { logger } = require('../logger');

const { decodeJWT, resolvePermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  if (!event || !event.headers) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (event.httpMethod !== 'POST') {
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

    if (event.httpMethod === 'POST') {
      return await postReservation(obj);
    }
  } catch (err) {
    logger.error('err', err);
    return sendResponse(400, err, context);
  }
};

async function postReservation(obj) {
  // Ensure we have all required fields in obj
  if (!obj.parkName || !obj.facilityName || !obj.date) {
    return sendResponse(400, { msg: 'Invalid Request' }, context);
  }

  // Get facility for booking times and capacities
  const facility = await getFacility(obj.parkName, obj.facilityName);

  if (!facility) {
    logger.debug(obj.parkName);
    logger.debug(obj.facilityName);
    throw 'Facility not found.';
  }

  const bookingPSTShortDate = DateTime.fromISO(date)
    .setZone(TIMEZONE)
    .set({
      hour: 12,
      minutes: 0,
      seconds: 0,
      milliseconds: 0
    })
    .toISODate();

  // TODO: We need to change park name in the PK to use orcs instead.
  const reservationsObjectPK = `reservations::${parkName}::${facilityName}`;

  // Run createNewReservationsObj
  let res = await createNewReservationsObj(facility.bookingTimes, reservationsObjectPK, bookingPSTShortDate);
  if (!res) {
    res = 'Reservation object already exists.';
  }
  return sendResponse(200, res);
}

exports.createNewReservationsObj = async function createNewReservationsObj(
  facilityBookingTimes,
  reservationsObjectPK,
  bookingPSTShortDate
) {
  const bookingTimeTypes = Object.keys(facilityBookingTimes);

  let rawReservationsObject = {
    pk: reservationsObjectPK,
    sk: bookingPSTShortDate,
    capacities: {}
  };

  // We are initing capacities
  for (let i = 0; i < bookingTimeTypes.length; i++) {
    const property = bookingTimeTypes[i];
    rawReservationsObject.capacities[property] = {
      baseCapacity: facilityBookingTimes[property].max,
      capacityModifier: 0,
      availablePasses: facilityBookingTimes[property].max
    };
  }

  // Attempt to create a new reservations object
  const reservationsObject = {
    TableName: TABLE_NAME,
    Item: AWS.DynamoDB.Converter.marshall(rawReservationsObject),
    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
  };

  let res = null;
  try {
    res = await dynamodb.putItem(reservationsObject).promise();
    logger.debug(res);
  } catch (err) {
    // If this fails, that means the object already exists.
    // We can continue to our allocated increment logic.
    logger.info('Reservation object already exists', rawReservationsObject);
  }
  return res;
};
