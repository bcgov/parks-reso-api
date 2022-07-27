const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');

const { dynamodb, runQuery, TABLE_NAME, TIMEZONE } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions } = require('../permissionUtil');
const { DateTime } = require('luxon');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.debug('Delete Pass', event);
  logger.debug('event.queryStringParameters', event.queryStringParameters);

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
    if (event.queryStringParameters.code) {
      logger.debug('Get the specific pass, this person is NOT authenticated but has a code');

      let decodedToken = jwt.verify(event.queryStringParameters.code, process.env.JWT_SECRET);
      logger.debug(decodedToken);

      if (decodedToken === null) {
        return sendResponse(400, { msg: 'Invalid request' });
      }
      // We need to lookup the pass to provide user feedback
      const passNoAuth = await getPass(decodedToken.parkName, decodedToken.passId);

      let transactionObj = { TransactItems: [] };

      // Check for a facility lock
      const facilityUpdateCheck = {
        TableName: TABLE_NAME,
        Key: {
          // TODO: Make this use Orcs instead of parkName
          pk: { S: 'facility::' + decodedToken.parkName },
          sk: { S: decodedToken.facilityName }
        },
        ExpressionAttributeValues: {
          ':isUpdating': { BOOL: false }
        },
        ConditionExpression: 'isUpdating = :isUpdating'
      };
      transactionObj.TransactItems.push({
        ConditionCheck: facilityUpdateCheck
      });

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
      transactionObj.TransactItems.push({
        Update: updatePassQuery
      });
      logger.debug('updatePassQuery:', updatePassQuery);

      // If the pass is in an overbooked state, then the available passes should have already been updated by writeFacility.
      if (!passNoAuth.isOverbooked) {
        // Increase the pass's available pass count from the trail period count.
        const updateReservationsObjQuery = {
          TableName: TABLE_NAME,
          Key: {
            pk: { S: `reservations::${decodedToken.parkName}::${decodedToken.facilityName}` },
            sk: { S: decodedToken.dateselector }
          },
          ExpressionAttributeValues: {
            ':passIncreaseBy': AWS.DynamoDB.Converter.input(decodedToken.numberOfGuests)
          },
          ExpressionAttributeNames: {
            '#type': decodedToken.type,
            '#availablePasses': 'availablePasses'
          },
          UpdateExpression: 'ADD capacities.#type.#availablePasses :passIncreaseBy'
        };
        transactionObj.TransactItems.push({
          Update: updateReservationsObjQuery
        });
        logger.debug('updateReservationsObjQuery:', updateReservationsObjQuery);
      }

      const res = await dynamodb.transactWriteItems(transactionObj).promise();
      logger.debug('res:', res);

      return sendResponse(200, { msg: 'Cancelled', pass: passNoAuth }, context);
    } else if (event.queryStringParameters.passId && event.queryStringParameters.park) {
      const token = await decodeJWT(event);
      const permissionObject = resolvePermissions(token);
      if (permissionObject.isAdmin !== true) {
        return sendResponse(403, { msg: 'Unauthorized!' });
      } else {
        // We need to lookup the pass to get the date & facility
        const pass = await getPass(event.queryStringParameters.park, event.queryStringParameters.passId);

        let transactionObj = { TransactItems: [] };

        // Check for a facility lock
        const facilityUpdateCheck = {
          TableName: TABLE_NAME,
          Key: {
            // TODO: Make this use Orcs instead of parkName
            pk: { S: `facility::${event.queryStringParameters.park}` },
            sk: { S: pass.facilityName }
          },
          ExpressionAttributeValues: {
            ':isUpdating': { BOOL: false }
          },
          ConditionExpression: 'isUpdating = :isUpdating',
          ReturnValuesOnConditionCheckFailure: 'ALL_OLD'
        };
        transactionObj.TransactItems.push({
          ConditionCheck: facilityUpdateCheck
        });

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
        transactionObj.TransactItems.push({
          Update: updatePassQuery
        });
        logger.debug('updatePassQuery:', updatePassQuery);

        const dateselector = DateTime.fromISO(pass.date).setZone(TIMEZONE).toISODate();
        logger.debug('dateselector', dateselector);

        // If the pass is in an overbooked state, then the available passes should have already been updated by writeFacility.
        if (!pass.isOverbooked) {
          // Increase the pass's available pass count from the trail period count.
          const updateReservationsObjQuery = {
            TableName: TABLE_NAME,
            Key: {
              pk: { S: `reservations::${event.queryStringParameters.park}::${pass.facilityName}` },
              sk: { S: dateselector }
            },
            ExpressionAttributeValues: {
              ':passIncreaseBy': { N: pass.numberOfGuests.toString() }
            },
            ExpressionAttributeNames: {
              '#type': pass.type,
              '#availablePasses': 'availablePasses'
            },
            UpdateExpression: 'ADD capacities.#type.#availablePasses :passIncreaseBy'
          };
          transactionObj.TransactItems.push({
            Update: updateReservationsObjQuery
          });
          logger.debug('updateReservationsObjQuery:', updateReservationsObjQuery);
        }

        const res = await dynamodb.transactWriteItems(transactionObj).promise();
        logger.debug('res:', res);

        return sendResponse(200, { msg: 'Cancelled', pass: pass }, context);
      }
    } else {
      logger.debug('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    logger.error(err);
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
};
