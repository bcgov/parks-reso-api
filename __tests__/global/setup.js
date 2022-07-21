const AWS = require('aws-sdk');

const { REGION, ENDPOINT, TABLE_NAME } = require('./settings');

module.exports = async () => {
  dynamoDb = new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });

  // TODO: This should pull in the JSON version of our serverless.yml!

  try {
    let res = await dynamoDb
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
          }
        ]
      })
      .promise();
  } catch (err) {
    console.log(err);
  }
};
