const AWS = require('aws-sdk');
const { de } = require('date-fns/locale');
const readline = require('readline');
const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';
const sourceRegion = 'ca-central-1';
const destRegion = 'local-env';

const sourceDynamoDB = new AWS.DynamoDB.DocumentClient({
  region: sourceRegion,
  endpoint: `https://dynamodb.${sourceRegion}.amazonaws.com`
});

const destinationDynamoDB = new AWS.DynamoDB.DocumentClient({
  region: destRegion,
  endpoint: `http://172.17.0.1:8000`
});

const destinationDynamoDBService = new AWS.DynamoDB({
  region: destRegion,
  endpoint: `http://172.17.0.1:8000`
});

const params = {
  TableName: TABLE_NAME
};

async function run() {
  
  await tableExists();

  let data = await sourceDynamoDB.scan(params).promise();
  console.log("data.Items.length:", data.Items.length); 
  console.log("LastEvaluatedKey:", data.LastEvaluatedKey);
  let key = data.LastEvaluatedKey;
  while (typeof key !== "undefined") {
    await restoreData(data);
    const res = await sourceDynamoDB.scan({ ...params, ExclusiveStartKey: key }).promise();
    console.log("data.Items.length:", res.Items.length);
    data.Items = res.Items;
    key = res.LastEvaluatedKey;
  }

  process.stdout.write(`${index.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Records Processed\r\n`);
}

async function tableExists() {
  try {
    await destinationDynamoDBService.describeTable(params).promise();
    console.log(`Table ${TABLE_NAME} exists in destination DynamoDB.`);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      rl.question(`Table ${TABLE_NAME} already exists in destination DynamoDB. Do you want to delete it and recreate? (y/n): `, (answer) => {
        resolve(answer);
        rl.close();
      });
    });

    if (answer.toLowerCase() === 'y') {
      await destinationDynamoDBService.deleteTable(params).promise();
      console.log(`Table ${TABLE_NAME} deleted in destination DynamoDB.`);
      await createTable();
    } else {
      console.log(`Table ${TABLE_NAME} will not be deleted.`);
    }
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      console.log(`Table ${TABLE_NAME} does not exist in destination DynamoDB.`);
      await createTable();
    } else {
      throw error;
    }
  }
}

async function restoreData(data) {
  console.log("Processing data:", data.Items.length);

  if (data.Items && data.Items.length > 0) {
      // console.log("Sending data to DynamoDB at endpoint:", destinationDynamoDB.options.endpoint);
      const BATCH_SIZE = 25;
      for (let i = 0; i < data.Items.length; i += BATCH_SIZE) {
        const batch = data.Items.slice(i, i + BATCH_SIZE);
        const batchWriteParams = {
          RequestItems: {
            [TABLE_NAME]: batch.map(item => ({
              PutRequest: {
                Item: item
              }
            }))
          }
        };

        await destinationDynamoDB.batchWrite(batchWriteParams).promise();
        const batchesLeft = Math.ceil((data.Items.length - (i + BATCH_SIZE)) / BATCH_SIZE);
        process.stdout.write(`Batches written: ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(data.Items.length / BATCH_SIZE)}. Total items written: ${i + batch.length}/${data.Items.length}. Batches left: ${batchesLeft}\r`);
      }
      process.stdout.write('\r\x1b[K');
  }
}

async function createTable() {
  const createTableParams = {
    TableName: TABLE_NAME,
    KeySchema: [
      { AttributeName: "pk", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" }
    ],
    AttributeDefinitions: [
      { AttributeName: "pk", AttributeType: "S" },
      { AttributeName: "sk", AttributeType: "S" }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 40000,
      WriteCapacityUnits: 40000
    }
  };

  await destinationDynamoDBService.createTable(createTableParams).promise();
  console.log(`Table ${TABLE_NAME} created in destination DynamoDB.`);
}

run();
