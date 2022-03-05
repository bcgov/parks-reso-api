const AWS = require('aws-sdk');

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
const timeZone = 'America/Vancouver';
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
    console.log(`Set status of ${res.Attributes?.type?.S} pass ${res.Attributes?.sk?.S} to ${status}`);
  }
}

async function runQuery(query, paginated = false) {
  console.log('query:', query);
  const data = await dynamodb.query(query).promise();
  // console.log('data:', data);
  var unMarshalled = data.Items.map(item => {
    return AWS.DynamoDB.Converter.unmarshall(item);
  });
  // console.log(unMarshalled);
  if (paginated) {
    return {
      LastEvaluatedKey: data.LastEvaluatedKey,
      data: unMarshalled
    };
  } else {
    return unMarshalled;
  }
}

async function runScan(query, paginated = false) {
  console.log('query:', query);
  const data = await dynamodb.scan(query).promise();
  // console.log('data:', data);
  var unMarshalled = data.Items.map(item => {
    return AWS.DynamoDB.Converter.unmarshall(item);
  });
  // console.log(unMarshalled);
  if (paginated) {
    return {
      LastEvaluatedKey: data.LastEvaluatedKey,
      data: unMarshalled
    };
  } else {
    return unMarshalled;
  }
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

const getPassesByStatus = async function(status, filterExpression = undefined) {
  console.log(`Loading passes`, filterExpression);

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

  console.log("Query:", passesQuery);

  // Grab all the results, don't skip any.
  let results = [];
  let passData;
  do {
    passData = await runQuery(passesQuery, true);
    passData.data.forEach((item) => results.push(item));
    passesQuery.ExclusiveStartKey  = passData.LastEvaluatedKey;
  } while(typeof passData.LastEvaluatedKey !== "undefined");

  return results;
}

module.exports = {
  ACTIVE_STATUS,
  RESERVED_STATUS,
  EXPIRED_STATUS,
  PASS_TYPE_AM,
  PASS_TYPE_PM,
  PASS_TYPE_DAY,
  TIMEZONE,
  PM_ACTIVATION_HOUR,
  PASS_TYPE_EXPIRY_HOURS,
  timeZone,
  TABLE_NAME,
  dynamodb,
  setStatus,
  runQuery,
  runScan,
  getConfig,
  getParks,
  getFacilities,
  getPassesByStatus,
  expressionBuilder
};
