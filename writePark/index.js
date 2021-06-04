const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
  if (checkPermissions(event) === false) {
    return sendResponse(403, { msg: 'Unauthorized'}, context);
  }
  let parkObject = {
    TableName: process.env.TABLE_NAME
  };

  try {
    console.log(event.body);
    let newObject = JSON.parse(event.body);

    const { park, location, facilities, ...otherProps } = newObject;

    parkObject.Item = {};
    parkObject.Item['pk'] = { S: "park" };
    parkObject.Item['sk'] = { S: park.name };
    parkObject.Item['bcParksLink'] = { S: park.bcParksLink };
    parkObject.Item['description'] = { S: location };
    parkObject.Item['location'] = { S: location };
    parkObject.Item['name'] = { S: park.name };
    parkObject.Item['status'] = { S: 'open' };
    parkObject.Item['type'] = { S: 'details' };

    // Setup facilities
    for(facility of facilities) {
      console.log("Facility:", facility);
      let facObject = {
        TableName: process.env.TABLE_NAME
      };
      facObject.Item = {};
      facObject.Item['pk'] = { S: "facility::" + park.name };
      facObject.Item['sk'] = { S: facility.name };
      facObject.Item['name'] = { S: facility.name };
      facObject.Item['maxReservations'] = { S: facility.maxReservations };
      facObject.Item['type'] = { S: facility.type };
      facObject.Item['status'] = { M: AWS.DynamoDB.Converter.marshall(facility.status) };
      facObject.Item['bookingTimes'] = { M: AWS.DynamoDB.Converter.marshall(facility.bookingTimes) };
      console.log(facObject);
      const facRes = await dynamodb.putItem(facObject).promise();
      console.log("fRes:", facRes);
      // TODO: Err handling
    }

    console.log("putting item:", parkObject);
    const res = await dynamodb.putItem(parkObject).promise();
    console.log("res:", res);
    return sendResponse(200, res, context);
  } catch (err) {
    console.log("err", err);
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

var sendResponse = function (code, data, context) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      "Access-Control-Allow-Headers" : "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST"
    },
    body: JSON.stringify(data)
  };
  return response;
}