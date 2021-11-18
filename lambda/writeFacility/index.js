const AWS = require('aws-sdk');

const { dynamodb } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  if ((await checkPermissions(event)) === false) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }
  let facilityObject = {
    TableName: process.env.TABLE_NAME
  };

  try {
    console.log(event.body);
    let newObject = JSON.parse(event.body);

    let { parkName, bookingTimes, name, status, type, visible, mode, stateReason, ...otherProps } = newObject;

    if (mode !== 'editFacililty') {
      // Add facility
      facilityObject.Item = {};
      facilityObject.Item['pk'] = { S: 'facility::' + parkName };
      facilityObject.Item['sk'] = { S: name };
      facilityObject.Item['bookingTimes'] = { M: AWS.DynamoDB.Converter.marshall(bookingTimes) };
      facilityObject.Item['name'] = { S: name };
      facilityObject.Item['status'] = { M: AWS.DynamoDB.Converter.marshall(status) };
      facilityObject.Item['type'] = { S: type };
      facilityObject.Item['visible'] = { BOOL: visible };
      // Add reservations property to bookingtimes.
      facilityObject.Item['reservations'] = { M: {} };

      console.log('putting item:', facilityObject);
      const res = await dynamodb.putItem(facilityObject).promise();
      console.log('res:', res);
      return sendResponse(200, res);
    } else {
      // Edit facility
      let updateParams = {
        Key: {
          pk: { S: 'facility::' + parkName },
          sk: { S: name }
        },
        ExpressionAttributeValues: {
          ':statusValue': { M: AWS.DynamoDB.Converter.marshall(status) },
          ':visibility': { BOOL: visible },
          ':bookingTimes': { M: AWS.DynamoDB.Converter.marshall(bookingTimes) }
        },
        ExpressionAttributeNames: {
          '#facilityStatus': 'status',
          '#visibility': 'visible'
        },
        UpdateExpression: 'SET #facilityStatus =:statusValue, bookingTimes =:bookingTimes, #visibility =:visibility',
        ReturnValues: 'ALL_NEW',
        TableName: process.env.TABLE_NAME
      };
      const res = await dynamodb.updateItem(updateParams).promise();
      return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(res.ExpressionAttributeNames));
    }
  } catch (err) {
    console.log('err', err);
    return sendResponse(400, err);
  }
};
