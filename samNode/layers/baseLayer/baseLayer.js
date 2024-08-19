<<<<<<< HEAD
//Dynamo Vars
const AWS = require('aws-sdk');
const { DateTime } = require('luxon');
const TABLE_NAME = 'parksreso';
const META_TABLE_NAME = process.env.META_TABLE_NAME || 'parksreso-meta';
const METRICS_TABLE_NAME = process.env.METRICS_TABLE_NAME || 'parksreso-metrics';
const options = {
  region: 'ca-central-1'
};
options.endpoint = "http://host.docker.internal:8000"

const ACTIVE_STATUS = 'active';
const RESERVED_STATUS = 'reserved';
=======
const { ScanCommand,
  QueryCommand,
  transactWriteItems,
  TransactWriteItemsCommand,
  TransactWriteCommand,
  DeleteItemCommand,
  PutItemCommand,
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand, 
  } = require('@aws-sdk/client-dynamodb'); 
const { Lambda } = require('@aws-sdk/client-lambda');
const { S3Client, GetObjectCommand, S3 } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { SQSClient, SendMessageCommand  } = require('@aws-sdk/client-sqs');
const { DateTime } = require('luxon');
<<<<<<<< HEAD:samNode/layers/baseLayer/baseLayer.js
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME || 'ParksDUP';
const META_TABLE_NAME = process.env.META_TABLE_NAME || 'ParksMetaDUP';
const METRICS_TABLE_NAME = process.env.METRICS_TABLE_NAME || 'ParksMetricsDUP';
const AWSREGION = process.env.AWSREGION || "ca-central-1";
const DYNAMODB_ENDPOINT_URL = process.env.DYNAMODB_ENDPOINT_URL || "http://172.17.0.2:8000"
========

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';
const META_TABLE_NAME = process.env.META_TABLE_NAME || 'parksreso-meta';
const METRICS_TABLE_NAME = process.env.METRICS_TABLE_NAME || 'parksreso-metrics';
>>>>>>>> 00b1f9f... Sam Build Files:lambda/dynamoUtil.js
const options = {
  region: AWSREGION,
  endpoint: DYNAMODB_ENDPOINT_URL
};
<<<<<<<< HEAD:samNode/layers/baseLayer/baseLayer.js
const IS_OFFLINE = process.env.IS_OFFLINE || false
if (IS_OFFLINE === "True") {
  // If offline point to your local dynamo endpoint
   options.endpoint = 'http://172.17.0.2:8000';
} 

const ACTIVE_STATUS = 'active';
const RESERVED_STATUS = 'reserved';
const PASS_HOLD_STATUS = 'hold';
PASS_CANCELLED_STATUS = 'cancelled'
========

if (process.env.IS_OFFLINE) {
  options.endpoint = 'http://localhost:8000';
}
const ACTIVE_STATUS = 'active';
const RESERVED_STATUS = 'reserved';
>>>>>>>> 00b1f9f... Sam Build Files:lambda/dynamoUtil.js
>>>>>>> 00b1f9f... Sam Build Files
const EXPIRED_STATUS = 'expired';
const PASS_TYPE_AM = 'AM';
const PASS_TYPE_PM = 'PM';
const PASS_TYPE_DAY = 'DAY';
const TIMEZONE = 'America/Vancouver';
const DEFAULT_PM_OPENING_HOUR = 12;
const PASS_TYPE_EXPIRY_HOURS = {
  AM: 12,
  PM: 0,
  DAY: 0
};
const DEFAULT_BOOKING_DAYS_AHEAD = 3;
<<<<<<< HEAD
const dynamodb = new AWS.DynamoDB(options);
exports.dynamodb = new AWS.DynamoDB();
console.log(dynamodb)

//Logger vars
const { createLogger, format, transports } = require('winston');
const { combine, timestamp } = format;
const LEVEL = process.env.LOG_LEVEL || 'error';


const logger = createLogger({
  level: LEVEL,
  format: combine(
    timestamp(),
    format.printf((info) => {
      let meta = '';
      let symbols = Object.getOwnPropertySymbols(info);
      if (symbols.length == 2) {
        meta = JSON.stringify(info[symbols[1]]);
      }
      return `${info.timestamp} ${[info.level.toUpperCase()]}: ${info.message} ${meta}`;
    })
  ),
  transports: [new transports.Console()]
});
=======

<<<<<<<< HEAD:samNode/layers/baseLayer/baseLayer.js
//Create AWS Utils
const dynamoClient = new DynamoDBClient(options)
const sqsClient = new SQSClient({region: AWSREGION})
const s3Client = new S3Client({region: AWSREGION});
const lambda = new Lambda(options);
const invoke = lambda.invoke

// loggerUtil vars
const { createLogger, format, transports } = require('winston');
const { combine, timestamp } = format;
const LEVEL = process.env.LOG_LEVEL || 'error';
========
const dynamodb = new AWS.DynamoDB(options);

exports.dynamodb = new AWS.DynamoDB();
>>>>>>>> 00b1f9f... Sam Build Files:lambda/dynamoUtil.js
>>>>>>> 00b1f9f... Sam Build Files


async function setStatus(passes, status) {
  const currentPSTDateTime = DateTime.now().setZone(TIMEZONE);
  const currentTimeISO = currentPSTDateTime.toUTC().toISO();

  for (let i = 0; i < passes.length; i++) {
    let updateParams = {
      Key: {
        pk: { S: passes[i].pk },
        sk: { S: passes[i].sk }
      },
      ExpressionAttributeValues: {
        ':statusValue': { S: status },
        ':empty_list': { "L": [] },  // For pass objects which do not have an audit property.
        ':dateUpdated': { S: currentTimeISO },
        ':audit_val': {
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
                  "S": currentTimeISO
                }
              }
            }
          ]
        }
      },
      UpdateExpression: 'SET passStatus = :statusValue, audit = list_append(if_not_exists(audit, :empty_list), :audit_val), dateUpdated = :dateUpdated',
      ReturnValues: 'ALL_NEW',
<<<<<<< HEAD
      TableName: TABLE_NAME
    };

    const res = await dynamodb.updateItem(updateParams).promise();
=======
      TableName: process.env.TABLE_NAME
    };
    const command = new UpdateItemCommand(updateParams);
    const res = await dynamoClient.send(command);
>>>>>>> 00b1f9f... Sam Build Files
    logger.info(`Set status of ${res.Attributes?.type?.S} pass ${res.Attributes?.sk?.S} to ${status}`);
  }
}

<<<<<<< HEAD
// simple way to return a single Item by primary key.
async function getOne(pk, sk) {
  logger.info(`getItem: { pk: ${pk}, sk: ${sk} }`);
  const params = {
    TableName: TABLE_NAME,
    Key: AWS.DynamoDB.Converter.marshall({ pk, sk })
  };
  let item = await dynamodb.getItem(params).promise();
  return item?.Item || {};
};
=======
async function getOne(pk, sk) {
  logger.info(`getItem: { pk: ${pk}, sk: ${sk} }`);
  const params = {
    TableName: process.env.TABLE_NAME,
    Key: marshall({ pk, sk })
  };
  const command = new GetItemCommand(params);
  let item = await dynamoClient.send(command);
  
  return item?.Item || {};
}
>>>>>>> 00b1f9f... Sam Build Files

// TODO: set paginated to TRUE by default. Query results will then be at most 1 page
// (1MB) unless they are explicitly specified to retrieve more.
// TODO: Ensure the returned object has the same structure whether results are paginated or not. 
async function runQuery(query, paginated = false) {
  logger.info('query:', query);
  let data = [];
  let pageData = [];
  let page = 0;
<<<<<<< HEAD

  do {
    page++;
    if (pageData?.LastEvaluatedKey) {
      query.ExclusiveStartKey = pageData.LastEvaluatedKey;
    };
    pageData = await dynamodb.query(query).promise();
    data = data.concat(pageData.Items.map(item => {
      return AWS.DynamoDB.Converter.unmarshall(item);
    }));
    if (page < 2) {
      logger.debug(`Page ${page} data:`, data);
    } else {
      logger.info(`Page ${page} contains ${pageData.Items.length} additional query results...`);
    };
=======
  const command = new QueryCommand(query);
 
  do {
    page++;
    if (pageData?.LastEvaluatedKey) {
      command.input.ExclusiveStartKey = pageData.LastEvaluatedKey;
    }
    pageData = await dynamoClient.send(command);
    data = data.concat(
      pageData.Items.map((item) => {
        return unmarshall(item);
      })
    );
    if (page < 2) {
      logger.debug(`Page ${page} data:`, data);
    } else {
      logger.debug(
        `Page ${page} contains ${pageData.Items.length} additional query results...`
      );
    }
>>>>>>> 00b1f9f... Sam Build Files
  } while (pageData?.LastEvaluatedKey && !paginated);

  logger.info(`Query result pages: ${page}, total returned items: ${data.length}`);
  if (paginated) {
    return {
      LastEvaluatedKey: pageData.LastEvaluatedKey,
      data: data
    };
  } else {
<<<<<<< HEAD
    return data;
=======
    return data; 
>>>>>>> 00b1f9f... Sam Build Files
  };
}

// TODO: set paginated to TRUE by default. Scan results will then be at most 1 page
// (1MB) unless they are explicitly specified to retrieve more.
// TODO: Ensure the returned object has the same structure whether results are paginated or not. 
async function runScan(query, paginated = false) {
  logger.info('query:', query);
  let data = [];
  let pageData = [];
  let page = 0;
<<<<<<< HEAD

  do {
    page++;
    if (pageData?.LastEvaluatedKey) {
      query.ExclusiveStartKey = pageData.LastEvaluatedKey;
    };
    pageData = await dynamodb.scan(query).promise();
    data = data.concat(pageData.Items.map(item => {
      return AWS.DynamoDB.Converter.unmarshall(item);
=======
  let command = new ScanCommand(query)
  do {
    page++;
    if (pageData?.LastEvaluatedKey) {
      command.input.ExclusiveStartKey = pageData.LastEvaluatedKey;
    };
    pageData = await dynamoClient.send(command);
    data = data.concat(pageData.Items.map(item => {
      return unmarshall(item);
>>>>>>> 00b1f9f... Sam Build Files
    }));
    if (page < 2) {
      logger.debug(`Page ${page} data:`, data);
    } else {
      logger.info(`Page ${page} contains ${pageData.Items.length} additional scan results...`);
    };
  } while (pageData?.LastEvaluatedKey && !paginated);

  logger.info(`Scan result pages: ${page}, total returned items: ${data.length}`);
  if (paginated) {
    return {
      LastEvaluatedKey: pageData.LastEvaluatedKey,
      data: data
    };
  } else {
    return data;
  };
}

async function getConfig() {
  const config = await getOne('config', 'config');
<<<<<<< HEAD
  return AWS.DynamoDB.Converter.unmarshall(config);
=======
  return unmarshall(config);
>>>>>>> 00b1f9f... Sam Build Files
}

// get a single park by park sk.
// if not authenticated, invisible parks will not be returned.
async function getPark(sk, authenticated = false) {
<<<<<<< HEAD
  const park = await getOne('park', sk);
  if (!authenticated && !park.visible.BOOL) {
    return {};
  };
  return AWS.DynamoDB.Converter.unmarshall(park);
};

async function getParks() {
  const parksQuery = {
    TableName: TABLE_NAME,
=======
  try {
    const park = await getOne('park', sk);
    if (!authenticated && !park.visible) {
      return {}; // Return empty object if park is not visible and user is not authenticated
    }
    return unmarshall(park);

  } catch (error) {
    throw error; // Handle or propagate the error as needed
  }
}

async function getParks() {
  const parksQuery = {
    TableName: process.env.TABLE_NAME,
>>>>>>> 00b1f9f... Sam Build Files
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: 'park' }
    }
  };
  return await runQuery(parksQuery, false);
}

<<<<<<< HEAD
// get a single facility by park name & facility sk.
=======
// get a single facility by park name & facility sk. 
>>>>>>> 00b1f9f... Sam Build Files
// if not authenticated, invisible facilities will not be returned.
async function getFacility(parkSk, sk, authenticated = false) {
  const facility = await getOne(`facility::${parkSk}`, sk);
  if (!authenticated && !facility.visible.BOOL) {
    return {};
  };
<<<<<<< HEAD
  return AWS.DynamoDB.Converter.unmarshall(facility);
};

async function getFacilities(parkSk) {
  const facilitiesQuery = {
    TableName: TABLE_NAME,
=======
  return unmarshall(facility);
}

async function getFacilities(parkSk) {
  const facilitiesQuery = {
    TableName: process.env.TABLE_NAME,
>>>>>>> 00b1f9f... Sam Build Files
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: `facility::${parkSk}` }
    }
  };
  return await runQuery(facilitiesQuery);
}

const expressionBuilder = function (operator, existingExpression, newFilterExpression) {
  if (existingExpression) {
    return ` ${operator} ${newFilterExpression}`;
  } else {
    return newFilterExpression;
  }
};

const getPassesByStatus = async function (status, filterExpression = undefined) {
  logger.info(`Loading passes`, filterExpression);
<<<<<<< HEAD

  const passesQuery = {
    TableName: TABLE_NAME,
=======
  const passesQuery = {
    TableName: process.env.TABLE_NAME,
>>>>>>> 00b1f9f... Sam Build Files
    KeyConditionExpression: 'passStatus = :activeStatus',
    IndexName: 'passStatus-index'
  };

  if (filterExpression && filterExpression.FilterExpression) {
    passesQuery.FilterExpression = filterExpression.FilterExpression;
  }
  if (filterExpression && filterExpression.ExpressionAttributeValues) {
    passesQuery.ExpressionAttributeValues = filterExpression.ExpressionAttributeValues;
  }
  if (filterExpression && filterExpression.ExpressionAttributeNames) {
    passesQuery.ExpressionAttributeNames = filterExpression.ExpressionAttributeNames;
  }

  if (!passesQuery.ExpressionAttributeValues) {
    passesQuery.ExpressionAttributeValues = {};
  }
  passesQuery.ExpressionAttributeValues[':activeStatus'] = { S: status };

  logger.info("Query:", passesQuery);

  // Grab all the results, don't skip any.
  let results = [];
  let passData;
<<<<<<< HEAD
  do {
    passData = await runQuery(passesQuery, true);
    passData.data.forEach((item) => results.push(item));
    passesQuery.ExclusiveStartKey = passData.LastEvaluatedKey;
  } while (typeof passData.LastEvaluatedKey !== "undefined");

  return results;
}

const visibleFilter = function (queryObj, isAdmin) {
=======

  try{
    do {
      passData = await runQuery(passesQuery, true);
      passData.data.forEach((item) => results.push(item));
      passesQuery.ExclusiveStartKey = passData.LastEvaluatedKey;
    } while (typeof passData.LastEvaluatedKey !== "undefined");

    return results;
  }catch(error){
    console.log("Passes querry: ", passesQuery)
    console.log(process.env.TABLE_NAME)
    console.log("Failing in the do while: ", error)
    console.log("PassData", passData)
  }
}

<<<<<<<< HEAD:samNode/layers/baseLayer/baseLayer.js
/**
 * Stores an object in the specified DynamoDB table.
 * @param {Object} object - The object to be stored.
 * @param {string} [tableName=TABLE_NAME] - The name of the DynamoDB table.
 * @returns {Promise<void>} - A promise that resolves when the object is successfully stored.
 * @throws {Error} - If there is an error storing the object.
 */
async function storeObject(object, tableName = TABLE_NAME) {
  
    let res;
    logger.info('storeObject');
    logger.debug(object);
    
    const params = {
      TableName: tableName,
      Item: marshall(object)
    };
    logger.debug('Params for DynamoDB:', params);
    try {
      const command = new PutItemCommand(params)
      logger.debug('PutItem COmmand:', command);
      res = await dynamoClient.send(command) 
      logger.info(`Stored object: ${object.sk}`);
      return res; 
    } catch (err) {
      logger.error(`Error storing object: ${object.sk}`, err);
      throw err; 
    }
}

/**
 * Filters the query object based on visibility.
 *
 * @param {Object} queryObj - The query object to filter.
 * @param {boolean} isAdmin - Indicates whether the user is an admin.
 * @returns {Object} - The filtered query object.
 */
function visibleFilter(queryObj, isAdmin) {
========
const visibleFilter = function (queryObj, isAdmin) {
>>>>>>>> 00b1f9f... Sam Build Files:lambda/dynamoUtil.js
>>>>>>> 00b1f9f... Sam Build Files
  logger.info('visibleFilter:', queryObj, isAdmin);
  if (!isAdmin) {
    queryObj.ExpressionAttributeValues[':visible'] = { BOOL: true };
    queryObj.FilterExpression = 'visible =:visible';
  }
  return queryObj;
<<<<<<< HEAD
};





  function sendResponse (code, data, context) {
    const response = {
      statusCode: code,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-App-Version',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT'
      },
      body: JSON.stringify(data)
    };
    return response;
  };
  
  function checkWarmup (event) {
    if (event?.warmup === true) {
      return true;
    } else {
      return false;
    }
  }

  module.exports = {
    ACTIVE_STATUS,
    DEFAULT_BOOKING_DAYS_AHEAD,
    EXPIRED_STATUS,
    PASS_TYPE_AM,
    PASS_TYPE_PM,
    PASS_TYPE_DAY,
    RESERVED_STATUS,
    DEFAULT_PM_OPENING_HOUR,
    PASS_TYPE_EXPIRY_HOURS,
    TIMEZONE,
    TABLE_NAME,
    META_TABLE_NAME,
    METRICS_TABLE_NAME,
    dynamodb,
    setStatus,
    runQuery,
    runScan,
    getOne,
    getConfig,
    getPark,
    getParks,
    getFacility,
    getFacilities,
    getPassesByStatus,
    expressionBuilder,
    visibleFilter,
    logger,
    sendResponse,
    checkWarmup

  };
=======
}

<<<<<<<< HEAD:samNode/layers/baseLayer/baseLayer.js
/**
 * Checks if a pass exists for the given parameters.
 *
 * @param {string} facilityName - The name of the facility.
 * @param {string} email - The email associated with the pass.
 * @param {string} type - The type of pass.
 * @param {string} bookingPSTShortDate - The short date of the booking in PST timezone (YYYY-MM-DD).
 * @throws {CustomError} Throws an error if the booking date is invalid or if a reservation already exists.
 */
async function checkPassExists(facilityName, email, type, bookingPSTShortDate) {
  const existingPassCheckObject = {
    TableName: process.env.TABLE_NAME,
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
  

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingPSTShortDate)) {
    throw new CustomError('Invalid booking date.', 400);
  }

  const command = new QueryCommand(existingPassCheckObject);
  let existingItems;
  try {
    logger.info('Running existingPassCheckObject'); 
    logger.debug(JSON.stringify(existingPassCheckObject));
    existingItems = await dynamoClient.send(command);
  } catch (error) {
    logger.info('Error while running query for existingPassCheckObject');
    logger.error(error);
    throw new CustomError('Error while running query for existingPassCheckObject', 400);
  }

  if (existingItems.Count > 0) {
    logger.info(
      `email account already has a reservation. Registration number: ${JSON.stringify(
        existingItems?.Items[0]?.registrationNumber
      )}`
    );
    throw new CustomError('This email account already has a reservation for this booking time. A reservation associated with this email for this booking time already exists. Please check to see if you already have a reservation for this time. If you do not have an email confirmation of your reservation please contact <a href="mailto:parkinfo@gov.bc.ca">parkinfo@gov.bc.ca</a>', 400);
  }

  logger.debug('No existing pass found.');
}

/**
 * Converts a pass to reserved status and updates the pass details in DynamoDB.
 *
 * @param {object} decodedToken - The decoded token containing parkOrcs and registrationNumber.
 * @param {string} passStatus - The new status of the pass.
 * @param {string} firstName - The first name of the pass holder.
 * @param {string} lastName - The last name of the pass holder.
 * @param {string} email - The email address of the pass holder.
 * @param {string} phoneNumber - The phone number of the pass holder.
 * @returns {object} - The updated pass details.
 * @throws {CustomError} - If the operation fails.
 */
async function convertPassToReserved(decodedToken, passStatus, firstName, lastName, email, phoneNumber) {
  const updateParams = {
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: { S: `pass::${decodedToken.parkOrcs}` },
      sk: { S: decodedToken.registrationNumber }
    },
    ExpressionAttributeValues: {
      ':statusValue': { S: passStatus },
      ':firstName': { S: firstName },
      ':lastName': { S: lastName },
      ':searchFirstName': { S: firstName.toLowerCase() },
      ':searchLastName': { S: lastName.toLowerCase() },
      ':email': { S: email },
      ':empty_list': { L: [] }, // For pass objects which do not have an audit property.
      ':dateUpdated': { S: DateTime.now().toUTC().toISO() },
      ':audit_val': {
        L: [
          {
            M: {
              by: {
                S: 'system'
              },
              passStatus: {
                S: passStatus
              },
              dateUpdated: {
                S: DateTime.now().toUTC().toISO()
              }
            }
          }
        ]
      }
    },
    UpdateExpression: 'SET passStatus = :statusValue, firstName = :firstName, lastName = :lastName, searchFirstName = :searchFirstName, searchLastName = :searchLastName, email = :email, audit = list_append(if_not_exists(audit, :empty_list), :audit_val), dateUpdated = :dateUpdated',
    ReturnValues: 'ALL_NEW'
  };
  if (phoneNumber) {
    updateParams.ExpressionAttributeValues[':phoneNumber'] = { S: phoneNumber };
    updateParams.UpdateExpression += ', phoneNumber = :phoneNumber';
  };
  const command = new UpdateItemCommand(updateParams);
  const res = await dynamoClient.send(command);
  if (Object.keys(res.Attributes).length === 0) {
    logger.info(`Set status of ${res.Attributes?.type?.S} pass ${res.Attributes?.sk?.S} to ${passStatus}`);
    throw new CustomError('Operation Failed', 400);
  }
  return unmarshall(res.Attributes);
}

/**
 * Retrieves all stored JWTs from DynamoDB.
 * @returns {Promise<Array>} An array of stored JWTs.
 * @throws {CustomError} If there is an error querying DynamoDB.
 */
async function getAllStoredJWTs(expired = false) { //optional if expired or all or whatever we need... make it filtered by
  const currentTime = Math.floor(Date.now() / 1000);
  let params;
  if (expired) {
    // If expired parameter is true only get the expired jwts
    params = {
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      FilterExpression: 'expiration < :expiration',
      ExpressionAttributeValues: {
        ':pk': { S: 'jwt' },
        ':expiration': { N: currentTime.toString() }
      },
    };
  } else {
    // get all jwt if not looking for expired (same as before)
    params = {
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: 'jwt' },
      },
    };
  }
  try {

    let items = [];
    let data;
    let command = new QueryCommand(params)
    do {
      data = await dynamoClient.send(command);
      for(const item of data.Items) {
        items.push(unmarshall(item));
      }
      command.input.ExclusiveStartKey = data.LastEvaluatedKey;
    } while (typeof data.LastEvaluatedKey != "undefined");

    logger.info('Length of all stored JWTs:', items.length);
    logger.debug(items);
    return items;
  } catch (error) {
    logger.error('Error querying DynamoDB:', error);
    throw new CustomError('Error querying DynamoDB', error);
  }
}

/**
 * Restores the available passes for a reservation and deletes the reservation jwt.
 * @param {string} pk - The partition key of the reservation.
 * @param {string} sk - The sort key of the reservation.
 * @param {string} orcNumber - The ORC number of the reservation.
 * @param {string} shortPassDate - The short pass date of the reservation.
 * @param {string} facilityName - The name of the facility.
 * @param {number} numberOfGuests - The number of guests to be added back to the available passes.
 * @param {string} type - The type of the facility.
 * @throws {CustomError} - If there is an error updating the available passes.
 */
async function restoreAvailablePass(pk, sk, orcNumber, shortPassDate, facilityName, numberOfGuests, type, passPk, passSk){
  try{
    // Add the number of guests back to the available passes, and delete the reservation jwt.
    const transactionParams = {
      TransactItems: [{
        Update: {
        TableName: process.env.TABLE_NAME,
        Key: {
          pk: { S: `reservations::${orcNumber}::${facilityName}` },
          sk: { S: shortPassDate }
        },
        ExpressionAttributeValues: {
          ':inc': {N: numberOfGuests}
        },
        ExpressionAttributeNames: {
          '#type': type,
          '#availablePasses': 'availablePasses'
        },
        UpdateExpression: 'SET capacities.#type.#availablePasses = capacities.#type.#availablePasses + :inc',
        ReturnValuesOnConditionCheckFailure: 'ALL_OLD'
        }
      },
        {
          Delete: {
            TableName: process.env.TABLE_NAME,
            Key: {
              pk: { S: pk },
              sk: { S: sk }
            },
            ConditionExpression: 'attribute_exists (pk) AND attribute_exists (sk)'
          }
        },
        ,
        {
          Delete: {
            TableName: process.env.TABLE_NAME,
            Key: {
              pk: { S: passPk },
              sk: { S: passSk }
            },
            ConditionExpression: 'attribute_exists (pk) AND attribute_exists (sk)'
          }
        }]
    };
    const command = new TransactWriteItemsCommand(transactionParams);
    res = await dynamoClient.send(command);
    logger.info(`added: ${numberOfGuests} back to ${facilityName}`);
  } catch (error) {
    logger.error('Error updating available passes:', error);
    throw new CustomError('Error updating pass', error);
  }
}

// responseUtils
const sendResponse = function (code, data, context) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-App-Version',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,DELETE,POST'
    },
    body: JSON.stringify(data)
  };
  return response;
};

/**
 * Checks if the event is a warmup event.
 * @param {object} event - The event object.
 * @returns {boolean} - True if the event is a warmup event, false otherwise.
 */
const checkWarmup = function (event) {
  if (event?.warmup === true || event?.httpMethod === 'OPTIONS') {
    return true;
  } else {
    return false;
  }
}

/**
 * CustomError constructor function.
 * @param {string} message - The error message.
 * @param {number} statusCode - The status code of the error.
 */
const CustomError = function (message, statusCode) {
  this.message = message;
  this.statusCode = statusCode;
}

// loggerUtils
const logger = createLogger({
  level: LEVEL,
  format: combine(
    timestamp(),
    format.printf((info) => {
      let meta = '';
      let symbols = Object.getOwnPropertySymbols(info);
      if (symbols.length == 2) {
        meta = JSON.stringify(info[symbols[1]]);
      }
      return `${info.timestamp} ${[info.level.toUpperCase()]}: ${info.message} ${meta}`;
    })
  ),
  transports: [new transports.Console()]
});


========
>>>>>>>> 00b1f9f... Sam Build Files:lambda/dynamoUtil.js
module.exports = {
  // Constants
  ACTIVE_STATUS,
  DEFAULT_BOOKING_DAYS_AHEAD,
  PASS_HOLD_STATUS,
  EXPIRED_STATUS,
<<<<<<<< HEAD:samNode/layers/baseLayer/baseLayer.js
  PASS_CANCELLED_STATUS,
========
>>>>>>>> 00b1f9f... Sam Build Files:lambda/dynamoUtil.js
  PASS_TYPE_AM,
  PASS_TYPE_PM,
  PASS_TYPE_DAY,
  RESERVED_STATUS,
  DEFAULT_PM_OPENING_HOUR,
  PASS_TYPE_EXPIRY_HOURS,
  TIMEZONE,
  TABLE_NAME,
  META_TABLE_NAME,
  METRICS_TABLE_NAME,
<<<<<<<< HEAD:samNode/layers/baseLayer/baseLayer.js
  IS_OFFLINE,
  
  // Functions
========
  dynamodb,
>>>>>>>> 00b1f9f... Sam Build Files:lambda/dynamoUtil.js
  setStatus,
  runQuery,
  runScan,
  getOne,
  getConfig,
  getPark,
  getParks,
  getFacility,
  getFacilities,
  getPassesByStatus,
<<<<<<<< HEAD:samNode/layers/baseLayer/baseLayer.js
  storeObject,
  checkPassExists,
  convertPassToReserved,
  expressionBuilder,
  visibleFilter,
  restoreAvailablePass,
  getAllStoredJWTs,
  sendResponse,
  checkWarmup,
  logger,
  CustomError,
  DateTime,
  // AWS Services
  dynamoClient,
  sqsClient,
  SendMessageCommand,
  unmarshall,
  marshall,
  s3Client,
  getSignedUrl,
  GetObjectCommand,
  lambda,
  invoke,
  transactWriteItems,
  TransactWriteItemsCommand,
  TransactWriteCommand,
  DeleteItemCommand,
  UpdateItemCommand,
  PutItemCommand,
  DynamoDBClient,
  GetItemCommand
========
  expressionBuilder,
  visibleFilter
>>>>>>>> 00b1f9f... Sam Build Files:lambda/dynamoUtil.js
};
  
>>>>>>> 00b1f9f... Sam Build Files
