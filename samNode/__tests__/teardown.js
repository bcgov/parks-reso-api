const { DynamoDBClient, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const { REGION, ENDPOINT, TABLE_NAME } = require('./settings');

module.exports = async () => {
  dynamoDb = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  try {
    const params = {
        TableName: TABLE_NAME
      }
      const deleteTableCommand = new DeleteTableCommand(params);
      dynamoDb.send(deleteTableCommand);
  } catch (err) {
    console.log(err);
  }
};