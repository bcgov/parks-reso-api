const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');

const { dynamodb } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  console.log('Delete Pass', event);
  console.log('event.queryStringParameters', event.queryStringParameters);

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
    if (event.queryStringParameters.passId && event.queryStringParameters.park && event.queryStringParameters.code) {
      console.log('Get the specific pass, this person is NOT authenticated but has a code');

      let decodedToken = jwt.verify(event.queryStringParameters.code, process.env.JWT_SECRET);
      console.log(decodedToken);

      if (decodedToken === null) {
        return sendResponse(400, { msg: 'Invalid request' });
      }

      // Get the specific pass, this person is NOT authenticated
      let updatePass = {
        Key: {
          pk: { S: 'pass::' + decodedToken.parkName },
          sk: { S: decodedToken.passId }
        },
        ExpressionAttributeValues: {
          ':cancelled': { S: 'cancelled' }
        },
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
        UpdateExpression: 'SET passStatus = :cancelled',
        ReturnValues: 'ALL_NEW',
        TableName: process.env.TABLE_NAME
      };
      console.log('updatePass:', updatePass);
      const passRes = await dynamodb.updateItem(updatePass).promise();
      console.log('passRes:', passRes);

      // Deduct the pass's numberOfGuests count from the trail period count.
      let updateFacility = {
        Key: {
          pk: { S: 'facility::' + decodedToken.parkName },
          sk: { S: decodedToken.facilityName }
        },
        ExpressionAttributeValues: {
          ':passReducedBy': AWS.DynamoDB.Converter.input(decodedToken.numberOfGuests)
        },
        ExpressionAttributeNames: {
          '#type': decodedToken.type,
          '#dateselector': decodedToken.dateselector
        },
        UpdateExpression: 'SET reservations.#dateselector.#type = reservations.#dateselector.#type - :passReducedBy',
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
        ReturnValues: 'ALL_NEW',
        TableName: process.env.TABLE_NAME
      };
      console.log('updateFacility:', updateFacility);
      const facilityRes = await dynamodb.updateItem(updateFacility).promise();
      console.log('facilityRes:', facilityRes);

      return sendResponse(200, { msg: 'Cancelled' }, context);
    } else if (event.queryStringParameters.passId && event.queryStringParameters.park) {
      if ((await checkPermissions(event)) === false) {
        return sendResponse(403, { msg: 'Unauthorized!' });
      } else {
        let updatePass = {
          Key: {
            pk: { S: 'pass::' + event.queryStringParameters.park },
            sk: { S: event.queryStringParameters.passId }
          },
          ExpressionAttributeValues: {
            ':cancelled': { S: 'cancelled' }
          },
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          UpdateExpression: 'SET passStatus = :cancelled',
          ReturnValues: 'ALL_NEW',
          TableName: process.env.TABLE_NAME
        };
        console.log('updatePass:', updatePass);
        const facilityRes = await dynamodb.updateItem(updatePass).promise();
        console.log('FacRes:', facilityRes);
        return sendResponse(200, { msg: 'Cancelled' }, context);
      }
    } else {
      console.log('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    console.log(err);
    return sendResponse(400, { msg: 'Invalid Request' }, context);
  }
};
