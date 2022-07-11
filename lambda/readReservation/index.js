const { runQuery, TABLE_NAME, DEFAULT_BOOKING_DAYS_AHEAD, TIMEZONE } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions, roleFilter } = require('../permissionUtil');
const { logger } = require('../logger');
const { DateTime } = require('luxon');

// TODO: provide these as vars in Parameter Store
const LOW_CAPACITY_THRESHOLD = process.env.LOW_CAPACITY_THRESHOLD || 0.25;
const MODERATE_CAPACITY_THRESHOLD = process.env.MODERATE_CAPACITY_THRESHOLD || 0.75;

exports.handler = async (event, context) => {
  logger.debug('Read Facility', event);
  logger.debug('event.queryStringParameters', event.queryStringParameters);

  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }

    let park = {};
    let facility = {};
    let date = '';

    // Check permissions against requested reservations object
    // If public, we have to check some aspects of the park & facility first.
    if (!permissionObject.isAuthenticated) {
      logger.debug('**NOT AUTHENTICATED, PUBLIC**');
      // Public queries require a date.
      if (!event.queryStringParameters.date || new Date(event.queryStringParameters.date).toString() === 'Invalid Date') {
        return sendResponse(400, { msg: 'A valid date must be provided' }, context);
      }

      date = event.queryStringParameters.date;
      park = await getPark(event.queryStringParameters.park);
      if (park.length < 1) {
        return sendResponse(404, { msg: 'Park not found' }, context);
      };
      facility = await getFacility(event.queryStringParameters.park, event.queryStringParameters.facility);
      if (facility.length < 1) {
        return sendResponse(404, { msg: 'Facility not found' }, context);
      }

      // Don't return any dates to the public in the past or beyond the lookahead date.
      const lookAheadDays = facility.bookingDaysAhead || DEFAULT_BOOKING_DAYS_AHEAD;
      const todayDateTime = DateTime.now().setZone(TIMEZONE);
      const lookAheadDate = todayDateTime.plus({ days: lookAheadDays }).toISODate();
      if (date > lookAheadDate) {
        return sendResponse(400, { msg: `Date must be at most ${lookAheadDays} day(s) in the future` }, context);
      } else if (date < todayDateTime.toISODate()) {
        return sendResponse(400, { msg: 'Date cannot be in the past' }, context);
      }
    }

    // if authorized but not sysadmin, we need to check park roles.
    if (permissionObject.isAuthenticated && !permissionObject.isAdmin) {
      logger.debug('**AUTHORIZED, NOT SYSADMIN**');
      park = await getPark(event.queryStringParameters.park);
      logger.debug('Roles:', permissionObject.roles);
      park = await roleFilter(park, permissionObject.roles);
      // if user does not have correct park role, then they are not authorized. 
      if (park.length < 1) {
        return sendResponse(403, { msg: 'Unauthorized' }, context);
      }
    }

    // build the reservation query object
    if (event.queryStringParameters.park && event.queryStringParameters.facility) {
      logger.debug('Grab reservations for facility:', event.queryStringParameters.facility);
      let queryObj = {
        TableName: TABLE_NAME,
        ConsistentRead: true,
        ExpressionAttributeNames: {
          '#pk': 'pk'
        },
        ExpressionAttributeValues: {
          ':pk': { S: `reservations::${event.queryStringParameters.park}::${event.queryStringParameters.facility}` }
        },
        KeyConditionExpression: '#pk = :pk'
      };

      // if we are searching for a specific date
      if (event.queryStringParameters.date) {
        queryObj.ExpressionAttributeNames['#sk'] = 'sk';
        queryObj.ExpressionAttributeValues[':date'] = { S: event.queryStringParameters.date };
        queryObj.KeyConditionExpression += ' AND #sk = :date';
      }

      let reservations = await runQuery(queryObj);

      // format/filter results based on permissions
      if (!permissionObject.isAuthenticated) {
        // public receives a heavily filtered payload
        reservations = formatPublicResults(reservations[0], facility[0], date);
      } else if (permissionObject.isAdmin) {
        // Return everything to sysadmins
        logger.debug('**SYSADMIN**');
      }

      logger.debug('GET reservations:', reservations)
      return sendResponse(200, reservations);
    }
  } catch (err) {
    logger.error('ERROR:', err);
    return sendResponse(400, {msg: err}, context);
  }
};

async function getPark(park) {
  try {
    let queryObj = {
      TableName: TABLE_NAME,
      ConsistentRead: true,
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk',
        '#visible': 'visible'
      },
      ExpressionAttributeValues: {
        ':pk': { S: 'park' },
        ':sk': { S: park },
        ':visible': { BOOL: true }
      },
      KeyConditionExpression: '#pk = :pk AND #sk = :sk',
      FilterExpression: '#visible = :visible'
    }

    res = await runQuery(queryObj);
    if (!res) {
      throw 'Park was not found.';
    }
    logger.debug('Public reservations - GET park:', res);
    return res;
  } catch (err) {
    logger.error('ERROR:', err);
    return {};
  }
}

async function getFacility(park, facility) {
  try {
    let queryObj = {
      TableName: TABLE_NAME,
      ConsistentRead: true,
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk',
        '#visible': 'visible'
      },
      ExpressionAttributeValues: {
        ':pk': { S: `facility::${park}` },
        ':sk': { S: facility },
        ':visible': { BOOL: true }
      },
      KeyConditionExpression: '#pk = :pk AND #sk = :sk',
      FilterExpression: '#visible = :visible'
    };

    res = await runQuery(queryObj);
    if (!res) {
      throw 'Facility was not found.';
    }
    logger.debug('Public reservations - GET facility:', res);
    return res;
  } catch (err) {
    logger.error('ERROR:', err);
    return {};
  }
}

// Remove fields from public results.
function formatPublicResults(reservations, facility, date) {
  let publicObj = {};
  // Sanity check - if there is no date, send back empty object - public must provide date.
  if (!date) {
    return publicObj;
  }
  // If there is a facility but no reservation object, we can assume there are no reservations yet for the date.
  // We can prepopulate the results with a template of the facility's capacities.
  if (facility) {
    for (const key of Object.keys(facility.bookingTimes)) {
      publicObj[key] = 'High';
    }
  }
  // If we have a reservation object, overwrite the facility capacity template with reservation object values.
  if (reservations) {
    for (const [key, value] of Object.entries(reservations.capacities)) {
      publicObj[key] = getCapacityLevel(value.baseCapacity, value.availablePasses, value.capacityModifier);
    }
  }
  return publicObj;
};

// Get capacity level (high, med, low, none) of a facility.
function getCapacityLevel(base, available, modifier) {
  const capacity = base + modifier;
  const booked = capacity - available;
  const percentage = booked / capacity;
  if (percentage < LOW_CAPACITY_THRESHOLD) {
    return 'High';
  } else if (percentage < MODERATE_CAPACITY_THRESHOLD) {
    return 'Moderate';
  } else if (percentage < 1) {
    return 'Low';
  } else {
    return 'Full';
  }
};
