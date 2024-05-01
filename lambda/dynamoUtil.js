const AWS = require('aws-sdk');
const { logger } = require('./logger');
const { DateTime } = require('luxon');
const { CustomError } = require('./responseUtil');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';
const META_TABLE_NAME = process.env.META_TABLE_NAME || 'parksreso-meta';
const METRICS_TABLE_NAME = process.env.METRICS_TABLE_NAME || 'parksreso-metrics';
const DB_ENDPOINT_OVERRIDE = process.env.DB_ENDPOINT_OVERRIDE || 'http://localhost:8000'
const options = {
  region: 'ca-central-1'
};

if (process.env.IS_OFFLINE) {
  options.endpoint = DB_ENDPOINT_OVERRIDE;
}
const ACTIVE_STATUS = 'active';
const RESERVED_STATUS = 'reserved';
const PASS_HOLD_STATUS = 'hold';
const EXPIRED_STATUS = 'expired';
const PASS_TYPE_AM = 'AM';
const PASS_TYPE_PM = 'PM';
const PASS_TYPE_DAY = 'DAY';
const TIMEZONE = 'America/Vancouver';
const DEFAULT_PM_OPENING_HOUR = 13;
const PASS_TYPE_EXPIRY_HOURS = {
  AM: 13,
  PM: 0,
  DAY: 0
};
const DEFAULT_BOOKING_DAYS_AHEAD = 3;

const dynamodb = new AWS.DynamoDB(options);

exports.dynamodb = new AWS.DynamoDB();


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
      TableName: TABLE_NAME
    };

    const res = await dynamodb.updateItem(updateParams).promise();
    logger.info(`Set status of ${res.Attributes?.type?.S} pass ${res.Attributes?.sk?.S} to ${status}`);
  }
}

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

// TODO: set paginated to TRUE by default. Query results will then be at most 1 page
// (1MB) unless they are explicitly specified to retrieve more.
// TODO: Ensure the returned object has the same structure whether results are paginated or not.
async function runQuery(query, paginated = false) {
  logger.info('query:', query);
  let data = [];
  let pageData = [];
  let page = 0;

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
  } while (pageData?.LastEvaluatedKey && !paginated);

  logger.info(`Query result pages: ${page}, total returned items: ${data.length}`);
  if (paginated) {
    return {
      LastEvaluatedKey: pageData.LastEvaluatedKey,
      data: data
    };
  } else {
    return data;
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

  do {
    page++;
    if (pageData?.LastEvaluatedKey) {
      query.ExclusiveStartKey = pageData.LastEvaluatedKey;
    };
    pageData = await dynamodb.scan(query).promise();
    data = data.concat(pageData.Items.map(item => {
      return AWS.DynamoDB.Converter.unmarshall(item);
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
  return AWS.DynamoDB.Converter.unmarshall(config);
}

// get a single park by park sk.
// if not authenticated, invisible parks will not be returned.
async function getPark(sk, authenticated = false) {
  const park = await getOne('park', sk);
  if (!authenticated && !park.visible.BOOL) {
    return {};
  };
  return AWS.DynamoDB.Converter.unmarshall(park);
};

async function getParks() {
  const parksQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: 'park' }
    }
  };
  return await runQuery(parksQuery, false);
}

// get a single facility by park name & facility sk.
// if not authenticated, invisible facilities will not be returned.
async function getFacility(parkSk, sk, authenticated = false) {
  const facility = await getOne(`facility::${parkSk}`, sk);
  if (!authenticated && !facility.visible.BOOL) {
    return {};
  };
  return AWS.DynamoDB.Converter.unmarshall(facility);
};

async function getFacilities(parkSk) {
  const facilitiesQuery = {
    TableName: TABLE_NAME,
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

  const passesQuery = {
    TableName: TABLE_NAME,
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
  do {
    passData = await runQuery(passesQuery, true);
    passData.data.forEach((item) => results.push(item));
    passesQuery.ExclusiveStartKey = passData.LastEvaluatedKey;
  } while (typeof passData.LastEvaluatedKey !== "undefined");

  return results;
}

const storeObject = async function (object, tableName = TABLE_NAME) {
  console.log('storeObject:', object);
  const params = {
    TableName: tableName,
    Item: AWS.DynamoDB.Converter.marshall(object)
  };
  console.log('params:', params)
  try {
    await dynamodb.putItem(params).promise();
    logger.info(`Stored object: ${object.sk}`);
  }
  catch (err) {
    logger.error(`Error storing object: ${object.sk}`, err);
    throw err;
  }
}

const visibleFilter = function (queryObj, isAdmin) {
  logger.info('visibleFilter:', queryObj, isAdmin);
  if (!isAdmin) {
    queryObj.ExpressionAttributeValues[':visible'] = { BOOL: true };
    queryObj.FilterExpression = 'visible =:visible';
  }
  return queryObj;
};

async function checkPassExists(facilityName, email, type, bookingPSTShortDate) {
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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingPSTShortDate)) {
    throw new CustomError('Invalid booking date.', 400);
  }

  let existingItems;
  try {
    logger.info('Running existingPassCheckObject');
    logger.debug(existingPassCheckObject);
    existingItems = await dynamodb.query(existingPassCheckObject).promise();
  } catch (error) {
    logger.info('Error while running query for existingPassCheckObject');
    logger.error(error);
    throw new CustomError('Error while running query for existingPassCheckObject', 400);
  }

  if (existingItems.Count === 0) {
    logger.debug('No existing pass found.');
  } else {
    logger.info(
      `email account already has a reservation. Registration number: ${JSON.stringify(
        existingItems?.Items[0]?.registrationNumber
      )}`
    );
    throw new CustomError('This email account already has a reservation for this booking time. A reservation associated with this email for this booking time already exists. Please check to see if you already have a reservation for this time. If you do not have an email confirmation of your reservation please contact <a href="mailto:parkinfo@gov.bc.ca">parkinfo@gov.bc.ca</a>', 400);
  }
}

async function convertPassToReserved(decodedToken, passStatus, firstName, lastName, email) {
  const updateParams = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: `pass::${decodedToken.orcs}` },
      sk: { S: decodedToken.registrationNumber }
    },
    ExpressionAttributeValues: {
      ':statusValue': { S: passStatus },
      ':firstName': { S: firstName },
      ':lastName': { S: lastName },
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
    UpdateExpression: 'SET passStatus = :statusValue, firstName = :firstName, lastName = :lastName, email = :email, audit = list_append(if_not_exists(audit, :empty_list), :audit_val), dateUpdated = :dateUpdated',
    ReturnValues: 'ALL_NEW'
  };
  console.log('updateParams:', updateParams);
  const res = await dynamodb.updateItem(updateParams).promise();
  if (Object.keys(res.Attributes).length === 0) {
    logger.info(`Set status of ${res.Attributes?.type?.S} pass ${res.Attributes?.sk?.S} to ${passStatus}`);
    throw new CustomError('Operation Failed', 400);
  }
  return AWS.DynamoDB.Converter.unmarshall(res.Attributes);
};

module.exports = {
  ACTIVE_STATUS,
  DEFAULT_BOOKING_DAYS_AHEAD,
  EXPIRED_STATUS,
  PASS_HOLD_STATUS,
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
  convertPassToReserved,
  checkPassExists,
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
  storeObject,
  visibleFilter
};
