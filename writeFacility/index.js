const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
  let facilityObject = {
    TableName: process.env.TABLE_NAME
  };

  try {
    console.log(event.body);
    let newObject = JSON.parse(event.body);

    const { parkName, bookingTimes, maxReservations, name, status, type, ...otherProps } = newObject;

    facilityObject.Item = {};
    facilityObject.Item['pk'] = { S: "facility::" + parkName };
    facilityObject.Item['sk'] = { S: name };
    facilityObject.Item['bookingTimes'] = { M: AWS.DynamoDB.Converter.marshall(bookingTimes) };
    facilityObject.Item['maxReservations'] = { S: maxReservations };
    facilityObject.Item['name'] = { S: name };
    facilityObject.Item['status'] = { M: AWS.DynamoDB.Converter.marshall(status) };
    facilityObject.Item['type'] = { S: type };

    console.log("putting item:", facilityObject);
    const res = await dynamodb.putItem(facilityObject).promise();
    console.log("res:", res);
    return sendResponse(200, res);
  } catch (err) {
    console.log("err", err);
    return sendResponse(400, err);
  }
}

const sendResponse = function (code, data) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST"
    },
    body: JSON.stringify(data)
  };
  return response;
}