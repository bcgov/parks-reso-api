
const jwt = require('jsonwebtoken');
const { REGION, ENDPOINT } = require('../../../__tests__/settings');
const { createDB, deleteDB, getHashedText } = require('../../../__tests__/setup.js');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const ALGORITHM = process.env.ALGORITHM || "HS384";


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

const mockedRegularUser = {
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

const token = jwt.sign({ foo: 'bar' }, 'shhhhh', { algorithm: ALGORITHM });

describe('WriteFacility General', () => {
  const OLD_ENV = process.env.TABLE_NAME;
  let hash
  let TABLE_NAME
  beforeEach(async()=>{
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME
    await createDB(hash)
    await databaseOperation(1, 'setup', TABLE_NAME);
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV; // Restore old environment
  });

  test('Handler - 403 Unauthorized - nothing passed in', async () => {
    const writeFacilityHandler = require('../index');
    expect(await writeFacilityHandler.handler(null, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('Handler - 403 Unauthorized - invalid token', async () => {
    const writeFacilityHandler = require('../index');
    const event = {
      headers: {
        Authorization: 'Bearer ' + token + 'invalid'
      },
      httpMethod: 'POST'
    };
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('GET fails - 405 - Not Implemented', async () => {
    const writeFacilityHandler = require('../index');
    const event = {
      headers: {
        Authorization: 'Bearer ' + token
      },
      httpMethod: 'GET'
    };
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Not Implemented"}',
      statusCode: 405
    });
  });

  test('Function fails on getParkAccess', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return {
        decodeJWT: jest.fn((event) => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn((token) => {
          return {
            isAdmin: false,
            roles: ['sysadmin'],
            isAuthenticated: true
          }
        })
      };
    });
    const handler = require('../index');
    const event = {
      headers: {
        Authorization: "Bearer " + token
      },
      httpMethod: 'POST',
      body: JSON.stringify({
        parkOrcs: '0011',
        bookingTimes: {
          AM: {
            max: 25
          },
          DAY: {
            max: 25
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
        visible: true,
        name: 'P1 and Lower P5',
        description: 'A Parking Lot!',
        qrcode: true,
        isUpdating: false,
        type: "Parking"
      })
    };
    const response = await handler.handler(event, null);
    expect(response.statusCode).toEqual(403);
  });
});

describe('Facility Access', () => {
  const OLD_ENV = process.env.TABLE_NAME;
  let hash
  let TABLE_NAME
  beforeEach(async()=>{
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME
    await createDB(hash)
    await databaseOperation(1, 'setup', TABLE_NAME);
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV; // Restore old environment
  });

  test('POST fails - 403 - Not an admin', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return mockedRegularUser;
    });
    const event = {
      headers: {
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({
        parkOrcs: '0019'
      }),
      httpMethod: 'POST'
    };
    const writeFacilityHandler = require('../index');
    const res = await writeFacilityHandler.handler(event, null);
    expect(res).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('QR Codes enabled on create', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return mockedSysadmin;
    });
    jest.mock('/opt/baseLayer)', () => {
      return {
        ...jest.requireActual('../../../layers/baseLayer/baseLayer.js'),
        getOne: jest.fn(() =>
          Promise.resolve({
            status: {
              state: 'open',
              stateReason: ''
            }
          })
        ),
        unmarshall: jest.fn(obj => obj)
      }
    });

    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });

    const handler = require('../index');
    const event = {
      headers: {
        Authorization: "Bearer " + token
      },
      httpMethod: 'POST',
      body: JSON.stringify({
        parkOrcs: '0011',
        bookingTimes: {
          AM: {
            max: 25
          },
          DAY: {
            max: 25
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
        visible: true,
        name: 'P1 and Lower P5',
        description: 'A Parking Lot!',
        qrcode: true,
        isUpdating: false,
        type: "Parking"
      })
    };
    const response = await handler.handler(event, null);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body).toBeDefined()
    const params =  {
      TableName: TABLE_NAME,
      Key: marshall({
        pk: 'facility::0011',
        sk: 'P1 and Lower P5'
      })
    }
    const res = await dynamoClient.send(new GetItemCommand(params))
    const dbRes = unmarshall(res.Item);
    expect(dbRes.qrcode).toEqual(true);
  });

  test('QR Codes enabled on update', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return mockedSysadmin;
    });
    jest.mock('/opt/baseLayer)', () => {
      return {
        ...jest.requireActual('../../../layers/baseLayer/baseLayer.js'),
        getOne: jest.fn(() =>
          Promise.resolve({
            status: {
              state: 'open',
              stateReason: ''
            }
          })
        ),
        unmarshall: jest.fn(obj => obj)
      }
    });

    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });

    const handler = require('../index');
    const event = {
      headers: {
        Authorization: "Bearer " + token
      },
      httpMethod: 'PUT',
      body: JSON.stringify({
        pk: 'facility::0010',
        sk: 'P1 and Lower P5',
        parkOrcs: '0010',
        bookingTimes: {
          AM: {
            max: 25
          },
          DAY: {
            max: 25
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
        visible: true,
        name: 'P1 and Lower P5',
        description: 'A Parking Lot!',
        qrcode: false,
        isUpdating: false,
        type: "Parking"
      })
    };
    const response = await handler.handler(event, null);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    let params = {
      TableName: TABLE_NAME,
      Key: marshall({
        pk: 'facility::0010',
        sk: 'P1 and Lower P5'
      })
    }
    const res = await dynamoClient.send(new GetItemCommand(params))
    const dbRes = unmarshall(res.Item)
    expect(dbRes.qrcode).toEqual(false);
  });
});

async function databaseOperation(version, mode, TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });
  if (version === 1) {
    if (mode === 'setup') {
     const params = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'facility::0010',
            sk: 'P1 and Lower P5',
            parkOrcs: '0015',
            name: 'P1 and Lower P5',
            description: 'A Trail!',
            qrcode: true,
            isUpdating: false,
            type: "Trail",
            bookingTimes: {
              AM: {
                max: 25
              },
              DAY: {
                max: 25
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
            visible: true
          })
        }
    await dynamoClient.send(new PutItemCommand(params))
    }
  }
}

describe('ParkAccess', () => {

  const OLD_ENV = process.env.TABLE_NAME;
  let hash
  let TABLE_NAME
  beforeEach(async()=>{
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME
    await createDB(hash)
    await databaseOperation(1, 'setup', TABLE_NAME);
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV; // Restore old environment
  });

  
  test('GET fails General - 403 - Unauthorized', async () => {
    const writeFacilityHandler = require('../index');
    expect(await writeFacilityHandler.handler(null, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('POST fails General - 403 - Unauthorized', async () => {
    const event = {
      httpMethod: 'POST'
    }
    const writeFacilityHandler = require('../index');
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('PUT fails General - 403 - Unauthorized', async () => {
    const event = {
      httpMethod: 'PUT'
    }
    const writeFacilityHandler = require('../index');
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('GET fails - 405 - Not Implemented', async () => {
    const event = {
      headers: {
        something: false
      },
      body: JSON.stringify({}),
      httpMethod: 'GET'
    };
    const writeFacilityHandler = require('../index');
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Not Implemented"}',
      statusCode: 405
    });
  });
});
