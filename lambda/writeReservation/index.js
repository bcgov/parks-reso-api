const AWS = require('aws-sdk');
const { dynamodb, TABLE_NAME } = require('../dynamoUtil');
const { logger } = require('../logger');

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
