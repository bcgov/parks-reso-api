const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
    console.log('Read Pass', event);

    let queryObj = {
      TableName: process.env.TABLE_NAME
    };

    try {
      if (!event.queryStringParameters) {
        return sendResponse(400, { msg: 'Invalid Request'}, context);
      }
      if (event.queryStringParameters.passes && event.queryStringParameters.park) {
        console.log("Grab passes for this park");
        if (checkPermissions(event) === false) {
          return sendResponse(403, { msg: 'Unauthorized'});
        }
        // Grab passes for this park.
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
        queryObj.KeyConditionExpression = 'pk =:pk';
        const passData = await runQuery(queryObj);
        return sendResponse(200, passData, context);
      } else if (event.queryStringParameters.passId && event.queryStringParameters.email && event.queryStringParameters.code) {
        console.log("Get the specific pass, this person is NOT authenticated");
        // Get the specific pass, this person is NOT authenticated
        return sendResponse(200, { msg: 'Get the specific pass unauth TBI'}, context);
      } else if (event.queryStringParameters.passId) {
        if (checkPermissions(event) === false) {
          return sendResponse(403, { msg: 'Unauthorized!'});
        }
        console.log("Get the specific pass authed only TBI");
        // Get the specific pass

        // TODO: If sysadmin, allow
        return sendResponse(200, { msg: 'Get the specific pass authed only TBI'}, context);
      }
      else {
        console.log("Invalid Request");
        return sendResponse(400, { msg: 'Invalid Request'}, context);
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

const sendResponse = function (code, data, context) {
    const response = {
      statusCode: code,
      headers: {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Headers" : "Content-Type",
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Methods": "OPTIONS,GET"
      },
      body: JSON.stringify(data)
    };
    return response;
  }