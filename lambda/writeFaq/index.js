const AWS = require('aws-sdk');

const { dynamodb, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions, getParkAccess } = require('../permissionUtil');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  if (!event?.headers) {
    logger.info('Unauthorized');
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (!new Set(['POST', 'PUT']).has(event.httpMethod)) {
    logger.info('Not Implemented');
    return sendResponse(405, { msg: 'Not Implemented' }, context);
  }

  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  if (permissionObject.isAuthenticated !== true) {
    logger.info('Unauthorized');
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  try {
    logger.debug(event.body);
    const obj = JSON.parse(event.body);

    if (event.httpMethod === 'PUT') {
        if (permissionObject.isAdmin) {
            return await updateItem(obj);
        }else {
            logger.info('Unauthorized');
            throw new Error('Unauthorized Access.');
          }
    } else { logger.info('Not Implemented');
    return sendResponse(405, { msg: 'Not Implemented' }, context);
  }

  } catch (err) {
    logger.error('err', err);
    return sendResponse(400, err, context);
  }
};

async function updateItem(obj, context) {
  const { faq } = obj;

  let updateParams = {
    Key: {
      pk: { S: 'faq' },
      sk: { S: 'faq' }
    },
    UpdateExpression: 'set',
    ExpressionAttributeValues: {},
    ReturnValues: 'ALL_NEW',
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
  };

  if ('faq' in obj) {
    updateParams.UpdateExpression += ' #text = :faq,';
    updateParams.ExpressionAttributeValues[':faq'] = { S: faq };
    updateParams.ExpressionAttributeNames = { '#text': 'text' };
  }

  updateParams.UpdateExpression = updateParams.UpdateExpression.slice(0, -1);
  logger.debug('Updating FAQ:', updateParams);

  try {
    const { Attributes } = await dynamodb.updateItem(updateParams).promise();
    logger.info('Results:', Attributes);
    return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(Attributes), context);
  } catch (error) {
    logger.error('Error updating item:', error);
    return sendResponse(500, { error: 'Internal Server Error' }, context);
  }
}