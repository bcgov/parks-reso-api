
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
    console.log('Read Park', event);

    let queryObj = {
      TableName: process.env.TABLE_NAME
    };

    try {
      if (!event.queryStringParameters) {
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
        queryObj.KeyConditionExpression = 'pk =:pk';
        const parksData = await runQuery(queryObj);
        return sendResponse(200, parksData, context);
      } else if (event.queryStringParameters.facilities && event.queryStringParameters.park) {
        // Grab facilities for this park.
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + event.queryStringParameters.park };
        queryObj.KeyConditionExpression = 'pk =:pk';
        const facilityData = await runQuery(queryObj);
        return sendResponse(200, facilityData, context);
      } else if (event.queryStringParameters.park) {
        // Get all the parks, no specific things
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
        queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.park };
        queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
        const parkData = await runQuery(queryObj);
        return sendResponse(200, parkData, context);
      } else {
        return sendResponse(400, { msg: 'Invalid Request'}, context);
      }
    } catch (err) {
      console.log(err);
      return sendResponse(400, err, context);
    }
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
        "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Methods": "OPTIONS,GET"
      },
      body: JSON.stringify(data)
    };
    return response;
  }