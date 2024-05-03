const qrcode = require('qrcode');
const { runQuery, TABLE_NAME, TIMEZONE, getOne, DEFAULT_BOOKING_DAYS_AHEAD, DEFAULT_PM_OPENING_HOUR } = require('./dynamoUtil');
const { logger } = require('./logger');
const { DateTime } = require('luxon');
const { CustomError } = require('./responseUtil');
const AWS = require('aws-sdk');
const options = {
  region: process.env.AWS_REGION || 'ca-central-1'
};
const sqs = new AWS.SQS(options);

// default opening/closing hours in 24h time
const DEFAULT_AM_OPENING_HOUR = 7;

/**
 * Sends a template message.
 * @param {string} templateId - The ID of the template.
 * @param {object} personalisation - The personalisation data for the template.
 * @param {object} passObject - The pass object.
 * @returns {object} - The updated pass object.
 */
async function sendTemplateSQS(facilityType, personalisation, passObject) {
  let gcNotifyTemplate;
  // Parking?
  if (facilityType === 'Parking') {
    gcNotifyTemplate = process.env.GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID;
  } else {
    gcNotifyTemplate = process.env.GC_NOTIFY_TRAIL_RECEIPT_TEMPLATE_ID;
  }
  const gcnData = {
    email_address: passObject.email,
    template_id: gcNotifyTemplate,
    personalisation: personalisation
  };

  // Push this email job onto the queue so we can return quickly to the front-end
  logger.info('Sending to SQS');
  await sendSQSMessage('GCN', gcnData);
  logger.info('Sent');

  logger.info(
    `Pass successfully created. Registration number: ${JSON.stringify(
      passObject?.Item['registrationNumber']
    )}, Orcs: ${passObject.Item.pk}`
  );
  return passObject;
};

async function sendSQSMessage(service, payload) {
  logger.info("SQSQUEUE:", process.env.SQSQUEUENAME);
  try {
    const params = {
      MessageBody: `SQS Message at ${(new Date()).toISOString()}`,
      QueueUrl: process.env.SQSQUEUENAME,
      MessageAttributes: {
        "email_address": {
          DataType: "String",
          StringValue: payload?.email_address
        },
        "template_id": {
          DataType: "String",
          StringValue: payload?.template_id
        },
        "personalisation": {
          DataType: "String",
          StringValue: JSON.stringify(payload?.personalisation)
        },
        "service": {
          DataType: "String",
          StringValue: service
        }
      }
    };
    logger.info("Sending SQS");
    await sqs.sendMessage(params).promise();
  } catch (e) {
    logger.error(e);
  }
}

async function getPersonalizationAttachment(parkIdentifier, registrationNumber, qrCode = false) {
  if (qrCode) {
    const base64image = await qrcode.toDataURL(getAdminLinkToPass(parkIdentifier, registrationNumber), {
      errorCorrectionLevel: 'H',
      margin: 6
    });
    return {
      hasQRCode: true,
      application_file: {
        file: base64image.split('base64,')[1],
        filename: 'QRCode.png',
        sending_method: 'attach'
      }
    };
  } else {
    return {
      hasQRCode: false
    };
  }
}

async function checkIfPassExists(park, id, facility) {
  const passQuery = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
      ':pk': { S: `pass::${park}` },
      ':sk': { S: id },
      ':facilityName': { S: facility }
    },
    KeyConditionExpression: 'pk = :pk AND sk = :sk',
    FilterExpression: 'facilityName =:facilityName'
  };
  const pass = await runQuery(passQuery);
  if (pass.length === 0) {
    throw new CustomError('Pass does not exist', 400);
  }
}

function getAdminLinkToPass(parkIdentifier, registrationNumber) {
  return (
    `${getAdminPortalURL()}${process.env.PASS_MANAGEMENT_ROUTE}` +
    `?park=${parkIdentifier}&registrationNumber=${registrationNumber}`
  );
}

function getAdminPortalURL() {
  return process.env.ADMIN_FRONTEND;
}

// checks to see if booking is currently allowed at a particular facility on a particular date
async function isBookingAllowed(orcs, facilitySk, date, type) {
  // Get current time vs booking time information.
  // Log server DateTime.
  logger.debug(
    'Server Time Zone:',
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'undefined',
    `(${DateTime.now().toISO()})`
  );

  // Check if date is a valid date
  if (!DateTime.fromISO(date).isValid) {
    throw new CustomError('Invalid booking date.', 400);
  }

  // Get park.
  logger.debug('Get park:', orcs);
  const park = AWS.DynamoDB.Converter.unmarshall(await getOne('park', orcs));

  // Get facility.
  logger.debug('Get facility:', `facility::${orcs}`, facilitySk);
  const facility = AWS.DynamoDB.Converter.unmarshall(await getOne(`facility::${orcs}`, facilitySk));

  // If park or facility doesn't exist, deny.
  if (!park || !facility) {
    throw 'Requested park or facility does not exist';
  }

  logger.debug("If facility does not have requested pass type, deny")

  // If facility does not have requested pass type, deny
  logger.info('facility.bookingTimes:', facility.bookingTimes);
  logger.info('Object.keys(facility.bookingTimes):', Object.keys(facility.bookingTimes));
  logger.info('type:', type);
  if (!Object.keys(facility?.bookingTimes).includes(type)) {
    throw new CustomError(`Requested facility does not distribute ${type} passes.`, 400);
  }

  // the hour of day the next future day opens for booking (AM slot)
  let openingHour = facility.bookingOpeningHour || DEFAULT_AM_OPENING_HOUR;
  let closingHour = DEFAULT_PM_OPENING_HOUR;

  // the timestamp this script was run
  const currentPSTDateTime = DateTime.now().setZone(TIMEZONE);
  // the date of booking
  const bookingPSTDateTime = DateTime.fromISO(date).setZone(TIMEZONE).set({
    hour: openingHour,
    minutes: 0,
    seconds: 0,
    milliseconds: 0
  });

  logger.info("If booking date in the past, deny.")

  // if booking date in the past, deny.
  if (currentPSTDateTime.startOf('day') > bookingPSTDateTime.startOf('day')) {
    // Date is definitely in the past.
    throw new CustomError('You cannot book for a date in the past.', 400);
  }

  // if booking AM pass after AM closing hour on same day, deny.
  logger.info('currentPSTDateTime.get("day"):', currentPSTDateTime.get("day"));
  logger.info('bookingPSTDateTime.get("day"):', bookingPSTDateTime.get("day"));
  if (currentPSTDateTime.get('day') === bookingPSTDateTime.get('day')) {
    // check if AM/PM/DAY is currently open
    const currentPSTHour = currentPSTDateTime.get('hour');
    if (type === 'AM' && currentPSTHour >= DEFAULT_PM_OPENING_HOUR) {
      // it is beyond AM closing time
      const openTime = to12hTimeString(openingHour);
      const closeTime = to12hTimeString(closingHour);
      logger.info('late to book an AM pass on this day');
      logger.debug(type, currentPSTHour, openTime, closeTime);
      throw new CustomError(`It is too late to book an AM pass on this day (AM time slot is from ${openTime} to ${closeTime}).`, 400);
    }
  }
  // If park is closed, deny
  if (park?.status !== 'open') {
    throw new CustomError('Park is closed.', 400);
  }

  // If facility is closed, deny
  if (facility?.status?.state !== 'open') {
    throw new CustomError('Facility is closed.', 400);
  }

  logger.info("If passes are not required on the booking date, deny")

  // If passes are not required on the booking date, deny
  const bookingPSTShortDate = bookingPSTDateTime.toISODate();
  const bookingPSTDayOfWeek = bookingPSTDateTime.setLocale('en-CA').weekday;
  if (facility.bookingDays[bookingPSTDayOfWeek] === false) {
    // passes are not required, unless it is a holiday listed within the facility.
    // check if it is a holiday
    if (facility.bookableHolidays.indexOf(bookingPSTShortDate) === -1) {
      logger.info('Booking not required');
      throw new CustomError('Passes are not required at this facility on the requested date.', 400);
    }
  }
  logger.info("If booking date is too close to current date, deny")

  // If the requested booking date is too far in the future, deny.
  const bookingDaysAhead
    = facility.bookingDaysAhead === null ? DEFAULT_BOOKING_DAYS_AHEAD : facility.bookingDaysAhead;
  // the latest you can book is the current timestamp + number of advance booking days
  // eg1 current time is 11:30am 2023/01/01 PST, opening hour 7, bookingDaysAhead 3. Latest day you can book is 2023/01/04.
  // eg2 current time is 6:59am 2023/01/01 PST, opening hour 7, bookingDaysAhead 3. Latest day you can book is 2023/01/03.
  const futurePSTDateTimeMax = currentPSTDateTime.plus({ days: bookingDaysAhead });
  if (bookingPSTDateTime > futurePSTDateTimeMax && !permissionObject.isAdmin) {
    logger.info("Booking date in the future invalid");
    throw new CustomError('You cannot book for a date that far ahead.', 400);
  }

}

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


module.exports = {
  checkIfPassExists,
  getAdminLinkToPass,
  getAdminPortalURL,
  getPersonalizationAttachment,
  isBookingAllowed,
  sendSQSMessage,
  sendTemplateSQS
};
