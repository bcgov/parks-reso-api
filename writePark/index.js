
const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
  let res = {};

  // TODO: Add keycloak decoding based on NRPTI prod

  // 1: check if sysadmin (pick a different role than sysadmin)
  // 2: reject if not
  // 3: insert item into DB.

  try {
    res = JSON.parse(event.body);
  } catch (err) {
    console.log("err", err);
  }

  return sendResponse(200, res);

  // console.log('Write Park');
  // const dynamodb = new AWS.DynamoDB();

  // try {
  //   // let query = {
  //   //   TableName: "parkreso", // Make a variable.
  //   //   FilterExpression: "rbac IN (:val1)",
  //   //   // ExpressionAttributeNames: {
  //   //   //   "#a": "rbac"
  //   //   // },
  //   //   "ExpressionAttributeValues": {
  //   //     ":val1": { "S": "public" }
  //   //   },
  //   //   "ReturnConsumedCapacity": "TOTAL"
  //   // };
  //   var getTA = {
  //     ExpressionAttributeValues: {
  //         ':name': { S: "park" },
  //         ':sk': { S: "details" }
  //     },
  //     KeyConditionExpression: 'pk =:name AND sk =:sk',
  //     TableName: process.env.TABLE_NAME
  //   };

  //   const data = await dynamodb.query(getTA).promise();
  //   console.log("data:", data);
  //   var unMarshalled = data.Items.map(item => {
  //     return AWS.DynamoDB.Converter.unmarshall(item);
  //   });
  //   console.log(unMarshalled);
  //   return sendResponse(200, unMarshalled);
  // } catch (err) {
  //   console.log(err);
  //   return err;
  // }
}

var sendResponse = function (code, data) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      "Access-Control-Allow-Headers": "'Content-Type'",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,GET"
    },
    body: JSON.stringify(data)
  };
  return response;
}