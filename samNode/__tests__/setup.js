const { DynamoDBClient, CreateTableCommand, DeleteItemCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const crypto = require('crypto');
const { REGION, ENDPOINT, TABLE_NAME } = require('./settings');

async function createDB(tableName = TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });
  try {
    const params = {
      TableName: tableName,
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
        },
        {
          AttributeName: 'shortPassDate',
          AttributeType: 'S'
        },
        {
          AttributeName: 'facilityName',
          AttributeType: 'S'
        },
        {
          AttributeName: 'passStatus',
          AttributeType: 'S'
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1
      },
      GlobalSecondaryIndexes: [
        {
          IndexName: 'passStatus-index',
          KeySchema: [
            {
              AttributeName: 'passStatus',
              KeyType: 'HASH'
            }
          ],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: [
              'type',
              'date',
              'facilityName',
              'pk',
              'sk'
            ]
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
          }
        },
        {
          IndexName: 'shortPassDate-index',
          KeySchema: [
            {
              AttributeName: 'shortPassDate',
              KeyType: 'HASH'
            },
            {
              AttributeName: 'facilityName',
              KeyType: 'RANGE'
            }
          ],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: [
              'firstName',
              'searchFirstName',
              'lastName',
              'searchLastName',
              'facilityName',
              'email',
              'date',
              'shortPassDate',
              'type',
              'registrationNumber',
              'numberOfGuests',
              'passStatus',
              'phoneNumber',
              'facilityType',
              'creationDate',
              'isOverbooked'
            ]
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
          }
        },
        {
          IndexName: 'manualLookup-index',
          KeySchema: [
            {
              AttributeName: 'shortPassDate',
              KeyType: 'HASH'
            },
            {
              AttributeName: 'facilityName',
              KeyType: 'RANGE'
            }
          ],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: [
              'email',
              'firstName',
              'lastName',
              'pk',
              'registrationNumber',
              'searchFirstName',
              'searchLastName',
              'sk',
              'passStatus',
              'checkedIn',
              'checkedInTime',
              'date',
              'type',
              'numberOfGuests',
              'phoneNumber',
              'facilityType',
              'license',
              'creationDate',
              'isOverbooked',
              'parkName',
              'park'
            ]
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
          }
        }
      ]
    }

    const createTable = new CreateTableCommand(params);
    await dynamoClient.send(createTable)
  } catch (err) {
    console.log(err);
  }
}

async function deleteDB(tableName = TABLE_NAME) {
  const dynamoDb = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  try {
    const param = {
        TableName: tableName
      };
    await dynamoDb.send(new DeleteTableCommand(param));
  } catch (err) {
    console.log(err);
  }
}

function getHashedText(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

module.exports = {
    getHashedText,
    deleteDB,
    createDB
}