const MockDate = require('mockdate');
const { DateTime } = require('luxon');
const AWS = require('aws-sdk');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');

const checkExpiry = require('../lambda/checkExpiry/index');

const { REGION, ENDPOINT, TABLE_NAME } = require('./global/settings');

let docClient;

async function setupDb() {
  new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });
  docClient = new DocumentClient({
    region: REGION,
    endpoint: ENDPOINT,
    convertEmptyValues: true
  });

  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        pk: 'park',
        sk: 'Test Park',
        name: 'Test Park',
        description: '',
        bcParksLink: '',
        status: 'open',
        visible: true
      }
    })
    .promise();
  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        pk: 'facility::Test Park',
        sk: 'Parking Lot A',
        name: 'Parking Lot A',
        description: '',
        bcParksLink: '',
        status: 'open',
        visible: true,
        qrcode: true,
        type: 'parking',
        reservations: {},
        bookingOpeningHour: null,
        bookingDaysAhead: null
      }
    })
    .promise();
}

describe('checkExpiryHandler', () => {
  beforeAll(() => {
    return setupDb();
  });

  test.each([['AM', '123456710'], ['PM', '123456711'], ['DAY', '123456712']])('should set %s passes from yesterday to expired', async (passType, sk) => {
    const passDate = DateTime.fromISO('2021-12-08T20:00:00.000Z');
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: sk,
          facilityName: 'Parking Lot A',
          type: passType,
          registrationNumber: sk,
          passStatus: 'active',
          date: passDate.toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-19T00:00:00.000Z'));
    await checkExpiry.handler(null, {});
    MockDate.reset();

    const result = await docClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          pk: 'pass::Test Park',
          sk: sk
        }
      })
      .promise();
    expect(result.Item.passStatus).toBe('expired');
  });

  test.each([['PM', '123456713'], ['DAY', '123456714']])('should not set %s passes from today to expired', async (passType, sk) => {
    const passDate = DateTime.fromISO('2021-12-08T20:00:00.000Z');
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: sk,
          facilityName: 'Parking Lot A',
          type: passType,
          registrationNumber: sk,
          passStatus: 'active',
          date: passDate.toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-08T21:00:00.000Z'));
    await checkExpiry.handler(null, {});
    MockDate.reset();

    const result = await docClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          pk: 'pass::Test Park',
          sk: sk
        }
      })
      .promise();
    expect(result.Item.passStatus).toBe('active');
  });

  test.each([['PM', '123456799'], ['DAY', '123456798']])('should set %s passes from today to expired if it is after 18:00', async (passType, sk) => {
    const passDate = DateTime.fromISO('2021-12-08T20:00:00.000Z');
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: sk,
          facilityName: 'Parking Lot A',
          type: passType,
          registrationNumber: sk,
          passStatus: 'active',
          date: passDate.toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-09T03:00:00.000Z'));
    await checkExpiry.handler(null, {});
    MockDate.reset();

    const result = await docClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          pk: 'pass::Test Park',
          sk: sk
        }
      })
      .promise();
    expect(result.Item.passStatus).toBe('expired');
  });

  test('should set AM passes to expired after 12:00', async () => {
    const passDate = DateTime.fromISO('2021-12-08T20:00:00.000Z');
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: '123456715',
          facilityName: 'Parking Lot A',
          type: 'AM',
          registrationNumber: '123456715',
          passStatus: 'active',
          date: passDate.toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-08T22:00:00.000Z'));
    await checkExpiry.handler(null, {});
    MockDate.reset();

    const result = await docClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          pk: 'pass::Test Park',
          sk: '123456715'
        }
      })
      .promise();
    expect(result.Item.passStatus).toBe('expired');
  });

  test('should set not AM passes to expired before 12:00', async () => {
    const passDate = DateTime.fromISO('2021-12-08T20:00:00.000Z');
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: '123456716',
          facilityName: 'Parking Lot A',
          type: 'AM',
          registrationNumber: '123456716',
          passStatus: 'active',
          date: passDate.toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-08T16:00:00.000Z'));
    await checkExpiry.handler(null, {});
    MockDate.reset();

    const result = await docClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          pk: 'pass::Test Park',
          sk: '123456716'
        }
      })
      .promise();
    expect(result.Item.passStatus).toBe('active');
  });

});
