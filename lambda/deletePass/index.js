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
      // We need to lookup the pass to provide user feedback
      const passNoAuth = await getPass(event.queryStringParameters.park, event.queryStringParameters.passId);

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
      const resCountPK = `rescount::${decodedToken.parkName}::${decodedToken.facilityName}`;
      const updateReservationCountQuery = {
        Key: {
          pk: { S: resCountPK },
          sk: { S: decodedToken.dateselector }
        },
        ExpressionAttributeValues: {
          ':passReducedBy': AWS.DynamoDB.Converter.input(decodedToken.numberOfGuests)
        },
        ExpressionAttributeNames: {
          '#type': decodedToken.type
        },
        UpdateExpression: 'SET reservations.#type = reservations.#type - :passReducedBy',
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
        TableName: TABLE_NAME
      };
      console.log('updateReservationCountQuery:', updateReservationCountQuery);

      const res = await dynamodb
        .transactWriteItems({
          TransactItems: [
            { Update: updatePassQuery },
            { Update: updateReservationCountQuery }
          ]
        })
        .promise();
      console.log('res:', res);

      return sendResponse(200, { msg: 'Cancelled', pass: passNoAuth }, context);
    } else if (event.queryStringParameters.passId && event.queryStringParameters.park) {
      if ((await checkPermissions(event)).decoded !== true) {
        return sendResponse(403, { msg: 'Unauthorized!' });
      } else {
        // We need to lookup the pass to get the date & facility
        const pass = await getPass(event.queryStringParameters.park, event.queryStringParameters.passId);

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

        const resCountPK = `rescount::${event.queryStringParameters.park}::${pass.facilityName}`;
        const updateReservationCountQuery = {
          Key: {
            pk: { S: resCountPK },
            sk: { S: formatISO(new Date(pass.date), { representation: 'date' }) }
          },
          ExpressionAttributeValues: {
            ':passReducedBy': { N: pass.numberOfGuests.toString() }
          },
          ExpressionAttributeNames: {
            '#type': pass.type
          },
          UpdateExpression: 'SET reservations.#type = reservations.#type - :passReducedBy',
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          TableName: TABLE_NAME
        };
        const res = await dynamodb
          .transactWriteItems({
            TransactItems: [
              { Update: updatePassQuery }, 
              { Update: updateReservationCountQuery }
            ]
          })
          .promise();
        console.log('res:', res);

        return sendResponse(200, { msg: 'Cancelled', pass: pass }, context);
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

const getPass = async function (park, id) {
  const passQuery = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
      ':pk': { S: `pass::${park}` },
      ':sk': { S: id }
    },
    KeyConditionExpression: 'pk = :pk AND sk = :sk'
  };
  const [pass] = await runQuery(passQuery);
  return pass;
}
