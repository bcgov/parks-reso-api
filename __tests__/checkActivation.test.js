const MockDate = require('mockdate');
const { DateTime } = require('luxon');
const { dbTools } = require('./global/dbTools')
const checkActivation = require('../lambda/checkActivation/index');
const { TABLE_NAME } = require('./global/settings');

async function populateDb(docClient) {
  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        pk: 'config',
        sk: 'config',
        BOOKING_OPENING_HOUR: 7
      }
    })
    .promise();
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
        type: 'parking',
        reservations: {},
        bookingOpeningHour: null,
        bookingDaysAhead: null
      }
    })
    .promise();
  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        pk: 'facility::Test Park',
        sk: 'Parking Lot B',
        name: 'Parking Lot B',
        description: '',
        bcParksLink: '',
        status: 'open',
        visible: true,
        type: 'parking',
        reservations: {},
        bookingOpeningHour: 10,
        bookingDaysAhead: null
      }
    })
    .promise();
}

describe('checkActivationHandler', () => {

  let mockClient;

  beforeAll(async () => {
    mockClient = await dbTools.createDocClient();
    await populateDb(mockClient);
  });

  afterAll(async () => {
    await dbTools.clearTable();
  })

  test.each([['AM', '123456702'], ['DAY', '123456703']])('should set %s passes with default opening hour to active', async (passType, sk) => {
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    await mockClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: sk,
          facilityName: 'Parking Lot A',
          type: passType,
          registrationNumber: sk,
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-08T19:01:58.135Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();

    const result = await mockClient
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

  test.each([['AM', '123456704'], ['DAY', '123456705']])('should leave %s passes inactive before custom opening hour', async (passType, sk) => {
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    await mockClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: sk,
          facilityName: 'Parking Lot B',
          type: passType,
          registrationNumber: sk,
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-08T17:01:58.135Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();

    const result = await mockClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          pk: 'pass::Test Park',
          sk: sk,
        }
      })
      .promise();
    expect(result.Item.passStatus).toBe('reserved');
  });

  test.each([['AM', '123456706'], ['DAY', '123456707']])('should set %s passes to active after custom opening hour', async (passType, sk) => {
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    await mockClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: sk,
          facilityName: 'Parking Lot B',
          type: passType,
          registrationNumber: sk,
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-08T18:00:00.00Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();

    const result = await mockClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          pk: 'pass::Test Park',
          sk: sk,
        }
      })
      .promise();
    expect(result.Item.passStatus).toBe('active');
  });

  test('should leave PM passes before 12:00 inactive', async () => {
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    await mockClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: '123456708',
          facilityName: 'Parking Lot A',
          type: 'PM',
          registrationNumber: '123456708',
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-08T19:59:59.999Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();

    const result = await mockClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          pk: 'pass::Test Park',
          sk: '123456708'
        }
      })
      .promise();
    expect(result.Item.passStatus).toBe('reserved');
  });

  test('should set PM passes after 12:00 to active', async () => {
    const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
    await mockClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park',
          sk: '123456709',
          facilityName: 'Parking Lot A',
          type: 'PM',
          registrationNumber: '123456709',
          passStatus: 'reserved',
          date: passDate.toUTC().toISO()
        }
      })
      .promise();

    MockDate.set(new Date('2021-12-08T22:01:58.135Z'));
    await checkActivation.handler(null, {});
    MockDate.reset();

    const result = await mockClient
      .get({
        TableName: TABLE_NAME,
        Key: {
          pk: 'pass::Test Park',
          sk: '123456709'
        }
      })
      .promise();
    expect(result.Item.passStatus).toBe('active');
  });
});
