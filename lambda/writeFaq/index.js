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

  if (event.httpMethod !== 'PUT') {
    logger.info('Not Implemented');
    return sendResponse(405, { msg: 'Not Implemented' }, context);
  }

  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  if (permissionObject.isAuthenticated !== true || !permissionObject.isAdmin) {
    logger.info('Unauthorized');
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  try {
    logger.debug(event.body);
    const obj = JSON.parse(event.body);
    return await updateItem(obj);
  } catch (err) {
    logger.error('err', err);
    return sendResponse(400, err, context);
  }
};

async function updateItem(obj, context) {
  try {
    if (obj?.faq){
      const updateParams = {
        Key: { pk: { S: 'faq' }, sk: { S: 'faq' } },
        ExpressionAttributeNames: { '#text': 'text' },
        ExpressionAttributeValues: { ':faq': { S: obj.faq } },
        UpdateExpression: 'set #text = :faq',
        ReturnValues: 'ALL_NEW',
        TableName: TABLE_NAME,
        ConditionExpression: 'attribute_exists(pk)',
      };
      const { Attributes } = await dynamodb.updateItem(updateParams).promise();
      logger.info('Results:', Attributes);
      return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(Attributes), context);  
  }else{
    throw new Error('FAQ property is missing in the input object');
  }
  } catch (error) {
    logger.error('Error updating item:', error);
    return sendResponse(500, { error: 'Internal Server Error' }, context);
  }
}