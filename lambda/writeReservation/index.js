const AWS = require('aws-sdk');
const { dynamodb, TABLE_NAME } = require('../dynamoUtil');
const { logger } = require('../logger');

// TODO: provide these as vars in Parameter Store
const LOW_CAPACITY_THRESHOLD = process.env.LOW_CAPACITY_THRESHOLD || 0.25;
const MODERATE_CAPACITY_THRESHOLD = process.env.MODERATE_CAPACITY_THRESHOLD || 0.75;
const PARKING_MAX_PER_PASS = 1;
const TRAIL_MAX_PER_PASS = 4;

exports.createNewReservationsObj = async function createNewReservationsObj(
  facility,
  reservationsObjectPK,
  bookingPSTShortDate
) {
  if (!facility.bookingTimes || !facility.status.state){
    logger.debug("Invalid facility object", facility);
    throw 'Invalid facility object';
  }

  const bookingTimeTypes = Object.keys(facility.bookingTimes);

  let rawReservationsObject = {
    pk: reservationsObjectPK,
    sk: bookingPSTShortDate,
    capacities: {},
    status: facility.status.state
  };

  // We are initing capacities
  for (let i = 0; i < bookingTimeTypes.length; i++) {
    const property = bookingTimeTypes[i];
    rawReservationsObject.capacities[property] = {
      baseCapacity: facility.bookingTimes[property].max,
      capacityModifier: 0,
      availablePasses: facility.bookingTimes[property].max
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
    logger.info('Reservation object already exists');
    logger.debug(rawReservationsObject);
  }
  return res;
};

exports.formatPublicReservationObject = function formatPublicReservationObject(reservations, facility, bookingWindow) {
  let publicObj = buildPublicTemplate(facility, bookingWindow);
  for (let reservation of reservations) {
    for (const [key, value] of Object.entries(reservation.capacities)) {
      const bookingSlot = {
        capacity: getCapacityLevel(value.baseCapacity, value.availablePasses, value.capacityModifier),
        max: checkMaxPasses(facility, value.availablePasses)
      };
      publicObj[reservation.sk][key] = bookingSlot;
    }
  }
  return publicObj;
}

// Build empty public template to be populated with real reservation data if it exists.
function buildPublicTemplate(facility, bookingWindow) {
  let template = {};
  for (let date of bookingWindow) {
    let dateEntry = {};
    for (const key of Object.keys(facility.bookingTimes)) {
      dateEntry[key] = {
        capacity: 'High',
        max: checkMaxPasses(facility)
      };
      template[date] = dateEntry;
    }
  }
  return template;
}

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
}

function checkMaxPasses(facility, availablePasses = null) {
  let max = 1;
  switch (facility.type) {
    case 'Parking':
      max = PARKING_MAX_PER_PASS;
      break;
    case 'Trail':
      max = TRAIL_MAX_PER_PASS;
      break;
  }
  if (availablePasses > max) {
    return max;
  }
  return availablePasses ?? max;
}

