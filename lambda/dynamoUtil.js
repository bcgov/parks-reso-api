const AWS = require('aws-sdk');
const { logger } = require('./logger');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';
const options = {
  region: 'ca-central-1'
};

if (process.env.IS_OFFLINE) {
  options.endpoint = 'http://localhost:8000';
}
const ACTIVE_STATUS = 'active';
const RESERVED_STATUS = 'reserved';
const EXPIRED_STATUS = 'expired';
const PASS_TYPE_AM = 'AM';
const PASS_TYPE_PM = 'PM';
const PASS_TYPE_DAY = 'DAY';
const TIMEZONE = 'America/Vancouver';
const PM_ACTIVATION_HOUR = 12;
const PASS_TYPE_EXPIRY_HOURS = {
  AM: 12,
  PM: 0,
  DAY: 0
};
const DEFAULT_BOOKING_DAYS_AHEAD = 3;

const dynamodb = new AWS.DynamoDB(options);

exports.dynamodb = new AWS.DynamoDB();


async function setStatus(passes, status) {
  for (let i = 0; i < passes.length; i++) {
    let updateParams = {
      Key: {
        pk: { S: passes[i].pk },
        sk: { S: passes[i].sk }
      },
      ExpressionAttributeValues: {
        ':statusValue': { S: status }
      },
      UpdateExpression: 'SET passStatus = :statusValue',
      ReturnValues: 'ALL_NEW',
      TableName: TABLE_NAME
    };

    const res = await dynamodb.updateItem(updateParams).promise();
    logger.info(`Set status of ${res.Attributes?.type?.S} pass ${res.Attributes?.sk?.S} to ${status}`);
  }
}

// simple way to return a single Item by primary key.
async function getOne(pk, sk) {
  logger.debug(`getItem: { pk: ${pk}, sk: ${sk} }`);
  const params = {
    TableName: TABLE_NAME,
    Key: AWS.DynamoDB.Converter.marshall({pk, sk})
  };
  let item = await dynamodb.getItem(params).promise();
  return item?.Item || {};
};

// TODO: set paginated to TRUE by default. Query results will then be at most 1 page
// (1MB) unless they are explicitly specified to retrieve more.
// TODO: Ensure the returned object has the same structure whether results are paginated or not. 
async function runQuery(query, paginated = false) {
  logger.debug('query:', query);
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
      logger.debug(`Page ${page} contains ${pageData.Items.length} additional query results...`);
    };
  } while (pageData?.LastEvaluatedKey && !paginated);

  logger.debug(`Query result pages: ${page}, total returned items: ${data.length}`);
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
  logger.debug('query:', query);
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
      logger.debug(`Page ${page} contains ${pageData.Items.length} additional scan results...`);
    };
  } while (pageData?.LastEvaluatedKey && !paginated);

  logger.debug(`Scan result pages: ${page}, total returned items: ${data.length}`);
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
  const configQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND sk = :sk',
    ExpressionAttributeValues: {
      ':pk': { S: 'config' },
      ':sk': { S: 'config' }
    }
  };
  return await runQuery(configQuery);
}

// get a single park by park sk.
// if not authenticated, invisible parks will not be returned.
async function getPark(sk, authenticated = false) {
  const park = await getOne('park', sk);
  if (!authenticated && !park.visible) {
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
  return await runQuery(parksQuery);
}

// get a single facility by park name & facility sk.
// if not authenticated, invisible facilities will not be returned.
async function getFacility(parkName, sk, authenticated = false){
  const facility = await getOne(`facility::${parkName}`, sk);
  if (!authenticated && !facility.visible) {
    return {};
  };
  return AWS.DynamoDB.Converter.unmarshall(facility);
};

async function getFacilities(parkName) {
  const facilitiesQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: `facility::${parkName}` }
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

const visibleFilter = function (queryObj, isAdmin) {
  logger.info('visibleFilter:', queryObj, isAdmin);
  if (!isAdmin) {
    queryObj.ExpressionAttributeValues[':visible'] = { BOOL: true };
    queryObj.FilterExpression = 'visible =:visible';
  }
  return queryObj;
};

module.exports = {
  ACTIVE_STATUS,
  DEFAULT_BOOKING_DAYS_AHEAD,
  EXPIRED_STATUS,
  PASS_TYPE_AM,
  PASS_TYPE_PM,
  PASS_TYPE_DAY,
  RESERVED_STATUS,
  PM_ACTIVATION_HOUR,
  PASS_TYPE_EXPIRY_HOURS,
  TIMEZONE,
  TABLE_NAME,
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
  visibleFilter
};
