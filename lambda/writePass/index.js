const AWS = require('aws-sdk');
const { verifyJWT } = require('../captchaUtil');
const { dynamodb, TABLE_NAME, DEFAULT_BOOKING_DAYS_AHEAD, TIMEZONE, getFacility, getPark, getConfig } = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { decodeJWT, resolvePermissions } = require('../permissionUtil');
const { DateTime } = require('luxon');
const { logger } = require('../logger');
const { createNewReservationsObj } = require('../reservationObjUtils');
const { getPersonalizationAttachment, getAdminLinkToPass } = require('../passUtils');
const { sendSQSMessage } = require('../sqsUtils')

// default opening/closing hours in 24h time
const DEFAULT_AM_OPENING_HOUR = 7;
const DEFAULT_PM_OPENING_HOUR = 13;

async function modifyPassCheckInStatus(pk, sk, checkedIn) {
  let updateParams = {
    Key: {
      pk: { S: `pass::${pk}` },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ":checkedIn": { "BOOL": checkedIn }
    },
    UpdateExpression: 'set checkedIn =:checkedIn',
    ReturnValues: 'ALL_NEW',
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
  };

  if (checkedIn) {
    updateParams.ExpressionAttributeValues[':checkedInTime'] = { "S": DateTime.now().setZone(TIMEZONE).toISO() }
    updateParams.UpdateExpression += ', checkedInTime =:checkedInTime';
  } else {
    // Remove time as it's irrelevant now
    updateParams.UpdateExpression += ' remove checkedInTime';
  }

  const res = await dynamodb.updateItem(updateParams).promise();
  return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(res.Attributes));
}

async function putPassHandler(event, context, permissionObject, passObj) {
  try {
    if (!permissionObject.isAuthenticated) {
      return sendResponse(
        403,
        {
          msg: 'You are not authorized to perform this operation.',
          title: 'Unauthorized'
        }
      )
    }

    // Only support check-in
    if (event?.queryStringParameters?.checkedIn === 'true') {
      return await modifyPassCheckInStatus(passObj.pk, passObj.sk, true);
    } else if (event?.queryStringParameters?.checkedIn === 'false') {
      return await modifyPassCheckInStatus(passObj.pk, passObj.sk, false);
    } else {
      throw 'Bad Request - invalid query string parameters';
    }
  } catch(e) {
    logger.info("There was an error in putPassHandler");
    logger.error(e);
    return sendResponse(
      400,
      {
        msg: 'The operation failed.',
        title: 'Bad Request'
      },
      context
    );
  }
}

exports.handler = async (event, context) => {
  logger.debug("WritePass:", event);
  let passObject = {
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_not_exists(sk)'
  };

  if (!event) {
    logger.info("There was an error in your submission:");
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
    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);

    let newObject = JSON.parse(event.body);
    // Check for update method (check this pass in)
    if (event.httpMethod === 'PUT') {
      return putPassHandler(event, context, permissionObject, newObject);
    }

    // HC Adjustment
    if (newObject.parkName === '0015') {
      // Running an old version
      newObject['parkOrcs'] = '0015';
      newObject.parkName = 'Mount Seymour Provincial Park';
    }

    // http POST (new)
    const registrationNumber = generate(10);

    let {
      parkOrcs,
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

    logger.info("GetFacility");
    logger.debug(permissionObject.roles);
    const parkData = await getPark(parkOrcs);
    const facilityData = await getFacility(parkOrcs, facilityName, permissionObject.isAdmin);

    if (Object.keys(facilityData).length === 0) {
      throw 'Facility not found.';
    }

    if (!permissionObject.isAdmin) {
      // Do extra checks if user is not sysadmin.
      if (!captchaJwt || !captchaJwt.length) {
        logger.info("Missing CAPTCHA verification");
        return sendResponse(400, {
          msg: 'Missing CAPTCHA verification.',
          title: 'Missing CAPTCHA verification'
        });
      }

      const verification = verifyJWT(captchaJwt);
      if (!verification.valid) {
        logger.info("CAPTCHA verification failed");
        return sendResponse(400, {
          msg: 'CAPTCHA verification failed.',
          title: 'CAPTCHA verification failed'
        });
      }

      // Enforce maximum limit per pass
      if (facilityData.type === 'Trail' && numberOfGuests > 4) {
        logger.info("Too many guests");
        return sendResponse(400, {
          msg: 'You cannot have more than 4 guests on a trail.',
          title: 'Too many guests'
        });
      }

      if (facilityData.type === 'Parking') {
        numberOfGuests = 1;
      }
    }

    // numberOfGuests cannot be less than 1.
    if (numberOfGuests < 1) {
      logger.info("Invalid number of guests:", numberOfGuests);
      return sendResponse(400, {
        msg: 'Passes must have at least 1 guest.',
        title: 'Invalid number of guests'
      });
    }

    // Get current time vs booking time information
    // Log server DateTime
    logger.debug(
      'Server Time Zone:',
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

    const bookingPSTShortDate = bookingPSTDateTime.toISODate();

    const bookingPSTDayOfWeek = bookingPSTDateTime.setLocale('en-CA').weekday;
    
    // check if passes are required on the booking weekday
    if (facilityData.bookingDays[bookingPSTDayOfWeek] === false) {
      // passes are not required, unless it is a holiday listed within the facility.
      // check if it is a holiday
      if (facilityData.bookableHolidays.indexOf(bookingPSTShortDate) === -1) {
        logger.info("Booking not required");
        return sendResponse(400, {
          msg: 'Passes are not required at this facility on the requested date.',
          title: 'Booking not required.'
        });
      }
    }

    // check if booking date in the past
    const currentPSTDateStart = currentPSTDateTime.startOf('day');
    if (currentPSTDateStart.toISO() > bookingPSTDateTime.toISO()) {
      logger.info("Booking date in the past");
      return sendResponse(400, {
        msg: 'You cannot book for a date in the past.',
        title: 'Booking date in the past'
      });
    }

    // Check bookingDaysAhead
    const bookingDaysAhead =
      facilityData.bookingDaysAhead === null ? DEFAULT_BOOKING_DAYS_AHEAD : facilityData.bookingDaysAhead;
    const futurePSTDateTimeMax = currentPSTDateTime.plus({ days: bookingDaysAhead });
    if (bookingPSTDateTime.startOf('day') > futurePSTDateTimeMax.startOf('day') && !permissionObject.isAdmin) {
      logger.info("Booking date in the future invalid");
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
        const openTime = to12hTimeString(openingHour);
        const closeTime = to12hTimeString(closingHour);
        logger.info("late to book an AM pass on this day");
        logger.debug(type, currentPSTHour, openTime, closeTime);
        return sendResponse(400, {
          msg:
            'It is too late to book an AM pass on this day (AM time slot is from ' +
            openTime +
            ' to ' +
            closeTime +
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

    passObject.Item = {};
    passObject.Item['pk'] = { S: 'pass::' + parkData.sk };
    passObject.Item['sk'] = { S: registrationNumber };
    passObject.Item['parkName'] = {S: parkData.name};
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
    passObject.Item['isOverbooked'] = { BOOL: false };
    // Audit
    passObject.Item['creationDate'] = { S: currentPSTDateTime.toUTC().toISO() };
    passObject.Item['dateUpdated'] = { S: currentPSTDateTime.toUTC().toISO() };
    passObject.Item['audit'] = {
      "L": [
        {
          "M": {
            "by": {
              "S": "system"
            },
            "passStatus": {
              "S": status
            }
            ,
            "dateUpdated": {
              "S": currentPSTDateTime.toUTC().toISO()
            }
          }
        }
      ]
    }

    const cancellationLink =
      process.env.PUBLIC_FRONTEND +
      process.env.PASS_CANCELLATION_ROUTE +
      '?passId=' +
      registrationNumber +
      '&email=' +
      email +
      '&park=' +
      parkOrcs +
      '&date=' +
      bookingPSTShortDate +
      '&type=' +
      type;

    const encodedCancellationLink = encodeURI(cancellationLink);

    let gcNotifyTemplate = process.env.GC_NOTIFY_TRAIL_RECEIPT_TEMPLATE_ID;

    const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedBookingDate = bookingPSTDateTime.toLocaleString(dateOptions);

    let personalisation = {
      firstName: firstName,
      lastName: lastName,
      date: formattedBookingDate,
      type: type === 'DAY' ? 'ALL DAY' : type,
      facilityName: facilityName,
      numberOfGuests: numberOfGuests.toString(),
      registrationNumber: registrationNumber.toString(),
      cancellationLink: encodedCancellationLink,
      parkName: parkData.name,
      mapLink: parkData.mapLink || null,
      parksLink: parkData.bcParksLink,
      ...(await getPersonalizationAttachment(parkData.sk, registrationNumber.toString(), facilityData.qrcode))
    };

    // Parking.
    if (facilityData.type === 'Parking') {
      gcNotifyTemplate = process.env.GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID;
    }

    if (parkData.visible === true) {
      // Check existing pass for the same facility, email, type and date
      // Unless not in production
      const config = await getConfig();
      if (config.ENVIRONMENT === 'prod') {
        try {
          const existingPassCheckObject = {
            TableName: TABLE_NAME,
            IndexName: 'shortPassDate-index',
            KeyConditionExpression: 'shortPassDate = :shortPassDate AND facilityName = :facilityName',
            FilterExpression:
              'email = :email AND #type = :type AND passStatus IN (:reserved, :active)',
            ExpressionAttributeNames: {
              '#type': 'type',
            },
            ExpressionAttributeValues: {
              ':facilityName': { S: facilityName },
              ':email': { S: email },
              ':type': { S: type },
              ':shortPassDate': { S: bookingPSTShortDate },
              ':reserved': { S: 'reserved' },
              ':active': { S: 'active' }
            }
          };
          let existingItems;
          try {
            logger.info("Running existingPassCheckObject");
            existingItems = await dynamodb.query(existingPassCheckObject).promise();
          } catch (error) {
            logger.info('Error while running query for existingPassCheckObject');
            logger.error(error);
            throw error;
          }

          if (existingItems.Count === 0) {
            logger.debug('No existing pass found. Creating new pass...');
          } else {
            logger.info(`email account already has a reservation. Registration number: ${JSON.stringify(existingItems?.Items[0]?.registrationNumber)}, Orcs: ${parkData.sk}`);
            return sendResponse(400, {
              title: 'This email account already has a reservation for this booking time.',
              msg: 'A reservation associated with this email for this booking time already exists. Please check to see if you already have a reservation for this time. If you do not have an email confirmation of your reservation please contact <a href="mailto:parkinfo@gov.bc.ca">parkinfo@gov.bc.ca</a>'
            });
          }
        } catch (err) {
          logger.info(`Error on check existing pass for the same facility, email, type and date. Registration number: ${registrationNumber}, Orcs: ${parkData.sk}`);
          logger.error(err);
          return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
        }
      }

      // Here, we must create/update a reservation object
      // https://github.com/bcgov/parks-reso-api/wiki/Models

      // TODO: We need to change park name in the PK to use orcs instead.
      const reservationsObjectPK = `reservations::${parkData.sk}::${facilityName}`;

      const bookingTimeTypes = Object.keys(facilityData.bookingTimes);
      if (!bookingTimeTypes.includes(type)) {
        // Type given does not exist in the facility.
        logger.info('Booking Time Type Error: type provided does not exist in facility');
        logger.error('Write Pass', bookingTimeTypes, type);
        return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
      }

      // We need to ensure that the reservations object exists.
      // Attempt to create reservations object. If it fails, so what...
      await createNewReservationsObj(facilityData, reservationsObjectPK, bookingPSTShortDate);

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
                pk: { S: `facility::${parkData.sk}` },
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
        logger.info('Writing Transact obj.');
        const res = await dynamodb.transactWriteItems(transactionObj).promise();
        logger.debug('Res:', res);
      } catch (error) {
        logger.info('Transaction failed:', error.code);
        logger.error(error);
        if (error.code === 'TransactionCanceledException') {
          let cancellationReasons = error.message.slice(error.message.lastIndexOf('[') + 1);
          cancellationReasons = cancellationReasons.slice(0, -1);
          cancellationReasons = cancellationReasons.split(', ');
          let message = error.message;
          if (cancellationReasons[0] != 'None') {
            logger.info('Facility is currently locked');
            message = 'An error has occured, please try again.';
            // TODO: we could implement a retry transaction here.
          }
          if (cancellationReasons[1] != 'None') {
            logger.info(`Sold out of passes: ${parkData.name} / ${facilityName}`);
            message =
              'We have sold out of allotted passes for this time, please check back on the site from time to time as new passes may come available.';
          }
          if (cancellationReasons[2] != 'None') {
            logger.info('Error creating pass.');
            message = 'An error has occured, please try again.';
          }
          logger.info('unable to fill your specific request');
          return sendResponse(400, {
            msg: message,
            title: 'Sorry, we are unable to fill your specific request.'
          });
        } else {
          throw error;
        }
      }
      // Temporarily assign the QRCode Link for the front end not to guess at it.
      if (facilityData.qrcode === true) {
        passObject.Item['adminPassLink'] = { "S": getAdminLinkToPass(parkData.sk, registrationNumber.toString()) }
      }

      try {
        logger.info('Posting to GC Notify');
        const gcnData = {
          email_address: email,
          template_id: gcNotifyTemplate,
          personalisation: personalisation
        };

        // Push this email job onto the queue so we can return quickly to the front-end
        logger.info('Sending to SQS');
        await sendSQSMessage('GCN', gcnData);
        logger.info('Sent');

        // Prune audit
        delete passObject.Item['audit'];
        logger.info(`Pass successfully created. Registration number: ${JSON.stringify(passObject?.Item['registrationNumber'])}, Orcs: ${parkData.sk}`);
        return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(passObject.Item));
      } catch (err) {
        logger.info(`GCNotify error, return 200 anyway. Registration number: ${JSON.stringify(passObject?.Item['registrationNumber'])}`);
        logger.error(err.response?.data || err);
        let errRes = AWS.DynamoDB.Converter.unmarshall(passObject.Item);
        errRes['err'] = 'Email Failed to Send';
        return sendResponse(200, errRes);
      }
    } else {
      logger.info('Something went wrong, park not visible.');
      // Not allowed for whatever reason.
      return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
    }
  } catch (err) {
    logger.info('Operation Failed');
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
