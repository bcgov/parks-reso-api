const csvjson = require('csvjson');
const { runQuery, sendResponse, logger, s3Client, getSignedUrl, GetObjectCommand, checkWarmup } = require('/opt/baseLayer');
const { decodeJWT, resolvePermissions } = require('/opt/permissionLayer');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const bucket = process.env.S3_BUCKET_DATA || 'parks-dup-assets-tools';
const IS_OFFLINE = process.env.IS_OFFLINE;
const EXPIRY_TIME = process.env.EXPORT_EXPIRY_TIME ? Number(process.env.EXPORT_EXPIRY_TIME) : 60 * 15; // 15 minutes

exports.handler = async (event, context) => {
  logger.debug('Export Pass', event);
  logger.debug('event.queryStringParameters', event.queryStringParameters);

  let queryObj = {
    TableName: process.env.TABLE_NAME
  };

  if (checkWarmup(event)) {
    return sendResponse(200, {}, context);
  }

  try {
    if (!event.queryStringParameters) {
      logger.info("Invalid Request");
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
    if (event.queryStringParameters.facilityName && event.queryStringParameters.park) {
      const token = await decodeJWT(event);
      const permissionObject = resolvePermissions(token);
      if (permissionObject.isAdmin !== true) {
        logger.info("Unauthorized");
        return sendResponse(403, { msg: 'Unauthorized' });
      }
      // Get all the passes for a specific facility
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
      queryObj.ExpressionAttributeValues[':facilityName'] = { S: event.queryStringParameters.facilityName };
      queryObj.KeyConditionExpression = 'pk =:pk';
      queryObj.FilterExpression = 'facilityName =:facilityName';
      // Filter Date
      if (event.queryStringParameters.date) {
        queryObj.ExpressionAttributeValues[':theDate'] = {S: event.queryStringParameters.date };
        queryObj.FilterExpression += ' AND shortPassDate =:theDate';
      }
      // Filter Multiple Statuses
      if (event.queryStringParameters.passStatus) {
        const statusList = event.queryStringParameters.passStatus.split(',');
        const statusObj = {};
        for (let [index, status] of statusList.entries()) {
          const statusName = ":passStatus" + index;
          statusObj[statusName.toString()] = {S: status.toString()};
        }
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#theStatus'] = 'passStatus';
        Object.assign(queryObj.ExpressionAttributeValues, statusObj);
        queryObj.FilterExpression += ' AND #theStatus IN (' + Object.keys(statusObj).toString() + ')';
      }
      // Filter reservation number
      if (event.queryStringParameters.reservationNumber) {
        queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.reservationNumber };
        queryObj.KeyConditionExpression += ' AND sk =:sk';
      }
      // Filter first/last
      if (event.queryStringParameters.firstName) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#firstName'] = 'firstName';
        queryObj.ExpressionAttributeValues[':firstName'] = {S: event.queryStringParameters.firstName.toString() };
        queryObj.FilterExpression += ' AND #firstName =:firstName';
      }
      if (event.queryStringParameters.lastName) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#lastName'] = 'lastName';
        queryObj.ExpressionAttributeValues[':lastName'] = {S: event.queryStringParameters.lastName };
        queryObj.FilterExpression += ' AND #lastName =:lastName';
      }
      // Filter email
      if (event.queryStringParameters.email) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#email'] = 'email';
        queryObj.ExpressionAttributeValues[':email'] = {S: event.queryStringParameters.email.toString() };
        queryObj.FilterExpression += ' AND #email =:email';
      }

      logger.debug('queryObj:', queryObj);
      logger.info("Running Query");
      let scanResults = [];
      let passData;
      do {
        passData = await runQuery(queryObj, true);
        passData.data.forEach((item) => {
          // Delete audit trail (BRS-916)
          delete item.audit;
          scanResults.push(item)
        });
        queryObj.ExclusiveStartKey = passData.LastEvaluatedKey;
      } while (typeof passData.LastEvaluatedKey !== "undefined");

      // Convert into CSV and deploy.
      logger.info("Converting CSV");
      const csvData = csvjson.toCSV(scanResults);

      // Write to S3.
      // TODO: In future, token.data.idir_userid needs to be something else unique,
      // as we will have BCeID/BCSC card IDPs generating exports.
      const key = '/tmp/' + token.data.idir_userid + '/passExport.csv';

      const params = {
        Bucket: bucket,
        Key: key,
        Body: csvData
      }

      try {
        logger.info("Uploading to S3");
        const command = new PutObjectCommand(params)
        const res = await s3Client.send(command)
        // Generate URL.
        logger.info("Generating Signed URL");
        let URL = "";
        if (IS_OFFLINE !== 'True') {
          logger.debug('S3_BUCKET_DATA:', bucket);
          logger.debug('Url key:', key);
          let command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          });
          logger.debug('command:', command);
          URL = await getSignedUrl(
            s3Client,
            command,
            { expiresIn: EXPIRY_TIME });
        }
        logger.debug("URL:", URL);
        return sendResponse(200, { signedURL: URL }, context);
      } catch (e) {
        logger.error("Error uploading to S3.", e);
        return sendResponse(400, { msg: 'Invalid Request' }, context);
      }
    } else {
      logger.error('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    logger.error(err);
    return sendResponse(400, err, context);
  }
};

const checkAddExpressionAttributeNames = function (queryObj) {
  if (!queryObj.ExpressionAttributeNames) {
    queryObj.ExpressionAttributeNames = {};
  }
  return queryObj;
};
