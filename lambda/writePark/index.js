const AWS = require('aws-sdk');

const { dynamodb } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  if ((await checkPermissions(event)) === false) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }
  let parkObject = {
    TableName: process.env.TABLE_NAME
  };

  try {
    console.log(event.body);
    let newObject = JSON.parse(event.body);

    const { park, facilities, visible, description, ...otherProps } = newObject;

    parkObject.Item = {};
    parkObject.Item['pk'] = { S: 'park' };
    parkObject.Item['sk'] = { S: park.name };
    if (park.bcParksLink) {
      parkObject.Item['bcParksLink'] = { S: park.bcParksLink };
    }
    parkObject.Item['description'] = { S: description };
    parkObject.Item['name'] = { S: park.name };
    if (park.capacity) {
      parkObject.Item['capacity'] = AWS.DynamoDB.Converter.input(park.capacity);
    }
    parkObject.Item['status'] = { S: park.status };
    parkObject.Item['visible'] = { BOOL: visible };

    // // Setup facilities
    // for (facility of facilities) {
    //   console.log("Facility:", facility);
    //   let facObject = {
    //     TableName: process.env.TABLE_NAME
    //   };
    //   facObject.Item = {};
    //   facObject.Item['pk'] = { S: "facility::" + park.name };
    //   facObject.Item['sk'] = { S: facility.name };
    //   facObject.Item['name'] = { S: facility.name };
    //   facObject.Item['visible'] = { BOOL: facility.visible };
    //   facObject.Item['type'] = { S: facility.type };
    //   facObject.Item['status'] = { M: AWS.DynamoDB.Converter.marshall(facility.status) };
    //   facObject.Item['bookingTimes'] = { M: AWS.DynamoDB.Converter.marshall(facility.bookingTimes) };
    //   console.log(facObject);
    //   const facRes = await dynamodb.putItem(facObject).promise();
    //   console.log("fRes:", facRes);
    //   // TODO: Err handling
    // }

    console.log('putting item:', parkObject);
    const res = await dynamodb.putItem(parkObject).promise();
    console.log('res:', res);
    return sendResponse(200, res, context);
  } catch (err) {
    console.log('err', err);
    return sendResponse(400, err, context);
  }
};
