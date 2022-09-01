const { runQuery, TABLE_NAME, DEFAULT_BOOKING_DAYS_AHEAD, TIMEZONE, getPark, getFacility } = require('../dynamoUtil');
const { formatPublicReservationObject } = require('../writeReservation')
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions, roleFilter } = require('../permissionUtil');
const { logger } = require('../logger');
const { DateTime } = require('luxon');

exports.handler = async (event, context) => {
  logger.debug('Read Reservation', event);
  logger.debug('event.queryStringParameters', event.queryStringParameters);

  try {
    if (!event.queryStringParameters || !event.queryStringParameters.park || !event.queryStringParameters.facility) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }

    const park = event.queryStringParameters.park;
    const facility = event.queryStringParameters.facility;
    const date = event.queryStringParameters.date || '';
    const getFutureReservationObjects = event.queryStringParameters.getFutureReservationObjects || false;
    let facilityObj = {};
    let bookingWindow = [date];

    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);

    if (permissionObject.isAuthenticated) {
      // Auth'd users must provide a date.
      if (!date) {
        return sendResponse(400, { msg: 'Please provide a date.' });
      }
      if (permissionObject.isAdmin) {
        logger.debug('**SYSADMIN**');
      } else {
        logger.debug('**AUTHENTICATED, NOT SYSADMIN**');
        let parkObj = await getPark(park, true);

        // Check roles.
        logger.debug('Roles:', permissionObject.roles);
        parkObj = await roleFilter([parkObj], permissionObject.roles);

        // If user does not have correct park role, then they are not authorized.
        if (parkObj.length < 1) {
          return sendResponse(403, { msg: 'Unauthorized' }, context);
        }
      }
    } else {
      // If public, we have to check park/facility visibility first.
      logger.debug('**NOT AUTHENTICATED, PUBLIC**');
      let parkObj = await getPark(park);
      if (!parkObj) {
        return sendResponse(404, { msg: 'Park not found' }, context);
      }
      facilityObj = await getFacility(park, facility);
      if (!facilityObj) {
        return sendResponse(404, { msg: 'Facility not found' }, context);
      }

      const window = getBookingWindow(facilityObj);

      if (!date) {
        bookingWindow = window;
      } else if (!window.includes(date)) {
        return sendResponse(400, {
          msg: `Provided date must be between today's date and ${facilityObj.bookingDaysAhead} days in the future`
        });
      }
    }

    // Build the reservation query object.
    logger.debug('Grab reservations for facility:', facility);
    let queryObj = {
      TableName: TABLE_NAME,
      ConsistentRead: true,
      ExpressionAttributeValues: {
        ':pk': { S: `reservations::${park}::${facility}` }
      },
      KeyConditionExpression: 'pk = :pk'
    };

    if (date) {
      if (getFutureReservationObjects) {
        const bookingPSTDateTime = DateTime.fromISO(date)
          .setZone(TIMEZONE)
          .set({
            hour: 12,
            minutes: 0,
            seconds: 0,
            milliseconds: 0
          })
          .toISODate();
        queryObj.ExpressionAttributeValues[':date'] = { S: bookingPSTDateTime };
        queryObj.KeyConditionExpression += ' AND sk >= :date';
      } else {
        // We are searching for a specific date.
        queryObj.ExpressionAttributeValues[':date'] = { S: date };
        queryObj.KeyConditionExpression += ' AND sk = :date';
      }
    } else {
      // We must be public, and we want to pull the whole date window.
      queryObj.ExpressionAttributeValues[':startDate'] = { S: bookingWindow[0] };
      queryObj.ExpressionAttributeValues[':endDate'] = { S: bookingWindow[bookingWindow.length - 1] };
      queryObj.KeyConditionExpression += ' AND sk BETWEEN :startDate AND :endDate';
    }

    let reservations = await runQuery(queryObj);

    // Format/filter public results.
    if (!permissionObject.isAuthenticated) {
      reservations = formatPublicReservationObject(reservations, facilityObj, bookingWindow);
    }

    logger.debug('GET reservations:', reservations);
    return sendResponse(200, reservations);
  } catch (err) {
    logger.error('ERROR:', err);
    return sendResponse(400, { msg: err }, context);
  }
};

// Get array of shortDates between today and max future look ahead date.
function getBookingWindow(facilityObj) {
  const lookAheadDays = facilityObj.bookingDaysAhead || DEFAULT_BOOKING_DAYS_AHEAD;
  const today = DateTime.now().setZone(TIMEZONE);
  let dates = [];
  for (let i = 0; i <= lookAheadDays; i++) {
    dates.push(today.plus({ days: i }).toISODate());
  }
  return dates;
}

