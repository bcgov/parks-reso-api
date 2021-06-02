
const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
    console.log('Read Park', event);
    const dynamodb = new AWS.DynamoDB();

    let queryObj = {
      TableName: process.env.TABLE_NAME
    };

    try {
      if (!event.queryStringParameters) {
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
        queryObj.KeyConditionExpression = 'pk =:pk';
      } else if (event.queryStringParameters.facilities && event.queryStringParameters.park) {
        // Grab facilities for this park.
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + event.queryStringParameters.park };
        queryObj.KeyConditionExpression = 'pk =:pk';
      } else if (event.queryStringParameters.details && event.queryStringParameters.park) {
        // Grab details for this park.
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
        queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.park };
        queryObj.KeyConditionExpression = 'pk =:pk and sk =:sk';
      } else if (event.queryStringParameters.park) {
        // Get all the parks, no specific things
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
        queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.park };
        queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
      } else {
        return sendResponse(400, { msg: 'Invalid Request'});
      }

      try {
        console.log("queryObj:", queryObj);
        const data = await dynamodb.query(queryObj).promise();
        console.log("data:", data);
        var unMarshalled = data.Items.map(item => {
          return AWS.DynamoDB.Converter.unmarshall(item);
        });
        console.log(unMarshalled);
        return sendResponse(200, unMarshalled);
      } catch (err) {
        console.log(err);
        return err;
      }
    } catch (err) {
      console.log(err);
    }
}

var sendResponse = function (code, data) {
    const response = {
      statusCode: code,
      headers: {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Headers" : "'Content-Type'",
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Methods": "OPTIONS,GET"
      },
      body: JSON.stringify(data)
    };
    return response;
  }