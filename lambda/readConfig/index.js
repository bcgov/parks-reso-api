
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
    console.log('Read Config', event);

    let queryObj = {
      TableName: process.env.TABLE_NAME
    };

    try {
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'config' };
      queryObj.ExpressionAttributeValues[':sk'] = { S: 'config' };
      queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';

      const configData = await runQuery(queryObj);
      return sendResponse(200, configData[0], context);
    } catch (err) {
      console.log(err);
      return sendResponse(400, err, context);
    }
}

const runQuery = async function (query) {
  console.log("query:", query);
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