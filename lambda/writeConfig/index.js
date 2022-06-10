const AWS = require('aws-sdk');

const { dynamodb, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);
  if (permissionObject.isAdmin !== true) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }
  let configObject = {
    TableName: TABLE_NAME
  };

  try {
    console.log(event.body);
    let newObject = JSON.parse(event.body);

    configObject.Item = {};
    configObject.Item['pk'] = { S: 'config' };
    configObject.Item['sk'] = { S: 'config' };
    configObject.Item['configData'] = { M: AWS.DynamoDB.Converter.marshall(newObject) };

    console.log('putting item:', configObject);
    const res = await dynamodb.putItem(configObject).promise();
    console.log('res:', res);
    return sendResponse(200, res);
  } catch (err) {
    console.log('err', err);
    return sendResponse(400, err);
  }
};
