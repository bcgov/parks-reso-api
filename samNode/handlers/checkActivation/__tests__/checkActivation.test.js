const MockDate = require('mockdate');
const { DateTime } = require('luxon');
const checkActivation = require('../index');
const { REGION, ENDPOINT } = require('../../../__tests__/settings');
const { createDB, deleteDB, getHashedText } = require('../../../__tests__/setup.js')
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb");

async function setupDb(tableName) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });
  const bookingTimeParams = {
      TableName: tableName,
      Item: marshall({
        pk: 'config',
        sk:  'config',
        BOOKING_OPENING_HOUR: 7
      })
    }

  const openingHourCommand = new PutItemCommand(bookingTimeParams);
  await dynamoClient.send(openingHourCommand);
  const testParkParams = {
      TableName: tableName,
      Item: marshall({
        pk: 'park',
        sk: 'Test Park',
        name: 'Test Park',
        description: 'x',
        bcParksLink: 'x',
        status: 'open',
        visible: true
      })
    }
  const testParkPutCommand = new PutItemCommand(testParkParams);
  await dynamoClient.send(testParkPutCommand);
  const facilityAParams = {
      TableName: tableName,
      Item: marshall({
        pk: 'facility::Test Park',
        sk: 'Parking Lot A',
        name: 'Parking Lot A',
        status: 'open',
        visible: true,
        qrcode: true,
        type: 'parking'
      })
    }
  
    const facilityAPutCommand = new PutItemCommand(facilityAParams);
    await dynamoClient.send(facilityAPutCommand);
    const facilityBParams = {
      TableName: tableName,
      Item: marshall({
        pk: 'facility::Test Park',
        sk: 'Parking Lot B',
        name: 'Parking Lot B',
        status: 'open',
        visible: true,
        qrcode: true,
        type: 'parking',
        bookingOpeningHour: 10,
      })
    }
    const facilityBPutCommand = new PutItemCommand(facilityBParams);
    await dynamoClient.send(facilityBPutCommand);
}

describe('checkActivationHandler', () => {
  const OLD_ENV = process.env.TABLE_NAME;
  let hash;

  beforeEach(async () => {
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash;
    await createDB(hash);
    await setupDb(hash);
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV;
  });

  test.each([['AM', '123456702'], ['DAY', '123456703']])('should set %s passes with default opening hour to active', async (passType, sk) => {
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    const params = {
        TableName: hash,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: sk,
          facilityName: 'Parking Lot A',
          type: passType,
          registrationNumber: sk,
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        })
      }
    await dynamoClient.send(new PutItemCommand(params));
    MockDate.set(new Date('2021-12-08T19:01:58.135Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();
    const getParam = {
        TableName: hash,
        Key: {
          pk: {S: 'pass::Test Park'},
          sk: {S: sk}
        }
      }
    let result = await dynamoClient.send(new GetItemCommand(getParam));
    result = unmarshall(result.Item);
    expect(result.passStatus).toBe('active');
  });

  test.each([['AM', '123456704'], ['DAY', '123456705']])('should leave %s passes inactive before custom opening hour', async (passType, sk) => {
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    const params = {
        TableName: hash,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: sk,
          facilityName: 'Parking Lot B',
          type: passType,
          registrationNumber: sk,
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        })
      }
    await dynamoClient.send(new PutItemCommand(params));
    MockDate.set(new Date('2021-12-08T17:01:58.135Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();

    const getParam = {
        TableName: hash,
        Key: {
          pk: {S: 'pass::Test Park'},
          sk: {S: sk},
        }
      }
    let result = await dynamoClient.send(new GetItemCommand(getParam));
    result = unmarshall(result.Item);
    expect(result.passStatus).toBe('reserved');
  });

  test.each([['AM', '123456706'], ['DAY', '123456707']])('should set %s passes to active after custom opening hour', async (passType, sk) => {
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    const params = {
        TableName: hash,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: sk,
          facilityName: 'Parking Lot B',
          type: passType,
          registrationNumber: sk,
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        })
      }
    res = await dynamoClient.send(new PutItemCommand(params))
;   MockDate.set(new Date('2021-12-08T18:00:00.00Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();

    const getParam = {
        TableName: hash,
        Key: {
          pk: {S: 'pass::Test Park'},
          sk: {S: sk},
        }
      }
    let result = await dynamoClient.send(new GetItemCommand(getParam));
    result = unmarshall(result.Item);
    expect(result.passStatus).toBe('active');
  });

  test('should leave PM passes before 12:00 inactive', async () => {
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    const params = {
        TableName: hash,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: '123456708',
          facilityName: 'Parking Lot A',
          type: 'PM',
          registrationNumber: '123456708',
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        })
      }
    const res = await dynamoClient.send(new PutItemCommand(params));
    MockDate.set(new Date('2021-12-08T19:59:59.999Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();

    const getParam = {
        TableName: hash,
        Key: {
          pk: {S: 'pass::Test Park'},
          sk: {S: '123456708'}
        }
      }
    let result2 = await dynamoClient.send(new GetItemCommand(getParam)); 
    result2 = unmarshall(result2.Item);
    expect(result2.passStatus).toBe('reserved');
  });

  test('should set PM passes after 12:00 to active', async () => {
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    const params = {
        TableName: hash,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: '123456709',
          facilityName: 'Parking Lot A',
          type: 'PM',
          registrationNumber: '123456709',
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        })
      }
    await dynamoClient.send(new PutItemCommand(params));
    MockDate.set(new Date('2021-12-08T22:01:58.135Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();

    const getParam = {
        TableName: hash,
        Key: {
          pk: {S: 'pass::Test Park'},
          sk: {S: '123456709'}
        }
      }
    let result = await dynamoClient.send(new GetItemCommand(getParam));
    result = unmarshall(result.Item);
    expect(result.passStatus).toBe('active');
  });
});
