const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb");
const { REGION, ENDPOINT, TIMEZONE } = require('../../__tests__/settings');
const { createDB, deleteDB, getHashedText } = require('../../__tests__/setup.js')
const jwt = require('jsonwebtoken');
const { DateTime } = require('luxon');
const ALGORITHM = process.env.ALGORITHM || "HS384";

const today = DateTime.now().setZone(TIMEZONE);
const tomorrow = today.plus({ days: 1 });
const yesterday = today.minus({ days: 1 });


const mockedSysadmin = {
  decodeJWT: jest.fn((event) => {
    // console.log("STUB");
  }),
  resolvePermissions: jest.fn((token) => {
    return {
      isAdmin: true,
      roles: ['sysadmin'],
      isAuthenticated: true,
    }
  }),
  getParkAccess: jest.fn((orcs, permissionObject) => {
    return;
  })
};

const mockedRoleBasedUser = {
  decodeJWT: jest.fn((event) => {
    // console.log("STUB");
  }),
  resolvePermissions: jest.fn((token) => {
    return {
      isAdmin: false,
      roles: ['someparkrole'],
      isAuthenticated: true
    }
  }),
  getParkAccess: jest.fn((orcs, permissionObject) => {
    return {};
  })
};

const mockPark = {
  pk: 'park',
  sk: 'Test Park',
  name: 'Test Park',
  description: '<p>My Description</p>',
  bcParksLink: 'http://google.ca',
  mapLink: 'https://maps.google.com',
  status: 'open',
  visible: true
}

const mockFacility = {
  pk: 'facility::Test Park',
  sk: 'Test Facility',
  name: 'Test Facility',
  description: 'A Parking Lot!',
  isUpdating: false,
  type: "Parking",
  bookingTimes: {
    DAY: {
      max: 3
    }
  },
  bookingDays: {
    "Sunday": true,
    "Monday": true,
    "Tuesday": true,
    "Wednesday": true,
    "Thursday": true,
    "Friday": true,
    "Saturday": true
  },
  bookingDaysRichText: '',
  bookableHolidays: [],
  status: { stateReason: '', state: 'open' },
  qrcode: true,
  visible: true
}

const token = jwt.sign({ foo: 'bar' }, 'shhhhh', { algorithm: ALGORITHM });

describe('Read Metrics General', () => {
  const OLD_ENV = process.env.TABLE_NAME;
  let hash
  let TABLE_NAME
  beforeEach(async () => {
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    hash = hash.length > 200 ? hash.substring(0, 200) : hash;
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME
    await createDB(hash)
    await databaseOperation( TABLE_NAME)
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV; // Restore old environment
  });

  test('Unauthorized', async () => {
    const readMetricsHandler = require('../../handlers/readMetrics/index');
    const event = {
      headers: {
        Authorization: 'Bearer ' + token + 'invalid'
      },
      httpMethod: 'GET'
    };
    expect(await readMetricsHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403,
    })
  });

  test('Missing query parameters', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return mockedSysadmin;
    });
    const readMetricsHandler = require('../../handlers/readMetrics/index');
    const event = {
      headers: {
        Authorization: 'Bearer ' + token
      },
      httpMethod: 'GET'
    };
    expect(await readMetricsHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Invalid Request: Missing query parameters."}',
      statusCode: 400,
    })
  })

  test('Specific park authentication - user does not have specific park', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return mockedRoleBasedUser;
    });
    const readMetricsHandler = require('../../handlers/readMetrics/index');
    const event = {
      headers: {
        Authorization: 'Bearer ' + token
      },
      queryStringParameters: {
        park: '0015',
        facility: 'P1 and Lower P5',
        startDate: '2023-03-27'
      },
      httpMethod: 'GET'
    };
    expect(await readMetricsHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Unauthorized - user does not have the specific park role."}',
      statusCode: 403,
    })
  })

  test('Invalid dates', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return mockedSysadmin;
    });
    const readMetricsHandler = require('../../handlers/readMetrics/index');
    const event = {
      headers: {
        Authorization: 'Bearer ' + token
      },
      queryStringParameters: {
        park: '0015',
        facility: 'P1 and Lower P5',
      },
      httpMethod: 'GET'
    };
    Object.assign(event.queryStringParameters, { startDate: 'invalid' })
    expect(await readMetricsHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Invalid or malformed dates.","title":"Invalid dates","error":"Start date (invalid) is invalid."}',
      statusCode: 400,
    });
    Object.assign(event.queryStringParameters, { startDate: '2023-01-03', endDate: 'invalid' })
    expect(await readMetricsHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Invalid or malformed dates.","title":"Invalid dates","error":"End date (invalid) is invalid."}',
      statusCode: 400,
    });
    Object.assign(event.queryStringParameters, { startDate: '2023-01-03', endDate: '2023-01-02' })
    expect(await readMetricsHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Invalid or malformed dates.","title":"Invalid dates","error":"End date (2023-01-02) must be greater than or equal to the start date (2023-01-03)"}',
      statusCode: 400,
    });
  })

  test('Valid response', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return mockedSysadmin;
    });
    // no such thing as metrics table in test
    process.env.METRICS_TABLE_NAME = TABLE_NAME;
    const readMetricsHandler = require('../../handlers/readMetrics/index');
    const event = {
      headers: {
        Authorization: 'Bearer ' + token
      },
      queryStringParameters: {
        park: 'MOCK',
        facility: 'Mock Facility',
        startDate: '2023-01-01',
      },
      httpMethod: 'GET'
    };
    const res = await readMetricsHandler.handler(event, null);
    expect(res.statusCode).toEqual(200);
  });
})

let newMetricsList = [];
describe('Metrics utils general', () => {
  const OLD_ENV = process.env.TABLE_NAME;
  let hash
  let TABLE_NAME
  beforeEach(async () => {
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    hash = hash.length > 200 ? hash.substring(0, 200) : hash;
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME
    await createDB(hash)
    await databaseOperation( TABLE_NAME)
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV; // Restore old environment
  });

  test('Create metric - today - simple', async () => {
    const { createMetric } = require('../metricsLayer/metricsLayer');
    const res = await createMetric(mockPark, mockFacility, today.toISODate());
    expect(res.sk).toEqual(today.toISODate());
    expect(res.cancelled).toEqual(0);
    expect(res.totalPasses).toEqual(1);
    expect(res.fullyBooked).toEqual(false);
    expect(res.capacities.DAY).toEqual({
      baseCapacity: 3,
      capacityModifier: 0,
      availablePasses: 2,
      overbooked: 0,
      checkedIn: 1,
      passStatuses: {
        active: 1
      }
    });
    newMetricsList.push(res);
  })

  test('Create metric - tomorrow, fully booked, 1 overbooked', async () => {
    const { createMetric } = require('../metricsLayer/metricsLayer');
    const res = await createMetric(mockPark, mockFacility, tomorrow.toISODate());
    expect(res.sk).toEqual(tomorrow.toISODate());
    expect(res.cancelled).toEqual(0);
    expect(res.totalPasses).toEqual(5);
    expect(res.fullyBooked).toEqual(true);
    expect(res.capacities.DAY).toEqual({
      baseCapacity: 3,
      capacityModifier: 1,
      availablePasses: 0,
      overbooked: 1,
      checkedIn: 0,
      passStatuses: {
        reserved: 5
      }
    });
    newMetricsList.push(res);
  })

  test('Create metric - yesterday, 1 cancellation, 1 expired', async () => {
    const { createMetric } = require('../metricsLayer/metricsLayer');
    const res = await createMetric(mockPark, mockFacility, yesterday.toISODate());
    expect(res.sk).toEqual(yesterday.toISODate());
    expect(res.cancelled).toEqual(1);
    expect(res.totalPasses).toEqual(1);
    expect(res.fullyBooked).toEqual(false);
    expect(res.capacities.DAY).toEqual({
      baseCapacity: 3,
      capacityModifier: 0,
      availablePasses: 2,
      overbooked: 0,
      checkedIn: 1,
      passStatuses: {
        expired: 1, cancelled: 1
      }
    });
    newMetricsList.push(res);
  })

})

// create new describe to ensure it runs after the previous describe block
describe('Metrics post', () => {
  const OLD_ENV = process.env.TABLE_NAME;
  let hash
 
  beforeEach(async () => {
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    // hash = hash.length > 200 ? hash.substring(0, 200) : hash;
    // hash = hash.replace(/[^\w\-\.]/g, '');
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME
    //There is no such thing as a metrics table in test
    process.env.METRICS_TABLE_NAME = TABLE_NAME;
    await createDB(hash)
    await databaseOperation(process.env.TABLE_NAME);
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV; // Restore old environment
  });
  

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  test('Post all metrics', async () => {
    const { postAllMetrics } = require('../metricsLayer/metricsLayer');
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    const res = await postAllMetrics(newMetricsList);
    // Three new metrics were created
    console.log(res)
    expect(res).toEqual(3);
    const dates = [today, tomorrow, yesterday];
    for (const date of dates) {
      const params = {
        TableName: TABLE_NAME,
        Key: marshall({
          pk: `metrics::Test Park::Test Facility`,
          sk: date.toISODate()
        })
      }

      const res = await dynamoClient.send(new GetItemCommand(params))
      const check = unmarshall(res.Item);
      // expect metric item to exist in db
      expect(check).toBeTruthy();
    }
  })
})

async function databaseOperation(TABLE_NAME) {
  
      const dynamoClient = new DynamoDBClient({
        region: REGION,
        endpoint: ENDPOINT
      });

      const params = {
        TableName: TABLE_NAME,
        Item: marshall(mockPark)
      }
      await dynamoClient.send(new PutItemCommand(params))

      const params2 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: 'reservations::Test Park::Test Facility',
          sk: today.toISODate(),
          capacities: {
            DAY: {
              baseCapacity: 3,
              capacityModifier: 0,
              availablePasses: 2,
              overbooked: 0
            }
          }
        })
      }
      await dynamoClient.send(new PutItemCommand(params2))
      
      const params3 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: 'reservations::Test Park::Test Facility',
          sk: tomorrow.toISODate(),
          capacities: {
            DAY: {
              baseCapacity: 3,
              capacityModifier: 1,
              availablePasses: 0,
              overbooked: 1
            }
          }
        })
      }
      await dynamoClient.send(new PutItemCommand(params3))

      const params4 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: 'reservations::Test Park::Test Facility',
          sk: yesterday.toISODate(),
          capacities: {
            DAY: {
              baseCapacity: 3,
              capacityModifier: 0,
              availablePasses: 2,
              overbooked: 0
            }
          }
        })
      }

      await dynamoClient.send(new PutItemCommand(params4))
      
      const params5 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: '1',
          checkedIn: true,
          checkedInTime: today.toISO(),
          passStatus: 'active',
          shortPassDate: today.toISODate(),
          facilityName: 'Test Facility',
          numberOfGuests: 1,
          type: 'DAY'
        })
      }
      await dynamoClient.send(new PutItemCommand(params5))

      const params6 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: '2',
          checkedIn: false,
          passStatus: 'reserved',
          shortPassDate: tomorrow.toISODate(),
          facilityName: 'Test Facility',
          numberOfGuests: 4,
          type: 'DAY'
        })
      }
      await dynamoClient.send(new PutItemCommand(params6))

      const params7 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: '3',
          checkedIn: false,
          passStatus: 'reserved',
          shortPassDate: tomorrow.toISODate(),
          facilityName: 'Test Facility',
          numberOfGuests: 1,
          type: 'DAY',
          isOverbooked: true
        })
      }
      await dynamoClient.send(new PutItemCommand(params7))

      const params8 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: '4',
          checkedIn: true,
          checkedInTime: yesterday.toISO(),
          passStatus: 'expired',
          shortPassDate: yesterday.toISODate(),
          facilityName: 'Test Facility',
          numberOfGuests: 1,
          type: 'DAY',
        })
      }
      await dynamoClient.send(new PutItemCommand(params8))
      
      const params9 = {
        TableName: TABLE_NAME,
        Item: marshall({
          pk: 'pass::Test Park',
          sk: '5',
          passStatus: 'cancelled',
          shortPassDate: yesterday.toISODate(),
          facilityName: 'Test Facility',
          numberOfGuests: 1,
          type: 'DAY',
        })
      }
      await dynamoClient.send(new PutItemCommand(params9))

    }
