const AWS = require('aws-sdk');
const { logger } = require('./logger');
const options = {
  region: process.env.AWS_REGION || 'ca-central-1'
};
const sqs = new AWS.SQS(options)

exports.sendSQSMessage = async function (service, payload) {
  logger.info("SQSQUEUE:", process.env.SQSQUEUENAME);
  try {
    const params = {
      MessageBody: `SQS Message at ${(new Date()).toISOString()}`,
      QueueUrl: process.env.SQSQUEUENAME,
      MessageAttributes: {
        "email_address": {
          DataType: "String",
          StringValue: payload?.email_address
        },
        "template_id": {
          DataType: "String",
          StringValue: payload?.template_id
        },
        "personalisation": {
          DataType: "String",
          StringValue: JSON.stringify(payload?.personalisation)
        },
        "service": {
          DataType: "String",
          StringValue: service
        }
      }
    }
    logger.debug("Sending SQS:", params);
    await sqs.sendMessage(params).promise();
  } catch (e) {
    logger.error(e);
  }
}