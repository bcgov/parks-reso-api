<<<<<<< HEAD:lambda/writePass/index.js
const AWS = require('aws-sdk');
const { verifyJWT } = require('../captchaUtil');
=======
const jwt = require('jsonwebtoken');
const { DateTime } = require('luxon');
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js
const {
  dynamodb,
  TABLE_NAME,
  TIMEZONE,
<<<<<<< HEAD:lambda/writePass/index.js
=======
  checkPassExists,
  convertPassToReserved,
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js
  getFacility,
  getPark,
<<<<<<< HEAD:lambda/writePass/index.js
  getConfig,
  DEFAULT_PM_OPENING_HOUR
} = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { decodeJWT, resolvePermissions } = require('../permissionUtil');
const { DateTime } = require('luxon');
const { logger } = require('../logger');
const { createNewReservationsObj } = require('../reservationObjUtils');
const { getPersonalizationAttachment, getAdminLinkToPass, isBookingAllowed } = require('../passUtils');
const { sendSQSMessage } = require('../sqsUtils');
const { checkIfPassExists } = require('../passUtils');
const { generateRegistrationNumber } = require('../captchaUtil');
=======
  storeObject,
  sendResponse,
  checkWarmup,
  CustomError,
  logger,
  unmarshall,
  dynamoClient,
  TransactWriteItemsCommand,
  UpdateItemCommand
} = require('/opt/baseLayer'); 
const {
  decodeJWT,
  deleteHoldToken,
  getExpiryTime,
  resolvePermissions,
  validateToken,
  verifyHoldToken
} = require('/opt/permissionLayer');
const {
  getAdminLinkToPass,
  getPersonalizationAttachment,
  isBookingAllowed,
  sendTemplateSQS,
  sendExpirationSQS
} = require('/opt/passLayer');
const { createNewReservationsObj } = require('/opt/reservationLayer'); 
const { generateRegistrationNumber } = require('/opt/jwtLayer');
const SECRET = process.env.JWT_SECRET || 'defaultSecret';
const ALGORITHM = process.env.ALGORITHM || 'HS384';
const HOLD_PASS_TIMEOUT = process.env.HOLD_PASS_TIMEOUT || '7m';
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js

// default opening/closing hours in 24h time
const DEFAULT_AM_OPENING_HOUR = 7;

process.on('unhandledRejection', (reason, promise) => {
  logger.info('Unhandled Rejection at:', promise, 'reason:', reason);
  // Handle the error, throw, or exit gracefully as needed
});

exports.handler = async (event, context) => {
  logger.debug('WritePass:', event);

  if (!event) {
    logger.info('There was an error in your submission:');
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
    console.log("in the handler for test")
    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);

    let newObject = JSON.parse(event.body);
    // Check for update method (check this pass in)
    if (event.httpMethod === 'PUT') {
<<<<<<< HEAD:lambda/writePass/index.js
      return putPassHandler(event, context, permissionObject, newObject);
=======
      return await putPassHandler(event, permissionObject, newObject);
    } else if (event?.httpMethod === 'OPTIONS') {
      return sendResponse(200, {});
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js
    }

    // HardCode Adjustment
    newObject = checkForHardCodeAdjustment(newObject);

<<<<<<< HEAD:lambda/writePass/index.js
    // http POST (new)
=======
    // If committing to secure the pass
    if (newObject.commit) {
      return await handleCommitPass(newObject, permissionObject.isAdmin);
    } else {
      let value = await handleHoldPass(newObject, permissionObject.isAdmin);
      return value
    }
  } catch (err) {
    logger.info('Operation Failed');
    logger.error('err', err.message);
    return sendResponse(err.statusCode, { msg: err.message, title: 'Operation Failed' });
  }
};

/**
 * Handles the commit of a pass.
 *
 * @param {Object} newObject - The new object containing pass information.
 * @param {boolean} isAdmin - Indicates whether the user is an admin.
 * @returns {Promise} - A promise that resolves when the pass is committed.
 * @throws {CustomError} - If there is an error during the commit process.
 */
async function handleCommitPass(newObject, isAdmin) {
  const {
    parkOrcs,
    firstName,
    lastName,
    phoneNumber,
    email,
    token,
    ...otherProps
  } = newObject;

  // This populates when there is a pass created.
  let pass;
  let decodedToken;
  let bookingPSTDateTime;
  let bookingPSTShortDate;
  let type;
  let facilityName;

  const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };

  // Do extra checks if user is not sysadmin.
  if (!isAdmin) {
    try {
      // Check if the user has a valid token, ensuring it has not expired
      logger.info('Checking if the user has a valid token, ensuring it has not expired.');
      decodedToken =  verifyHoldToken(token, SECRET);
      logger.info('Decoded Token');

      facilityName = decodedToken.facilityName;

      bookingPSTDateTime = DateTime.fromISO(decodedToken.date);
      bookingPSTShortDate = bookingPSTDateTime.toISODate();
      type = decodedToken.type;

      // Try to find this token in the database, if not it's not a valid token
      const jwt = await getOne('jwt', token);
      if (jwt && Object.keys(jwt).length > 0) {
        // The JWT is found, therefore continue with the request.
        logger.info('JWT found.');
        // Check if the JWT is expired
        logger.info('Checking JWT expiry');
        logger.debug(JSON.stringify(decodedToken));
        const jwtExpiry = DateTime.fromISO(jwt.expiry);
        if (jwtExpiry < DateTime.now().setZone(TIMEZONE)) {
          // The JWT is expired, therefore reject this request.
          logger.info('JWT is expired.');
          throw new CustomError('JWT is expired.', 400);
        }
      } else {
        // The JWT is missing, therefore reject this request.
        logger.info('JWT not found.');
        throw new CustomError('JWT not found.', 400);
      }

      // Check if the booking window is already active
      const currentPSTDateTime = DateTime.now().setZone(TIMEZONE);
      logger.info('Checking pass status based on current time');
      const passStatus = checkPassStatusBasedOnCurrentTime(currentPSTDateTime,
                                                           bookingPSTDateTime,
                                                           type);
      // Does the pass already exist in the database?
      logger.info('Checking if the pass already exists in the database');
      await checkPassExists(decodedToken.facilityName,
                            email,
                            decodedToken.type,
                            bookingPSTShortDate);

      // Update the pass in the database
      logger.info('Updating the pass in the database');
      pass = await convertPassToReserved(decodedToken,
                                         passStatus,
                                         firstName,
                                         lastName,
                                         email,
                                         phoneNumber);
      logger.debug(JSON.stringify(pass));
      pass.registrationNumber = decodedToken.sk
      
      // delete the audit property before returning back to FE.
      delete pass.audit;
    } catch (error) {
      logger.error(error);
      return sendResponse(error.statusCode, { msg: error.message, title: 'Operation Failed.' });
    }

    // Delete the JWT from the database
    logger.info('Deleting the JWT from the database');
    await deleteHoldToken(token);
  }

  logger.info('generateCancellationLink');
  const encodedCancellationLink = generateCancellationLink(pass.registrationNumber,
                                                           email,
                                                           parkOrcs,
                                                           bookingPSTShortDate,
                                                           type);

  const formattedBookingDate = bookingPSTDateTime.toLocaleString(dateOptions);

  const parkData = await getPark(decodedToken.parkOrcs);
  logger.debug('parkData', parkData)
  const facilityData = await getFacility(decodedToken.parkOrcs, facilityName, false);
  logger.debug('facilityData', facilityData)
  logger.info('personalization')
  let personalization = {
    firstName: firstName,
    lastName: lastName,
    date: formattedBookingDate,
    type: type === 'DAY' ? 'ALL DAY' : type,
    facilityName: facilityName,
    numberOfGuests: decodedToken.numberOfGuests.toString(),
    registrationNumber: pass.registrationNumber,
    cancellationLink: encodedCancellationLink,
    parkName: parkData.name,
    mapLink: parkData.mapLink || null,
    parksLink: parkData.bcParksLink,
    ...(await getPersonalizationAttachment(parkData.sk, pass.registrationNumber, facilityData.qrcode))
  };
  // Send to GC Notify
  try {
    logger.info('Posting to GC Notify');
    console.log("About to send this templateSQS: ")
    await sendTemplateSQS(facilityData.type, personalization, pass, "GCN");
    console.log("After the send templateSQS GCnotify ")
  } catch (err) {
    logger.info(
      `Sending SQS msg error, return 200 anyway. Registration number: ${JSON.stringify(
        pass.registrationNumber
      )}`
    );
    logger.error(err.response?.data || err);
    return sendResponse(200, pass);
  }
  return sendResponse(200, pass);
  // TODO: Remove JWT from hold pass area in database.
}

/**
 * Checks the pass status based on the current time and booking time. If the window is already active, activate the pass
 * check if booking same-day
 *
 * @param {Moment} currentPSTDateTime - The current Pacific Standard Time (PST) date and time.
 * @param {Moment} bookingPSTDateTime - The booking Pacific Standard Time (PST) date and time.
 * @param {string} type - The type of pass ('AM' or 'PM').
 * @returns {string} - The pass status ('active' or 'reserved').
 */
function checkPassStatusBasedOnCurrentTime(currentPSTDateTime, bookingPSTDateTime, type) {
  let openingHour = DEFAULT_AM_OPENING_HOUR;
  if (currentPSTDateTime.get('day') === bookingPSTDateTime.get('day')) {
    if (type === 'PM') {
      openingHour = DEFAULT_PM_OPENING_HOUR;
    }
    if (currentPSTDateTime.get('hour') >= openingHour) {
      return 'active';
    }
  }
  return 'reserved';
}

/**
 * Generates a cancellation link for a pass.
 *
 * @param {string} registrationNumber - The registration number of the pass.
 * @param {string} email - The email associated with the pass.
 * @param {string} parkOrcs - The park orcs associated with the pass.
 * @param {string} bookingPSTShortDate - The booking date of the pass in PST short format.
 * @param {string} type - The type of the pass.
 * @returns {string} - The generated cancellation link.
 */
function generateCancellationLink(registrationNumber, email, parkOrcs, bookingPSTShortDate, type) {
  return encodeURI(process.env.PUBLIC_FRONTEND +
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
    type);
}

/**
 * Handles the process of holding a pass.
 *
 * @param {Object} newObject - The new object containing pass details.
 * @param {boolean} isAdmin - Indicates whether the user is an admin.
 * @returns {Promise<Object>} - A promise that resolves to the response object.
 * @throws {CustomError} - If an error occurs during the process.
 */
async function handleHoldPass(newObject, isAdmin) {
  logger.debug('newObject:', newObject);
  try {
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js
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

    logger.info('GetFacility');
    logger.debug(permissionObject.roles);
    const parkData = await getPark(parkOrcs);
    const facilityData = await getFacility(parkOrcs, facilityName, permissionObject.isAdmin);

    if (Object.keys(facilityData).length === 0) {
      throw 'Facility not found.';
    }

    let registrationNumber;
    if (!permissionObject.isAdmin) {
      // Do extra checks if user is not sysadmin.
      if (!captchaJwt || !captchaJwt.length) {
        logger.info('Missing CAPTCHA verification');
        return sendResponse(400, {
          msg: 'Missing CAPTCHA verification.',
          title: 'Missing CAPTCHA verification'
        });
      }

      const verification = verifyJWT(captchaJwt);
      if (!verification.valid
          || !verification.registrationNumber
          || !verification.orcs
          || !verification.facility
          || !verification.bookingDate
          || !verification.passType)
      {
        logger.info('CAPTCHA verification failed');
        return sendResponse(400, {
          msg: 'CAPTCHA verification failed.',
          title: 'CAPTCHA verification failed'
        });
      }

      // Check if pass already exists
      if (await checkIfPassExists(verification.orcs, verification.registrationNumber, verification.facility)) {
        logger.info('Pass already exists');
        return sendResponse(400, {
          msg: 'This pass already exsits.',
          title: 'Pass exists'
        });
      } else {
        registrationNumber = verification.registrationNumber;
      }
      // Enforce maximum limit per pass
      if (facilityData.type === 'Trail' && numberOfGuests > 4) {
        logger.info('Too many guests');
        return sendResponse(400, {
          msg: 'You cannot have more than 4 guests on a trail.',
          title: 'Too many guests'
        });
      }

      if (facilityData.type === 'Parking') {
        numberOfGuests = 1;
      }
    } else {
      // If the user is an Admin, generate a reg number
      registrationNumber = generateRegistrationNumber(10);
    }

    // numberOfGuests cannot be less than 1.
    if (numberOfGuests < 1) {
      logger.info('Invalid number of guests:', numberOfGuests);
      return sendResponse(400, {
        msg: 'Passes must have at least 1 guest.',
        title: 'Invalid number of guests'
      });
    }

    // check if valid booking attempt
    const isBookingAttemptValid = await isBookingAllowed(parkOrcs, facilityName, date, type);
    if (!isBookingAttemptValid || !isBookingAttemptValid.valid) {
      return sendResponse(400, {
        msg: isBookingAttemptValid.reason || 'Booking failed.',
        title: 'Booking date in the past'
      })
    }

    // the timestamp this script was run
    const currentPSTDateTime = DateTime.now().setZone(TIMEZONE);
    // the date of booking
    let openingHour = facilityData.bookingOpeningHour || DEFAULT_AM_OPENING_HOUR;
    const bookingPSTDateTime = DateTime.fromISO(date).setZone(TIMEZONE).set({
      hour: openingHour,
      minutes: 0,
      seconds: 0,
      milliseconds: 0
    });
    const bookingPSTShortDate = bookingPSTDateTime.toISODate();

    // set pass status
    let status = 'reserved';

<<<<<<< HEAD:lambda/writePass/index.js
    // if the window is already active, activate the pass.
    // check if booking same-day
    if (currentPSTDateTime.get('day') === bookingPSTDateTime.get('day')) {
      if (type === 'PM') {
        openingHour = DEFAULT_PM_OPENING_HOUR;
      }
      if (currentPSTDateTime.get('hour') >= openingHour) {
        status = 'active';
      }
    }

    // Create the base pass object
=======
    logger.info('Creating pass object');
    const registrationNumber = generateRegistrationNumber(10);
    // // Create the base pass object
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js
    let passObject = createPassObject(
      parkData,
      registrationNumber,
      firstName,
      lastName,
      facilityName,
      email,
      bookingPSTDateTime,
      bookingPSTShortDate,
      type,
      numberOfGuests,
      status,
      phoneNumber,
      facilityData,
      currentPSTDateTime
    );
<<<<<<< HEAD:lambda/writePass/index.js

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
            FilterExpression: 'email = :email AND #type = :type AND passStatus IN (:reserved, :active)',
            ExpressionAttributeNames: {
              '#type': 'type'
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
            logger.info('Running existingPassCheckObject');
            existingItems = await dynamodb.query(existingPassCheckObject).promise();
          } catch (error) {
            logger.info('Error while running query for existingPassCheckObject');
            logger.error(error);
            throw error;
          }
=======
    // Here, we must create/update a reservation object
    // https://github.com/bcgov/parks-reso-api/wiki/Models

    // TODO: We need to change park name in the PK to use orcs instead.
    const reservationsObjectPK = `reservations::${parkData.sk}::${facilityName}`;

    const bookingTimeTypes = Object.keys(facilityData.bookingTimes);
    if (!bookingTimeTypes.includes(type)) {
      // Type given does not exist in the facility.
      logger.info('Booking Time Type Error: type provided does not exist in facility');
      logger.error('Write Pass', bookingTimeTypes, type);
      throw new CustomError('Type provided does not exist in facility.', 400);
    }

    logger.info('Creating reservations object');
    // We need to ensure that the reservations object exists.
    // Attempt to create reservations object. If it fails, so what...
    await createNewReservationsObj(facilityData, reservationsObjectPK, bookingPSTShortDate);
    logger.info('numberOfGuests:', numberOfGuests);

    // // Perform a transaction where we decrement the available passes and create the pass
    // // If the conditions where the related facility object has a lock, we then fail the whole transaction.
    // // This is to prevent a race condition related to available pass tallies.
    // passObject.ReturnValuesOnConditionCheckFailure = 'ALL_OLD';
    logger.info('Creating transaction object');
    const transactionObj = generateTransactionObject(parkData,
      facilityName,
      reservationsObjectPK,
      bookingPSTShortDate,
      type,
      numberOfGuests,
      passObject
    );

    logger.info('Performing transaction');
    logger.debug(transactionObj);

    // Perform the transaction, retrying if necessary
    await transactWriteWithRetries(transactionObj); // TODO: Set a retry limit if 3 isn't enough.
    logger.info('Transaction complete');

    delete passObject.Item['audit'];

    // Return the jwt'd pass object for the front end with a 7 minute expiry time.
    passObject.Item['parkOrcs'] = { S: parkOrcs };
    const holdPassJwt = jwt.sign(unmarshall(passObject.Item),
                                 SECRET,
                                 { algorithm: ALGORITHM, expiresIn: HOLD_PASS_TIMEOUT});
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js

          if (existingItems.Count === 0) {
            logger.debug('No existing pass found. Creating new pass...');
          } else {
            logger.info(
              `email account already has a reservation. Registration number: ${JSON.stringify(
                existingItems?.Items[0]?.registrationNumber
              )}, Orcs: ${parkData.sk}`
            );
            return sendResponse(400, {
              title: 'This email account already has a reservation for this booking time.',
              msg: 'A reservation associated with this email for this booking time already exists. Please check to see if you already have a reservation for this time. If you do not have an email confirmation of your reservation please contact <a href="mailto:parkinfo@gov.bc.ca">parkinfo@gov.bc.ca</a>'
            });
          }
        } catch (err) {
          logger.info(
            `Error on check existing pass for the same facility, email, type and date. Registration number: ${registrationNumber}, Orcs: ${parkData.sk}`
          );
          logger.error(err);
          return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
        }
      }

<<<<<<< HEAD:lambda/writePass/index.js
      // Here, we must create/update a reservation object
      // https://github.com/bcgov/parks-reso-api/wiki/Models
=======
    //Send message to expiration queue
    try {
      logger.info('Posting to expirationQueue');
      console.log("About to send this expirationsqs!: ")
      await sendExpirationSQS();  
    } catch (err) {
      logger.info(`Error with the ExpirationSQS`);
      logger.error(err.response?.data || err);
    }
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js

      // TODO: We need to change park name in the PK to use orcs instead.
      const reservationsObjectPK = `reservations::${parkData.sk}::${facilityName}`;

<<<<<<< HEAD:lambda/writePass/index.js
      const bookingTimeTypes = Object.keys(facilityData.bookingTimes);
      if (!bookingTimeTypes.includes(type)) {
        // Type given does not exist in the facility.
        logger.info('Booking Time Type Error: type provided does not exist in facility');
        logger.error('Write Pass', bookingTimeTypes, type);
        return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
      }
=======
    // TODO: Setup a job to prune  JWTs from the database after 7m. Remove the held passes (pk::xxxx, sk: 112345)
    return sendResponse(200, holdPassJwt);
  } catch (error) {
    logger.info('Operation Failed');
    logger.error('err', error.message);
    return sendResponse(error.statusCode, { msg: error.message, title: 'Operation Failed' });
  }
};
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js

      // We need to ensure that the reservations object exists.
      // Attempt to create reservations object. If it fails, so what...
      await createNewReservationsObj(facilityData, reservationsObjectPK, bookingPSTShortDate);

      // Perform a transaction where we decrement the available passes and create the pass
      // If the conditions where the related facility object has a lock, we then fail the whole transaction.
      // This is to prevent a race condition related to available pass tallies.
      passObject.ReturnValuesOnConditionCheckFailure = 'ALL_OLD';
      const transactionObj = generateTrasactionObject(parkData,
                                                      facilityName,
                                                      reservationsObjectPK,
                                                      bookingPSTShortDate,
                                                      type,
                                                      numberOfGuests,
                                                      passObject
                                                     );
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
        passObject.Item['adminPassLink'] = { S: getAdminLinkToPass(parkData.sk, registrationNumber.toString()) };
      }

<<<<<<< HEAD:lambda/writePass/index.js
      try {
        logger.info('Posting to GC Notify');
        passObject = await sendTemplateMessageAndDeleteAuditItem(facilityData.type, personalisation, passObject);
        return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(passObject.Item));
      } catch (err) {
        logger.info(
          `GCNotify error, return 200 anyway. Registration number: ${JSON.stringify(
            passObject?.Item['registrationNumber']
          )}`
        );
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
=======
/**
 * Executes a transaction write operation with retries.
 *
 * @param {Object} transactionObj - The transaction object to be written.
 * @param {number} [maxRetries=3] - The maximum number of retries in case of failure.
 * @returns {Promise} - A promise that resolves with the result of the transaction write operation.
 * @throws {CustomError} - If the transaction fails after the maximum number of retries.
 */
async function transactWriteWithRetries(transactionObj, maxRetries = 3) {
  let retryCount = 0;
  let res;
  try{
    do {
      try {
        logger.info('Writing Transact obj.');
        logger.debug('Transact obj:', JSON.stringify(transactionObj));
        const command = new TransactWriteItemsCommand({
          TransactItems: transactionObj.TransactItems
        });
        res = await dynamoClient.send(command);
        logger.debug('Res:', res);
        return
      } catch (error) {
        logger.info('Transaction failed:', error.code);
        logger.error(error);
        if (error.code === 'TransactionCanceledException') {
          let cancellationReasons = error.message.slice(error.message.lastIndexOf('[') + 1);
          cancellationReasons = cancellationReasons.slice(0, -1);
          cancellationReasons = cancellationReasons.split(', ');
          let message = error.message;
          let reasonIndex = this.cancellationReasons.findIndex((i) => i !== 'None');
          if (reasonIndex > -1) {
            switch (reasonIndex) {
              case 0:
                logger.info('Facility is currently locked');
                message = 'An error has occured, please try again.';
                break;
              case 1:
                logger.info(`Sold out of passes: ${parkData.name} / ${facilityName}`);
                message =
                  'We have sold out of allotted passes for this time, please check back on the site from time to time as new passes may come available.';
                break;
              case 2:
              default:
                message = 'Error creating pass.';
                logger.info(message);
                break;
            }
            throw new CustomError(message, 400);
          }
          if (retryCount === maxRetries) {
            logger.info('Retry limit reached');
            throw new CustomError(message, 400);
          }
          retryCount++;
        } else {
          throw new CustomError(error.message, 400);
        }
      }
    } while (retryCount < maxRetries);
  }catch(error){
  }
};

function checkFacilityData(facilityData, numberOfGuests) {
  if (Object.keys(facilityData).length === 0) {
    throw new CustomError('Facility not found.', 400);
  }

  // Enforce maximum limit per pass
  if (facilityData.type === 'Trail' && numberOfGuests > 4) {
    logger.info('Too many guests');
    throw new CustomError('You cannot have more than 4 guests on a trail.', 400);
  }

  // numberOfGuests cannot be less than 1.
  if (numberOfGuests < 1) {
    logger.info('Invalid number of guests:', numberOfGuests);
    throw new CustomError('Passes must have at least 1 guest.', 400);
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js
  }
};

/**
 * Sends a template message and deletes the audit item.
 * @param {string} templateId - The ID of the template.
 * @param {object} personalisation - The personalisation data for the template.
 * @param {object} passObject - The pass object.
 * @returns {object} - The updated pass object.
 */
async function sendTemplateMessageAndDeleteAuditItem(facilityType, personalisation, passObject) {
  let gcNotifyTemplate;
  // Parking?
  if (facilityType === 'Parking') {
    gcNotifyTemplate = process.env.GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID;
  } else {
    gcNotifyTemplate = process.env.GC_NOTIFY_TRAIL_RECEIPT_TEMPLATE_ID;
  }
  const gcnData = {
    email_address: passObject.Item['email'].S,
    template_id: gcNotifyTemplate,
    personalisation: personalisation
  };

  // Push this email job onto the queue so we can return quickly to the front-end
  logger.info('Sending to SQS');
  await sendSQSMessage('GCN', gcnData);
  logger.info('Sent');

  // Prune audit
  delete passObject.Item['audit'];
  logger.info(
    `Pass successfully created. Registration number: ${JSON.stringify(
      passObject?.Item['registrationNumber']
    )}, Orcs: ${passObject.Item.pk}`
  );
  return passObject;
};

/**
 * Creates a pass object with the provided data.
 *
 * @param {Object} parkData - The park data object.
 * @param {string} registrationNumber - The registration number.
 * @param {string} firstName - The first name.
 * @param {string} lastName - The last name.
 * @param {string} facilityName - The facility name.
 * @param {string} email - The email address.
 * @param {Date} bookingPSTDateTime - The booking date and time in PST.
 * @param {string} bookingPSTShortDate - The booking short date in PST.
 * @param {string} type - The type of pass.
 * @param {number} numberOfGuests - The number of guests.
 * @param {string} status - The pass status.
 * @param {string} phoneNumber - The phone number.
 * @param {Object} facilityData - The facility data object.
 * @returns {Object} - The pass object.
 */
function createPassObject(parkData,
                          registrationNumber,
                          firstName,
                          lastName,
                          facilityName,
                          email,
                          bookingPSTDateTime,
                          bookingPSTShortDate,
                          type,
                          numberOfGuests,
                          status,
                          phoneNumber,
                          facilityData,
                          currentPSTDateTime
                        ) {
  const passObject = {
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_not_exists(sk)'
  };
  passObject.Item = {};
  passObject.Item['pk'] = { S: 'pass::' + parkData.sk };
  passObject.Item['sk'] = { S: registrationNumber };
  passObject.Item['parkName'] = { S: parkData.name };
<<<<<<< HEAD:lambda/writePass/index.js
  passObject.Item['firstName'] = { S: firstName };
  passObject.Item['searchFirstName'] = { S: firstName.toLowerCase() };
  passObject.Item['lastName'] = { S: lastName };
  passObject.Item['searchLastName'] = { S: lastName.toLowerCase() };
=======
  
  if (firstName != null) {
    passObject.Item['firstName'] = { S: firstName };
    passObject.Item['searchFirstName'] = { S: firstName.toLowerCase() };
  }
  if (lastName != null) {
    passObject.Item['lastName'] = { S: lastName };
    passObject.Item['searchLastName'] = { S: lastName.toLowerCase() };
  }
  if (email != null) {
    passObject.Item['email'] = { S: email };
  }
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js
  passObject.Item['facilityName'] = { S: facilityName };
  passObject.Item['email'] = { S: email };
  passObject.Item['date'] = { S: bookingPSTDateTime.toUTC().toISO() };
  passObject.Item['shortPassDate'] = { S: bookingPSTShortDate };
  passObject.Item['type'] = { S: type };
  passObject.Item['registrationNumber'] = { S: registrationNumber };
<<<<<<< HEAD:lambda/writePass/index.js
  passObject.Item['numberOfGuests'] = AWS.DynamoDB.Converter.input(numberOfGuests);
  passObject.Item['passStatus'] = { S: status };
  passObject.Item['phoneNumber'] = AWS.DynamoDB.Converter.input(phoneNumber);
=======
  passObject.Item['numberOfGuests'] = {N: numberOfGuests.toString() }; //No more input function for v3
  if (status != null) {
    passObject.Item['passStatus'] = { S: status };
  }
  if (phoneNumber != null) {
    passObject.Item['phoneNumber'] = { S: phoneNumber };
  }
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js
  passObject.Item['facilityType'] = { S: facilityData.type };
  passObject.Item['isOverbooked'] = { BOOL: false };
  // Audit
  passObject.Item['creationDate'] = { S: currentPSTDateTime.toUTC().toISO() };
  passObject.Item['dateUpdated'] = { S: currentPSTDateTime.toUTC().toISO() };
  passObject.Item['audit'] = {
    L: [
      {
        M: {
          by: {
            S: 'system'
          },
          passStatus: {
            S: status
          },
          dateUpdated: {
            S: currentPSTDateTime.toUTC().toISO()
          }
        }
      }
    ]
  };
  return passObject;
}

/**
 * Checks for HardCode adjustment and updates the newObject if necessary.
 * If the parkName in newObject is '0015', it means an old version is running.
 * In that case, it updates the parkOrcs property to '0015' and changes the parkName to 'Mount Seymour Provincial Park'.
 * @param {Object} newObject - The object to be checked and updated if necessary.
 * @returns {Object} - The updated object.
 */
function checkForHardCodeAdjustment(newObject) {
  if (newObject.parkName === '0015') {
    // Running an old version
    newObject['parkOrcs'] = '0015';
    newObject.parkName = 'Mount Seymour Provincial Park';
  }
  return newObject;
}

<<<<<<< HEAD:lambda/writePass/index.js
function generateTrasactionObject(parkData, facilityName, reservationsObjectPK, bookingPSTShortDate, type, numberOfGuests, passObject) {
=======
/**
 * Generates a transaction object for updating DynamoDB tables.
 *
 * @param {Object} parkData - The park data object.
 * @param {string} facilityName - The facility name.
 * @param {string} reservationsObjectPK - The primary key of the reservations object.
 * @param {string} bookingPSTShortDate - The booking PST short date.
 * @param {string} type - The type of transaction.
 * @param {number} numberOfGuests - The number of guests.
 * @param {Object} [passObject=undefined] - The pass object (optional).
 * @returns {Object} - The transaction object.
 */
function generateTransactionObject(parkData, facilityName, reservationsObjectPK, bookingPSTShortDate, type, numberOfGuests, passObject = undefined) {
  let TransactItems = [
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
          ':dec': { N: numberOfGuests.toString() }
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
  ];

  // If passObject is provided, add it to the transaction object
  if (passObject !== undefined) {
    TransactItems.push({
      Put: passObject
    });
  }
>>>>>>> 00b1f9f... Sam Build Files:samNode/handlers/writePass/index.js
  return {
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
}

/**
 * Modifies the check-in status of a pass.
 *
 * @param {string} pk - The partition key of the pass.
 * @param {string} sk - The sort key of the pass.
 * @param {boolean} checkedIn - The new check-in status of the pass.
 * @returns {Promise<Object>} - A promise that resolves to the updated pass object.
 */
async function modifyPassCheckInStatus(pk, sk, checkedIn) {
  let updateParams = {
    Key: {
      pk: { S: `pass::${pk}` },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ':checkedIn': { BOOL: checkedIn }
    },
    UpdateExpression: 'set checkedIn =:checkedIn',
    ReturnValues: 'ALL_NEW',
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
  };

  if (checkedIn) {
    updateParams.ExpressionAttributeValues[':checkedInTime'] = { S: DateTime.now().setZone(TIMEZONE).toISO() };
    updateParams.UpdateExpression += ', checkedInTime =:checkedInTime';
  } else {
    // Remove time as it's irrelevant now
    updateParams.UpdateExpression += ' remove checkedInTime';
  }

  const command = new UpdateItemCommand(updateParams);
  const res = await dynamoClient.send(command);
  return sendResponse(200, unmarshall(res.Attributes));
}

/**
 * Handles the PUT request for updating a pass.
 *
 * @param {Object} event - The event object containing the request details.
 * @param {Object} context - The context object containing the runtime information.
 * @param {Object} permissionObject - The permission object containing authentication details.
 * @param {Object} passObj - The pass object to be modified.
 * @returns {Promise<Object>} - A promise that resolves to the response object.
 */
async function putPassHandler(event, context, permissionObject, passObj) {
  try {
    if (!permissionObject.isAuthenticated) {
      return sendResponse(403, {
        msg: 'You are not authorized to perform this operation.',
        title: 'Unauthorized'
      });
    }

    // Only support check-in
    if (event?.queryStringParameters?.checkedIn === 'true') {
      return await modifyPassCheckInStatus(passObj.pk, passObj.sk, true);
    } else if (event?.queryStringParameters?.checkedIn === 'false') {
      return await modifyPassCheckInStatus(passObj.pk, passObj.sk, false);
    } else {
      throw 'Bad Request - invalid query string parameters';
    }
  } catch (e) {
    logger.info('There was an error in putPassHandler');
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
