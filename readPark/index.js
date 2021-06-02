
const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
    console.log('Read Park', event);
    const dynamodb = new AWS.DynamoDB();

    let queryObj = {
      ExpressionAttributeValues: {
        ':name': { S: "park" }
      },
      KeyConditionExpression: 'pk =:name',
      TableName: process.env.TABLE_NAME
    };

    try {
      // Filter by details info
      if (event.queryStringParameters.details) {
        queryObj.ExpressionAttributeValues[':sk'] = { S: "details" };
        queryObj.KeyConditionExpression += ' AND sk =:sk';
      }

      // Filter by facilities
      if (event.queryStringParameters.facilities) {
        queryObj.ExpressionAttributeValues[':sk'] = { S: "facility" };
        queryObj.KeyConditionExpression += ' AND sk =:sk';
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