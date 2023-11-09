const qrcode = require('qrcode');
const { runQuery, TABLE_NAME, TIMEZONE, getOne, DEFAULT_BOOKING_DAYS_AHEAD } = require('./dynamoUtil');
const { logger } = require('./logger');
const { DateTime } = require('luxon');
const AWS = require('aws-sdk');

// default opening/closing hours in 24h time
const DEFAULT_AM_OPENING_HOUR = 7;
const DEFAULT_PM_OPENING_HOUR = 12;

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
  try {
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
      return false;
    } else {
      return true;
    }
  } catch (error) {
    throw error;
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
  try {
    // Get current time vs booking time information.
    // Log server DateTime.
    logger.debug(
      'Server Time Zone:',
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'undefined',
      `(${DateTime.now().toISO()})`
    );

    // Get park.
    const park = AWS.DynamoDB.Converter.unmarshall(await getOne('park', orcs));

    // Get facility.
    const facility = AWS.DynamoDB.Converter.unmarshall(await getOne(`facility::${orcs}`, facilitySk));

    // If park or facility doesn't exist, deny.
    if (!park || !facility) {
      throw 'Requested park or facility does not exist';
    }

    // If facility does not have requested pass type, deny
    logger.info('facility.bookingTimes:', facility.bookingTimes);
    logger.info('Object.keys(facility.bookingTimes):', Object.keys(facility.bookingTimes));
    logger.info('type:', type);
    if (!Object.keys(facility?.bookingTimes).includes(type)) {
      throw `Requested facility does not distribute ${type} passes.`
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

    // if booking date in the past, deny.
    if (currentPSTDateTime.startOf('day') > bookingPSTDateTime.startOf('day')) {
      // Date is definitely in the past.
      throw 'You cannot book for a date in the past.'
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
        throw 'It is too late to book an AM pass on this day (AM time slot is from ' +
        openTime +
        ' to ' +
        closeTime +
        ').';
      }
    }
    // If park is closed, deny
    if (park?.status !== 'open') {
      throw 'Park is closed.';
    }

    // If facility is closed, deny
    if (facility?.status?.state !== 'open') {
      throw 'Facility is closed.';
    }

    // If passes are not required on the booking date, deny
    const bookingPSTShortDate = bookingPSTDateTime.toISODate();
    const bookingPSTDayOfWeek = bookingPSTDateTime.setLocale('en-CA').weekday;
    if (facility.bookingDays[bookingPSTDayOfWeek] === false) {
      // passes are not required, unless it is a holiday listed within the facility.
      // check if it is a holiday
      if (facility.bookableHolidays.indexOf(bookingPSTShortDate) === -1) {
        logger.info('Booking not required');
        throw 'Passes are not required at this facility on the requested date.';
      }
    }

    // If the requested booking date is too far in the future, deny.
    const bookingDaysAhead
      = facility.bookingDaysAhead === null ? DEFAULT_BOOKING_DAYS_AHEAD : facility.bookingDaysAhead;
    // the latest you can book is the current timestamp + number of advance booking days
    // eg1 current time is 11:30am 2023/01/01 PST, opening hour 7, bookingDaysAhead 3. Latest day you can book is 2023/01/04.
    // eg2 current time is 6:59am 2023/01/01 PST, opening hour 7, bookingDaysAhead 3. Latest day you can book is 2023/01/03.
    const futurePSTDateTimeMax = currentPSTDateTime.plus({ days: bookingDaysAhead });
    if (bookingPSTDateTime > futurePSTDateTimeMax && !permissionObject.isAdmin) {
      logger.info("Booking date in the future invalid");
      throw 'You cannot book for a date that far ahead.';
    }

    // if you get here, you can book for the current date/facility/type combination.
    return { valid: true };
  } catch (error) {
    logger.error('Booking validation error:', error)
    return {
      valid: false,
      reason: error
    }
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
  getAdminLinkToPass,
  getAdminPortalURL,
  getPersonalizationAttachment,
  checkIfPassExists,
  isBookingAllowed
};
