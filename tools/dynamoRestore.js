const AWS = require('aws-sdk');

const data = require('./dump.json');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';

const options = {
  region: 'ca-central-1',
  endpoint: 'http://localhost:8000'
};

const dynamodb = new AWS.DynamoDB(options);

async function run() {
  for (const item of data.Items) {
    const itemObj = {
      TableName: TABLE_NAME,
      Item: item
    };
    const res = await dynamodb.putItem(itemObj).promise();
  }
}

run();
