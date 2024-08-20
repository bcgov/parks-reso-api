const { TABLE_NAME, runQuery, sendResponse, logger } = require('/opt/baseLayer');

exports.handler = async function (event, context) {
    try {
        if (event?.httpMethod === 'OPTIONS') {
            return sendResponse(200, {}, context);
          }

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
