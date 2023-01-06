const AWS = require('aws-sdk');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const { REGION, ENDPOINT } = require('./settings');

const setup = require('./setup.js')
const teardown = require('./teardown.js')

async function createDocClient() {
  return new DocumentClient({
    region: REGION,
    endpoint: ENDPOINT,
    convertEmptyValues: true
  });
}

async function clearTable() {
  await teardown();
  await setup();
}

exports.dbTools = {
  createDocClient,
  clearTable,
}