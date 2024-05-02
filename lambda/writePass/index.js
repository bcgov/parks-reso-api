/**
 * Lambda function for handling the creation and management of passes.
 *
 * @param {Object} event - The event object containing the request details.
 * @param {Object} context - The context object containing the runtime information.
 * @returns {Promise<Object>} - A promise that resolves to the response object.
 */
const AWS = require('aws-sdk');
const { verifyJWT } = require('../jwtUtil');
const SECRET = process.env.JWT_SECRET || 'defaultSecret';
const ALGORITHM = process.env.ALGORITHM || 'HS384';
const {
  DEFAULT_PM_OPENING_HOUR,
  PASS_HOLD_STATUS,
  TABLE_NAME,
  TIMEZONE,
  checkPassExists,
  convertPassToReserved,
  dynamodb,
  getConfig,
  getFacility,
  getOne,
  getPark,
  storeObject
} = require('../dynamoUtil');
const { sendResponse, checkWarmup, CustomError } = require('../responseUtil');
const { decodeJWT, resolvePermissions, validateToken, verifyHoldToken } = require('../permissionUtil');
const { DateTime } = require('luxon');
const { logger } = require('../logger');
const { createNewReservationsObj } = require('../reservationObjUtils');
const {
  getAdminLinkToPass,
  getPersonalizationAttachment,
  isBookingAllowed,
  sendTemplateSQS
} = require('../passUtils');

const { generateRegistrationNumber } = require('../jwtUtil');
const jwt = require('jsonwebtoken');

// default opening/closing hours in 24h time
const DEFAULT_AM_OPENING_HOUR = 7;

exports.handler = async (event, context) => {
  logger.debug('WritePass:', event);

  if (!event) {
    logger.info('There was an error in your submission:');
    return sendResponse(400, { msg: 'There was an error in your submission.', title: 'Bad Request' },
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
      return await putPassHandler(event, permissionObject, newObject);
    } else if (event.httpMethod === 'OPTIONS') {
      return sendResponse(200, {});
    }

    // HardCode Adjustment
    newObject = checkForHardCodeAdjustment(newObject);

    // If committing to secure the pass
    if (newObject.commit) {
      return await handleCommitPass(newObject, permissionObject.isAdmin);
    } else {
      return await handleHoldPass(newObject, permissionObject.isAdmin);
    }
  } catch (err) {
    logger.info('Operation Failed');
    logger.error('err', err.message);
    return sendResponse(err.statusCode, { msg: err.message, title: 'Operation Failed' });
  }
};

async function handleCommitPass(newObject, isAdmin) {
  let {
    parkOrcs, // TODO: Embed this in the JWT we put into the hold
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
  let type;
  // Do extra checks if user is not sysadmin.
  if (!isAdmin) {
    try {
      // Check if the user has a valid token, ensuring it has not expired
      logger.info('Checking if the user has a valid token, ensuring it has not expired.');
      decodedToken =  verifyHoldToken(token, SECRET);
      logger.info('Decoded Token');
      console.log(decodedToken);

      bookingPSTDateTime = DateTime.fromISO(decodedToken.date);
      type = decodedToken.type;

      // try to find this token in the database
      const jwt = await getOne('jwt', token);
      if (jwt && Object.keys(jwt).length > 0) {
        // The JWT is found, therefore continue with the request.
        logger.info('JWT found.');

        // Check if the JWT is expired
        console.log('checking jwt expiry', decodedToken);
        const jwtExpiry = DateTime.fromISO(jwt.expiry);
        console.log(jwtExpiry);
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
      pass = await checkPassExists(decodedToken.facilityName,
                                   decodedToken.email,
                                   decodedToken.type,
                                   bookingPSTDateTime.toISODate());

      // Update the pass in the database
      logger.info('Updating the pass in the database');
      pass = await convertPassToReserved(decodedToken, passStatus, firstName, lastName, email, phoneNumber);
      logger.debug(pass);
      console.log(pass)

      // delete the audit property
      delete pass.audit;
      return sendResponse(200, pass);
    } catch (error) {
      // Handle the error here
      logger.error(error);
      return sendResponse(error.statusCode, { msg: error.message, title: 'Operation Failed.' });
    }
  }

  const facilityName = decodedToken.facilityName;

  const encodedCancellationLink = generateCancellationLink(registrationNumber,
                                                           email,
                                                           parkOrcs,
                                                           bookingPSTShortDate,
                                                           type);

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

  // Send to GC Notify
  try {
    logger.info('Posting to GC Notify');
    await sendTemplateSQS(facilityData.type, personalisation, pass);
  } catch (err) {
    logger.info(
      `Sending SQS msg error, return 200 anyway. Registration number: ${JSON.stringify(
        pass['registrationNumber']
      )}`
    );
    logger.error(err.response?.data || err);
    let errRes = AWS.DynamoDB.Converter.unmarshall(passObject.Item);
    errRes['err'] = 'Email Failed to Send';
    return sendResponse(200, errRes);
  }

  // TODO: Remove JWT from hold pass area in database.
}

// if the window is already active, activate the pass.
// check if booking same-day
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

async function handleHoldPass(newObject, isAdmin) {
  logger.debug('newObject:', newObject);
  try {
    let {
      parkOrcs,
      facilityName,
      date,
      type,
      numberOfGuests,
      token,
      ...otherProps
    } = newObject;

    // Validating turnstile token
    await validateToken(token);

    logger.info('GetFacility');
    logger.debug('parkOrcs:', parkOrcs);
    const parkData = await getPark(parkOrcs);
    logger.debug('parkData:', parkData);
    logger.debug('facilityName:', facilityName);
    const facilityData = await getFacility(parkOrcs, facilityName, isAdmin);

    // Call a function that checks the facilityData object
    numberOfGuests = checkFacilityData(facilityData, numberOfGuests);

    // check if valid booking attempt
    logger.info('Checking if booking is allowed');
    await isBookingAllowed(parkOrcs, facilityName, date, type);

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

    // Check if park is visible
    if (parkData.visible !== true) {
      logger.info('Something went wrong, park not visible.');
      // Not allowed for whatever reason.
      throw new CustomError('Something went wrong.', 400);
    }

    logger.info('Creating pass object');
    const registrationNumber = generateRegistrationNumber(10);

    // // Create the base pass object
    let passObject = createPassObject(
      parkData,
      registrationNumber,
      null,
      null,
      facilityName,
      null,
      bookingPSTDateTime,
      bookingPSTShortDate,
      type,
      numberOfGuests,
      PASS_HOLD_STATUS, // TODO: Change this to 'reserved' when we're ready to go live.
      null,
      facilityData,
      currentPSTDateTime
    );

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
    const transactionObj = generateTrasactionObject(parkData,
      facilityName,
      reservationsObjectPK,
      bookingPSTShortDate,
      type,
      numberOfGuests
    );

    logger.info('Performing transaction');
    logger.debug(transactionObj);

    // Perform the transaction, retrying if necessary
    await transactWriteWithRetries(transactionObj); // TODO: Set a retry limit if 3 isn't enough.

    logger.info('Transaction complete');

    // delete passObject.Item['audit'];
    // return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(passObject.Item));

    // Return the jwt'd pass object for the front end with a 7 minute expiry time.
    console.log("/faK", passObject.Item);
    const holdPassJwt = jwt.sign(AWS.DynamoDB.Converter.unmarshall(passObject.Item),
                                 SECRET,
                                 { algorithm: ALGORITHM, expiresIn: '7m'});

    // Store the jwt, as well as the registration number, and the expiry time in DynamoDB
    await storeHoldPassJwt(holdPassJwt);

    // TODO: Setup a job to prune JWTs from the database after 7m
    return sendResponse(200, holdPassJwt);
  } catch (error) {
    logger.info('Operation Failed');
    logger.error('err', error.message);
    return sendResponse(error.statusCode, { msg: error.message, title: 'Operation Failed' });
  }
};

async function storeHoldPassJwt(holdPassJwt) {
  try {
    let retries = 0;
    let success = false;
    while (retries < 3 && !success) {
      try {
        await storeObject({
          'pk': 'jwt',
          'sk': holdPassJwt
        });
        success = true;
      } catch (error) {
        retries++;
        if (retries === 3) {
          throw error;
        }
      }
    }
  } catch (error) {
    logger.error('Failed to store JWT in DynamoDB:', error);
    throw new CustomError('Failed to store JWT in DynamoDB', 500);
  }
}

async function transactWriteWithRetries(transactionObj, maxRetries = 3) {
  let retryCount = 0;
  let res;
  do {
    try {
      logger.info('Writing Transact obj.');
      logger.debug('Transact obj:', JSON.stringify(transactionObj));
      res = await dynamodb.transactWriteItems(transactionObj).promise();
      logger.debug('Res:', res);
      break; // Break out of the loop if transaction succeeds
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
          if (cancellationReasons[1] != 'None') {
            logger.info(`Sold out of passes: ${parkData.name} / ${facilityName}`);
            message =
              'We have sold out of allotted passes for this time, please check back on the site from time to time as new passes may come available.';
            throw new CustomError(message, 400);
          } else if (cancellationReasons[2] != 'None') {
            message = 'Error creating pass.';
            logger.info(message);
            throw new CustomError(message, 400);
          }
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
  }

  if (facilityData.type === 'Parking') {
    numberOfGuests = 1;
  }

  return numberOfGuests;
}

/**
 * Sends a template message and deletes the audit item.
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
    email_address: passObject.Item['email'].S,
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
 * @param {Date} currentPSTDateTime - The current date and time in PST.
 * @returns {Object} The pass object.
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
  passObject.Item['facilityName'] = { S: facilityName };
  passObject.Item['date'] = { S: bookingPSTDateTime.toUTC().toISO() };
  passObject.Item['shortPassDate'] = { S: bookingPSTShortDate };
  passObject.Item['type'] = { S: type };
  passObject.Item['registrationNumber'] = { S: registrationNumber };
  passObject.Item['numberOfGuests'] = AWS.DynamoDB.Converter.input(numberOfGuests);
  if (status != null) {
    passObject.Item['passStatus'] = { S: status };
  }
  if (phoneNumber != null) {
    passObject.Item['phoneNumber'] = AWS.DynamoDB.Converter.input(phoneNumber);
  }
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
  // // Temporarily assign the QRCode Link for the front end not to guess at it.
  if (facilityData.qrcode === true) {
    passObject.Item['adminPassLink'] = { S: getAdminLinkToPass(parkData.sk, registrationNumber.toString()) };
  }

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
function generateTrasactionObject(parkData, facilityName, reservationsObjectPK, bookingPSTShortDate, type, numberOfGuests, passObject = undefined) {
  
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
  ];

  // If passObject is provided, add it to the transaction object
  if (passObject !== undefined) {
    TransactItems.push({
      Put: passObject
    });
  }

  return {
    TransactItems
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

  const res = await dynamodb.updateItem(updateParams).promise();
  return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(res.Attributes));
}

/**
 * Handles the PUT request for updating a pass.
 *
 * @param {Object} event - The event object containing the request details.
 * @param {Object} permissionObject - The permission object containing authentication details.
 * @param {Object} passObj - The pass object to be modified.
 * @returns {Promise<Object>} - A promise that resolves to the response object.
 */
async function putPassHandler(event, permissionObject, passObj) {
  logger.info("putPassHandler");
  logger.info(permissionObject.isAuthenticated);
  if (!permissionObject.isAuthenticated) {
    throw new CustomError('You are not authorized to perform this operation.', 403);
  }

  // Only support check-in
  if (event?.queryStringParameters?.checkedIn === 'true') {
    return await modifyPassCheckInStatus(passObj.pk, passObj.sk, true);
  } else if (event?.queryStringParameters?.checkedIn === 'false') {
    return await modifyPassCheckInStatus(passObj.pk, passObj.sk, false);
  } else {
    throw new CustomError('Bad Request - invalid query string parameters', 400);
  }
}
