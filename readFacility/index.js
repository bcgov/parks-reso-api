const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
  console.log('Read Facility', event);

  let queryObj = {
    TableName: process.env.TABLE_NAME
  };

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
    if (event.queryStringParameters.facilities && event.queryStringParameters.park) {
      console.log("Grab facilities for this park");
      if (checkPermissions(event) === false) {
        return sendResponse(403, { msg: 'Unauthorized' });
      }
      // Grab facilities for this park.
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + event.queryStringParameters.park };
      queryObj.KeyConditionExpression = 'pk =:pk';
      const facilityData = await runQuery(queryObj);
      return sendResponse(200, facilityData, context);
    } else if (event.queryStringParameters.facilityName && event.queryStringParameters.park) {
      if (checkPermissions(event) === false) {
        return sendResponse(403, { msg: 'Unauthorized!' });
      }
      console.log("Get the specific Facility");
      // Get the specific Facility

      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + event.queryStringParameters.park };
      queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.facilityName };
      queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
      const facilityData = await runQuery(queryObj);
      return sendResponse(200, facilityData, context);
    }
    else {
      console.log("Invalid Request");
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    console.log(err);
    return sendResponse(400, err, context);
  }
}

const checkPermissions = function (event) {
  // TODO: Add keycloak decoding based on NRPTI prod

  // 1: check if sysadmin (pick a different role than sysadmin)
  // 2: reject if not
  // 3: insert item into DB.
  return true;
}

const runQuery = async function (query) {
  const data = await dynamodb.query(query).promise();
  console.log("data:", data);
  var unMarshalled = data.Items.map(item => {
    return AWS.DynamoDB.Converter.unmarshall(item);
  });
  console.log(unMarshalled);
  return unMarshalled;
}

var sendResponse = function (code, data, context) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,GET"
    },
    body: JSON.stringify(data)
  };
  return response;
}