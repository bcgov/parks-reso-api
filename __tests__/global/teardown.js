const AWS = require('aws-sdk');

const { REGION, ENDPOINT, TABLE_NAME } = require('./settings');

module.exports = async () => {
  dynamoDb = new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });

  try {
    await dynamoDb
      .deleteTable({
        TableName: TABLE_NAME
      })
      .promise();
  } catch (err) {
    console.log(err);
  }
};
