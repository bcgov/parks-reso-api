const AWS = require('aws-sdk');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const { REGION, ENDPOINT, TABLE_NAME } = require('./settings');

async function setupDb() {
  new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });
  return new DocumentClient({
    region: REGION,
    endpoint: ENDPOINT,
    convertEmptyValues: true
  });
}

exports.mockdb = {
  setupDb,
  TABLE_NAME
}