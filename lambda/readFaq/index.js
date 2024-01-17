const AWS = require('aws-sdk');
const { runQuery, TABLE_NAME, visibleFilter } = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { decodeJWT, roleFilter, resolvePermissions } = require('../permissionUtil');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.info('Read FAQ', event);
  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  let queryObj = {
    TableName: TABLE_NAME
  };

  try {
    queryObj.ExpressionAttributeValues = {};
    queryObj.ExpressionAttributeValues[':pk'] = { S: 'faq' };
    queryObj.ExpressionAttributeValues[':sk'] = { S: 'faq' };
    queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    let faq = await runQuery(queryObj);
    return sendResponse(200, faq, context);

  } catch (err) {
    logger.error(err);
    return sendResponse(400, err, context);
  }
};
