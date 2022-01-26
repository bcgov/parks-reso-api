const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');

const { dynamodb, runQuery, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');
const { formatISO } = require('date-fns');

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
      const updatePassQuery = {
        Key: {
          pk: { S: 'pass::' + decodedToken.parkName },
          sk: { S: decodedToken.passId }
        },
        ExpressionAttributeValues: {
          ':cancelled': { S: 'cancelled' }
        },
        // If the pass is already cancelled, error so that we don't decrement the available
        // count multiple times.
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk) AND (NOT passStatus = :cancelled)',
        UpdateExpression: 'SET passStatus = :cancelled',
        TableName: TABLE_NAME
      };
      console.log('updatePassQuery:', updatePassQuery);

      // Deduct the pass's numberOfGuests count from the trail period count.
      const updateFacilityQuery = {
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
        TableName: TABLE_NAME
      };
      console.log('updateFacilityQuery:', updateFacilityQuery);

      const res = await dynamodb
        .transactWriteItems({
          TransactItems: [
            {
              Update: updatePassQuery
            },
            {
              Update: updateFacilityQuery
            }
          ]
        })
        .promise();
      console.log('res:', res);

      return sendResponse(200, { msg: 'Cancelled' }, context);
    } else if (event.queryStringParameters.passId && event.queryStringParameters.park) {
      if ((await checkPermissions(event)) === false) {
        return sendResponse(403, { msg: 'Unauthorized!' });
      } else {
        // We need to lookup the pass to get the date & facility
        const passQuery = {
          TableName: TABLE_NAME,
          ExpressionAttributeValues: {
            ':pk': { S: `pass::${event.queryStringParameters.park}` },
            ':sk': { S: event.queryStringParameters.passId }
          },
          KeyConditionExpression: 'pk = :pk AND sk = :sk'
        };
        const [pass] = await runQuery(passQuery);

        const updatePassQuery = {
          Key: {
            pk: { S: `pass::${event.queryStringParameters.park}` },
            sk: { S: event.queryStringParameters.passId }
          },
          ExpressionAttributeValues: {
            ':cancelled': { S: 'cancelled' }
          },
          // If the pass is already cancelled, error so that we don't decrement the available
          // count multiple times.
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk) AND (NOT passStatus = :cancelled)',
          UpdateExpression: 'SET passStatus = :cancelled',
          TableName: TABLE_NAME
        };
        console.log('updatePassQuery:', updatePassQuery);

        const reservationCountCountQuery = {
          Key: {
            pk: { S: `facility::${event.queryStringParameters.park}` },
            sk: { S: pass.facilityName }
          },
          ExpressionAttributeValues: {
            ':passReducedBy': { N: pass.numberOfGuests.toString() }
          },
          ExpressionAttributeNames: {
            '#type': pass.type,
            '#dateselector': formatISO(new Date(pass.date), { representation: 'date' })
          },
          UpdateExpression: 'SET reservations.#dateselector.#type = reservations.#dateselector.#type - :passReducedBy',
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          TableName: TABLE_NAME
        };
        const res = await dynamodb
          .transactWriteItems({
            TransactItems: [{ Update: updatePassQuery }, { Update: reservationCountCountQuery }]
          })
          .promise();
        console.log('res:', res);

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
