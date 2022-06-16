const AWS = require('aws-sdk');
const axios = require('axios');
const { verifyJWT } = require('../captchaUtil');
const { dynamodb, runQuery, TABLE_NAME, DEFAULT_BOOKING_DAYS_AHEAD, TIMEZONE } = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { DateTime } = require('luxon');
const { logger } = require('../logger');

// default opening/closing hours in 24h time
const DEFAULT_AM_OPENING_HOUR = 7;
const DEFAULT_PM_OPENING_HOUR = 12;

exports.handler = async (event, context) => {
  let passObject = {
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_not_exists(sk)'
  };

  if (!event) {
    return sendResponse(
      400,
      {
        msg: 'There was an error in your submission.',
        title: 'Bad Request'
      },
      context
    );
  }

  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  try {
    let newObject = JSON.parse(event.body);

    const registrationNumber = generate(10);

    let {
      parkName,
      firstName,
      lastName,
      facilityName,
      email,
      date,
      type,
      numberOfGuests,
      phoneNumber,
      captchaJwt,
      ...otherProps
    } = newObject;

    if (!captchaJwt || !captchaJwt.length) {
      return sendResponse(400, {
        msg: 'Missing CAPTCHA verification.',
        title: 'Missing CAPTCHA verification'
      });
    }

    const verification = verifyJWT(captchaJwt);
    if (!verification.valid) {
      return sendResponse(400, {
        msg: 'CAPTCHA verification failed.',
        title: 'CAPTCHA verification failed'
      });
    }

    const facilityData = await getFacility(parkName, facilityName);
  
    // Enforce maximum limit per pass
    if (facilityData.type === 'Trail' && numberOfGuests > 4) {
      return sendResponse(400, {
        msg: 'You cannot have more than 4 guests on a trail.',
        title: 'Too many guests'
      });
    }

    if (facilityData.type === 'Parking') {
      numberOfGuests = 1;
    }

    // Get current time vs booking time information
    // Log server DateTime
    logger.debug('Server Time Zone:',
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'undefined',
      `(${DateTime.now().toISO()})`
    );
    const currentPSTDateTime = DateTime.now().setZone(TIMEZONE);
    const bookingPSTDateTime = DateTime.fromISO(date).setZone(TIMEZONE).set({
      hour: 12,
      minutes: 0,
      seconds: 0,
      milliseconds: 0
    });

    // check if booking date in the past
    const currentPSTDateStart = currentPSTDateTime.startOf('day');
    if (currentPSTDateStart.toISO() > bookingPSTDateTime.toISO()) {
      return sendResponse(400, {
        msg: 'You cannot book for a date in the past.',
        title: 'Booking date in the past'
      });
    }

    // Check bookingDaysAhead
    const bookingDaysAhead =
      facilityData.bookingDaysAhead === null ? DEFAULT_BOOKING_DAYS_AHEAD : facilityData.bookingDaysAhead;
    const futurePSTDateTimeMax = currentPSTDateTime.plus({ days: bookingDaysAhead });
    if (bookingPSTDateTime.startOf('day') > futurePSTDateTimeMax.startOf('day')) {
      return sendResponse(400, {
        msg: 'You cannot book for a date that far ahead.',
        title: 'Booking date in the future invalid'
      });
    }

    // There should only be 1 facility.
    let openingHour = facilityData.bookingOpeningHour || DEFAULT_AM_OPENING_HOUR;
    let closingHour = DEFAULT_PM_OPENING_HOUR;

    let status = 'reserved';

    // check if booking same-day
    if (currentPSTDateTime.get('day') === bookingPSTDateTime.get('day')) {
      // check if AM/PM/DAY is currently open
      const currentPSTHour = currentPSTDateTime.get('hour');
      if (type === 'AM' && currentPSTHour >= DEFAULT_PM_OPENING_HOUR) {
        // it is beyond AM closing time
        return sendResponse(400, {
          msg:
            'It is too late to book an AM pass on this day (AM time slot is from ' +
            to12hTimeString(openingHour) +
            ' to ' +
            to12hTimeString(closingHour) +
            ').',
          title: 'AM time slot has expired'
        });
      }
      if (type === 'PM') {
        openingHour = DEFAULT_PM_OPENING_HOUR;
      }
      if (currentPSTHour >= openingHour) {
        status = 'active';
      }
    }

    const bookingPSTShortDate = bookingPSTDateTime.toISODate();

    passObject.Item = {};
    passObject.Item['pk'] = { S: 'pass::' + parkName };
    passObject.Item['sk'] = { S: registrationNumber };
    passObject.Item['firstName'] = { S: firstName };
    passObject.Item['searchFirstName'] = { S: firstName.toLowerCase() };
    passObject.Item['lastName'] = { S: lastName };
    passObject.Item['searchLastName'] = { S: lastName.toLowerCase() };
    passObject.Item['facilityName'] = { S: facilityName };
    passObject.Item['email'] = { S: email };
    passObject.Item['date'] = { S: bookingPSTDateTime.toUTC().toISO() };
    passObject.Item['shortPassDate'] = { S: bookingPSTShortDate };
    passObject.Item['type'] = { S: type };
    passObject.Item['registrationNumber'] = { S: registrationNumber };
    passObject.Item['numberOfGuests'] = AWS.DynamoDB.Converter.input(numberOfGuests);
    passObject.Item['passStatus'] = { S: status };
    passObject.Item['phoneNumber'] = AWS.DynamoDB.Converter.input(phoneNumber);
    passObject.Item['facilityType'] = { S: facilityData.type };
    passObject.Item['creationDate'] = { S: currentPSTDateTime.toUTC().toISO() };
    passObject.Item['isOverbooked'] = { BOOL: false };

    const cancellationLink =
      process.env.PUBLIC_FRONTEND +
      process.env.PASS_CANCELLATION_ROUTE +
      '?passId=' +
      registrationNumber +
      '&email=' +
      email +
      '&park=' +
      parkName +
      '&date=' +
      bookingPSTShortDate +
      '&type=' +
      type;

    const encodedCancellationLink = encodeURI(cancellationLink);

    let gcNotifyTemplate = process.env.GC_NOTIFY_TRAIL_RECEIPT_TEMPLATE_ID;

    const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedBookingDate = bookingPSTDateTime.toLocaleString(dateOptions);

    let parkObj = {
      TableName: TABLE_NAME
    };

    parkObj.ExpressionAttributeValues = {};
    parkObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
    parkObj.ExpressionAttributeValues[':sk'] = { S: parkName };
    parkObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    const parkData = await runQuery(parkObj);
    logger.debug('ParkData:', parkData);

    let personalisation = {
      firstName: firstName,
      lastName: lastName,
      date: formattedBookingDate,
      type: type === 'DAY' ? 'ALL DAY' : type,
      facilityName: facilityName,
      numberOfGuests: numberOfGuests.toString(),
      registrationNumber: registrationNumber.toString(),
      cancellationLink: encodedCancellationLink,
      parkName: parkName,
      mapLink: parkData[0].mapLink,
      parksLink: parkData[0].bcParksLink
    };

    // Parking.
    if (facilityData.type === 'Parking') {
      gcNotifyTemplate = process.env.GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID;
    }

    if (parkData[0].visible === true) {
      // Check existing pass for the same facility, email, type and date
      try {
        const existingPassCheckObject = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk',
          FilterExpression:
            'facilityName = :facilityName AND email = :email AND #type = :type AND begins_with(#date, :date) AND (passStatus = :reserved OR passStatus = :active)',
          ExpressionAttributeNames: {
            '#type': 'type',
            '#date': 'date'
          },
          ExpressionAttributeValues: {
            ':pk': { S: 'pass::' + parkName },
            ':facilityName': { S: facilityName },
            ':email': { S: email },
            ':type': { S: type },
            ':date': { S: bookingPSTShortDate },
            ':reserved': { S: 'reserved' },
            ':active': { S: 'active' }
          }
        };
        let existingItems;
        try {
          existingItems = await dynamodb.query(existingPassCheckObject).promise();
        } catch (error) {
          logger.error('Error while running query for existingPassCheckObject');
          logger.error(error);
          throw error;
        }

        if (existingItems.Count > 0) {
          return sendResponse(400, {
            title: 'This email account already has a reservation for this booking time.',
            msg: 'A reservation associated with this email for this booking time already exists. Please check to see if you already have a reservation for this time. If you do not have an email confirmation of your reservation please contact <a href="mailto:parkinfo@gov.bc.ca">parkinfo@gov.bc.ca</a>'
          });
        }
      } catch (err) {
        logger.error(err);
        return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
      }

      // Here, we must create/update a reservation object
      // https://github.com/bcgov/parks-reso-api/wiki/Models

      // TODO: We need to change park name in the PK to use orcs instead.
      const reservationsObjectPK = `reservations::${parkName}::${facilityName}`;

      // We need to ensure that the reservations object exists.
      // Attempt to create reservations object. If it fails, so what...

      await createNewReservationsObj(facilityData.bookingTimes, reservationsObjectPK, bookingPSTShortDate, type);

      // Perform a transaction where we decrement the available passes and create the pass
      // If the conditions where the related facility object has a lock, we then fail the whole transaction.
      // This is to prevent a race condition related to available pass tallies.
      passObject.ReturnValuesOnConditionCheckFailure = 'ALL_OLD';
      const transactionObj = {
        TransactItems: [
          {
            ConditionCheck: {
              TableName: TABLE_NAME,
              Key: {
                // TODO: Make this use Orcs instead of parkName
                pk: { S: `facility::${parkName}` },
                sk: { S: facilityName }
              },
              ExpressionAttributeValues: {
                ':isUpdating': { BOOL: false }
              },
              ConditionExpression: 'isUpdating = :isUpdating',
              ReturnValuesOnConditionCheckFailure: 'ALL_OLD'
            }
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: {
                pk: { S: reservationsObjectPK },
                sk: { S: bookingPSTShortDate }
              },
              ExpressionAttributeValues: {
                ':dec': AWS.DynamoDB.Converter.input(numberOfGuests)
              },
              ExpressionAttributeNames: {
                '#type': type,
                '#availablePasses': 'availablePasses'
              },
              UpdateExpression: 'SET capacities.#type.#availablePasses = capacities.#type.#availablePasses - :dec',
              ConditionExpression: 'capacities.#type.#availablePasses >= :dec',
              ReturnValuesOnConditionCheckFailure: 'ALL_OLD'
            }
          },
          {
            Put: passObject
          }
        ]
      };
      logger.debug('Transact obj:', transactionObj);
      logger.debug('Putting item:', passObject);
      try {
        const res = await dynamodb.transactWriteItems(transactionObj).promise();
        logger.debug('Res:', res);
      } catch (error) {
        logger.error('Transaction failed:', error);
        if (error.code === 'TransactionCanceledException') {
          let cancellationReasons = error.message.slice(error.message.lastIndexOf('[') + 1);
          cancellationReasons = cancellationReasons.slice(0, -1);
          cancellationReasons = cancellationReasons.split(', ');
          let message = error.message;
          if (cancellationReasons[0] != 'None') {
            logger.error('Facility is currently locked');
            message = "An error has occured, please try again."
            // TODO: we could implement a retry transaction here.
          }
          if (cancellationReasons[1] != 'None') {
            logger.error('Sold out of passes.');
            message = "We have sold out of allotted passes for this time, please check back on the site from time to time as new passes may come available."
          }
          if (cancellationReasons[2] != 'None') {
            logger.error('Error creating pass.');
            message = "An error has occured, please try again."
          }

          return sendResponse(400, {
            msg: message,
            title: 'Sorry, we are unable to fill your specific request.'
          });
        } else {
          throw error;
        }
      }

      try {
        await axios({
          method: 'post',
          url: process.env.GC_NOTIFY_API_PATH,
          headers: {
            Authorization: process.env.GC_NOTIFY_API_KEY,
            'Content-Type': 'application/json'
          },
          data: {
            email_address: email,
            template_id: gcNotifyTemplate,
            personalisation: personalisation
          }
        });
        logger.debug('GCNotify email sent.');
        return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(passObject.Item));
      } catch (err) {
        logger.error('GCNotify error:', err);
        let errRes = AWS.DynamoDB.Converter.unmarshall(passObject.Item);
        errRes['err'] = 'Email Failed to Send';
        return sendResponse(200, errRes);
      }
    } else {
      // Not allowed for whatever reason.
      return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
    }
  } catch (err) {
    logger.error('err', err);
    return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
  }
};

function to12hTimeString(hour) {
  let period = 'am';
  if (hour > 11) {
    period = 'pm';
    if (hour > 12) {
      hour -= 12;
    }
  }
  let hourStr = hour === 0 ? '12' : hour.toString();
  return hourStr + period;
}

function generate(count) {
  // TODO: Make this better
  return Math.random().toString().substr(count);
}

async function getFacility(parkName, facilityName) {
  let getFacilityQueryObject = {
    TableName: TABLE_NAME
  };
  getFacilityQueryObject.ExpressionAttributeValues = {};
  getFacilityQueryObject.ExpressionAttributeValues[':pk'] = { S: `facility::${parkName}` };
  getFacilityQueryObject.ExpressionAttributeValues[':sk'] = { S: facilityName };
  getFacilityQueryObject.KeyConditionExpression = 'pk =:pk AND sk =:sk';
  try {
    const facilityDataRaw = await runQuery(getFacilityQueryObject);
    if (facilityDataRaw.length > 0) {
      return facilityDataRaw[0];
    } else {
      logger.error('Write Pass', getFacilityQueryObject);
      throw 'Facility does not exist.';
    }
  } catch (err) {
    logger.error('Facility Object Error: Failed to get facility');
    logger.error(err);
    logger.error(getFacilityQueryObject);
    logger.error('Write Pass', getFacilityQueryObject);
    return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
  }
}

async function createNewReservationsObj(facilityBookingTimes, reservationsObjectPK, bookingPSTShortDate, type) {
  const bookingTimeTypes = Object.keys(facilityBookingTimes);

  // Type given does not exist in the facility.
  if (!bookingTimeTypes.includes(type)) {
    logger.debug('Booking Time Type Error: type provided does not exist in facility');
    logger.debug(type);
    logger.error('Write Pass', bookingTimeTypes, type);
    return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
  }

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

  try {
    const res = await dynamodb.putItem(reservationsObject).promise();
    logger.debug(res);
  } catch (err) {
    // If this fails, that means the object already exists.
    // We can continue to our allocated increment logic.
    logger.info('Reservation object already exists', rawReservationsObject);
  }
}
