const AWS = require('aws-sdk');

const { REGION, ENDPOINT, TABLE_NAME } = require('./settings');

module.exports = async () => {
  dynamoDb = new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });

  try {
    await dynamoDb
      .createTable({
        TableName: TABLE_NAME,
        KeySchema: [
          {
            AttributeName: 'pk',
            KeyType: 'HASH'
          },
          {
            AttributeName: 'sk',
            KeyType: 'RANGE'
          }
        ],
        AttributeDefinitions: [
          {
            AttributeName: 'pk',
            AttributeType: 'S'
          },
          {
            AttributeName: 'sk',
            AttributeType: 'S'
          }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1
        }
      })
      .promise();
  } catch (err) {
    console.log(err);
  }
};
