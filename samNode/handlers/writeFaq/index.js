const { dynamoClient,
  TABLE_NAME,
  sendResponse,
  logger,
  unmarshall,
  UpdateItemCommand } = require('/opt/baseLayer');
const { decodeJWT, resolvePermissions } = require('/opt/permissionLayer');

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
      const command = new UpdateItemCommand(updateParams);
      const { Attributes } = await dynamoClient.send(command);
      logger.info('Results:', Attributes);
      return sendResponse(200, unmarshall(Attributes), context);  
  }else{
    throw new Error('FAQ property is missing in the Text object');
  }
  } catch (error) {
    logger.error('Error updating item:', error);
    return sendResponse(500, { error: 'Internal Server Error' }, context);
  }
}
