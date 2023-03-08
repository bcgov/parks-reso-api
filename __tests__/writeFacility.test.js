const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const jwt = require('jsonwebtoken');
const { REGION, ENDPOINT, TABLE_NAME } = require('./global/settings');
const ALGORITHM = process.env.ALGORITHM || "HS384";

const ddb = new DocumentClient({
  region: REGION,
  endpoint: ENDPOINT,
  convertEmptyValues: true
});

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
  test('Handler - 403 Unauthorized - nothing passed in', async () => {
    const writeFacilityHandler = require('../lambda/writeFacility/index');
    expect(await writeFacilityHandler.handler(null, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('Handler - 403 Unauthorized - invalid token', async () => {
    const writeFacilityHandler = require('../lambda/writeFacility/index');
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
    const writeFacilityHandler = require('../lambda/writeFacility/index');
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
    jest.mock('../lambda/permissionUtil', () => {
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
    const handler = require('../lambda/writeFacility/index');
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
  const OLD_ENV = process.env;
  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV }; // Make a copy of environment
    await databaseOperation(1, 'setup');
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  afterEach(async () => {
    await databaseOperation(1, 'teardown');
  });

  test('POST fails - 403 - Not an admin', async () => {
    jest.mock('../lambda/permissionUtil', () => {
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
    const writeFacilityHandler = require('../lambda/writeFacility/index');
    const res = await writeFacilityHandler.handler(event, null);
    expect(res).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('QR Codes enabled on create', async () => {
    jest.mock('../lambda/permissionUtil', () => {
      return mockedSysadmin;
    });
    const handler = require('../lambda/writeFacility/index');
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
    expect(body).toEqual({});
    let params = {
      TableName: TABLE_NAME,
      Key: {
        pk: 'facility::0011',
        sk: 'P1 and Lower P5'
      }
    }

    let dbRes = await ddb.get(params).promise();
    expect(dbRes.Item?.qrcode).toEqual(true);
  });

  test('QR Codes enabled on update', async () => {
    jest.mock('../lambda/permissionUtil', () => {
      return mockedSysadmin;
    });
    const handler = require('../lambda/writeFacility/index');
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
      Key: {
        pk: 'facility::0010',
        sk: 'P1 and Lower P5'
      }
    }

    let dbRes = await ddb.get(params).promise();
    expect(dbRes.Item?.qrcode).toEqual(false);
  });
});

async function databaseOperation(version, mode) {
  if (version === 1) {
    if (mode === 'setup') {
      await ddb
        .put({
          TableName: TABLE_NAME,
          Item: {
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
          }
        })
        .promise();
    } else {
      console.log('Teardown');
      // Teardown
      await ddb
        .delete({
          TableName: TABLE_NAME,
          Key: {
            pk: 'facility::0010',
            sk: 'P1 and Lower P5'
          }
        })
        .promise();
      await ddb
        .delete({
          TableName: TABLE_NAME,
          Key: {
            pk: 'facility::0011',
            sk: 'P1 and Lower P5'
          }
        })
        .promise();
    }
  }
}

describe('ParkAccess', () => {
  test('GET fails General - 403 - Unauthorized', async () => {
    const writeFacilityHandler = require('../lambda/writeFacility/index');
    expect(await writeFacilityHandler.handler(null, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('POST fails General - 403 - Unauthorized', async () => {
    const event = {
      httpMethod: 'POST'
    }
    const writeFacilityHandler = require('../lambda/writeFacility/index');
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('PUT fails General - 403 - Unauthorized', async () => {
    const event = {
      httpMethod: 'PUT'
    }
    const writeFacilityHandler = require('../lambda/writeFacility/index');
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
    const writeFacilityHandler = require('../lambda/writeFacility/index');
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Not Implemented"}',
      statusCode: 405
    });
  });
});