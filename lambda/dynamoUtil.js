const AWS = require('aws-sdk');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';
const options = {
  region: 'ca-central-1'
};

if (process.env.IS_OFFLINE) {
  options.endpoint = 'http://localhost:8000';
}

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
  console.log('data:', data);
  var unMarshalled = data.Items.map(item => {
    return AWS.DynamoDB.Converter.unmarshall(item);
  });
  console.log(unMarshalled);
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

module.exports = {
  TABLE_NAME,
  dynamodb,
  setStatus,
  runQuery,
  getConfig,
  getParks,
  getFacilities
};
