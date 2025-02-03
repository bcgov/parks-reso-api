const {
  ScanCommand,
  DynamoDBClient,
  DescribeTableCommand,
  BatchWriteItemCommand
} = require('@aws-sdk/client-dynamodb');
const TABLE_NAME = process.env.TABLE_NAME || 'ParksDUP';
const ARCHIVE_TABLE_NAME = process.env.ARCHIVE_TABLE_NAME || 'archivedPasses';
const REGION = process.env.REGION || 'ca-central-1'; 
const DYNAMODB_ENDPOINT_URL = process.env.DYNAMODB_ENDPOINT_URL || 'http://172.17.0.2:8000';
const { DateTime } = require("luxon");

const twoYearsAgo = DateTime.now().minus({ years: 2 }).startOf('month').toISO();

const options = {
  region: REGION,
  endpoint: DYNAMODB_ENDPOINT_URL
};
const IS_OFFLINE = process.env.IS_OFFLINE || true;

if (IS_OFFLINE === 'True') {
  options.endpoint = 'http://172.17.0.2:8000';
}
const dynamoClient = new DynamoDBClient(options);
const params = {
  TableName: TABLE_NAME
};

const archiveParams = {
  TableName: ARCHIVE_TABLE_NAME
};

const scanObj = {
  TableName: TABLE_NAME,
  ConsistentRead: true,
  ExpressionAttributeNames: {
    '#pk': 'pk',
    '#date': 'date'
  },
  ExpressionAttributeValues: {
    ':beginsWith': {
      S: 'pass::'
    },
    ':maxDate': {
      S: twoYearsAgo
    }
  },
  FilterExpression: 'begins_with(#pk, :beginsWith) AND #date < :maxDate'
};

exports.handler = async (event, context) => {

  await tableExists();
  let scanCommand = new ScanCommand(scanObj);
  let scanData = await dynamoClient.send(scanCommand);
  let key = scanData.LastEvaluatedKey;
  let index = 0;
  if (scanData.Items.length > 0) {
    await restoreData(scanData);
  }

  while (scanData.LastEvaluatedKey) {
    await restoreData(scanData);
    scanData = await dynamoClient.send(new ScanCommand({ ...scanObj, ExclusiveStartKey: key }));
    key = scanData.LastEvaluatedKey;
    index += scanData.Items.length;
  }
  process.stdout.write(`${index.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Records Processed\r\n`);
}

async function restoreData(data) {
  console.log('Processing data:', data.Items.length);

  if (data.Items && data.Items.length > 0) {
    const BATCH_SIZE = 25;
    for (let i = 0; i < data.Items.length; i += BATCH_SIZE) {
      const batch = data.Items.slice(i, i + BATCH_SIZE);
      const batchWriteParams = {
        RequestItems: {
          [ARCHIVE_TABLE_NAME]: batch.map((item) => ({
            PutRequest: {
              Item: item
            }
          }))
        }
      };

      const batchDeleteParams = {
        RequestItems: {
          [TABLE_NAME]: batch.map((item) => ({
            DeleteRequest: {
              Key: {
                pk: item.pk,
                sk: item.sk
              }
            }
          }))
        }
      };

      try {
        const result = await dynamoClient.send(new BatchWriteItemCommand(batchWriteParams));
        if (result.UnprocessedItems && result.UnprocessedItems[ARCHIVE_TABLE_NAME]) {
          console.warn(`Unprocessed write items: ${JSON.stringify(result.UnprocessedItems[ARCHIVE_TABLE_NAME])}`);
        }

        const deletedData = await dynamoClient.send(new BatchWriteItemCommand(batchDeleteParams));
        if (deletedData.UnprocessedItems && deletedData.UnprocessedItems[TABLE_NAME]) {
          console.warn(`Unprocessed delete items: ${JSON.stringify(deletedData.UnprocessedItems[TABLE_NAME])}`);
        }

        const totalBatches = Math.ceil(data.Items.length / BATCH_SIZE);
        const batchesLeft = totalBatches - (Math.floor(i / BATCH_SIZE) + 1);
        process.stdout.write(
          `Batches written: ${Math.floor(i / BATCH_SIZE) + 1}/${totalBatches}. Total items written: ${i + batch.length}/${data.Items.length}. Batches left: ${batchesLeft}\r`
        );
      } catch (error) {
        console.error('Error writing batch:', error);
        throw error;
      }
    }
    process.stdout.write('\r\x1b[K');
  }
}

async function tableExists() {
  try {
    let command = new DescribeTableCommand(params);
    let tableData = await dynamoClient.send(command);
    if (tableData) {
      console.log(`Table ${TABLE_NAME} exists in DynamoDB.`);
    }
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`Table ${TABLE_NAME} does not exist in destination DynamoDB.`);
      throw error;
    } else {
      throw error;
    }
  }

  try {
    let command = new DescribeTableCommand(archiveParams);
    let tableData = await dynamoClient.send(command);

    if (tableData) {
      console.log(`Table ${ARCHIVE_TABLE_NAME} exists in DynamoDB.`);
    }
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`Table ${ARCHIVE_TABLE_NAME} does not exist in destination DynamoDB.`);
      throw error;
    } else {
      throw error;
    }
  }
}