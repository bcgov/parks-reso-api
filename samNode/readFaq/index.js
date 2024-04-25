const { APIGatewayProxyHandler } = require('aws-lambda');
const { DynamoDB } = require('aws-sdk');
const { TABLE_NAME, runQuery, sendResponse, logger } = require('/opt/baseLayer');

exports.handler = async function (event) {


    try {
        let queryObj = {
            TableName: TABLE_NAME
        };
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'faq' };
        queryObj.ExpressionAttributeValues[':sk'] = { S: 'faq' };
        queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
        let faq = await runQuery(queryObj);
        return sendResponse(200, faq);

    } catch (err) {
        logger.error(err);
        return sendResponse(400, err);
    }
    
};
