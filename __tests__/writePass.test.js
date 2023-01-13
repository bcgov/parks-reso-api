const writePassHandler = require('../lambda/writePass/index');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');

const { REGION, ENDPOINT, TABLE_NAME } = require('./global/settings');

const ALGORITHM = process.env.ALGORITHM || "HS384";

const ddb = new DocumentClient({
  region: REGION,
  endpoint: ENDPOINT,
  convertEmptyValues: true
});

const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    data: 'verified'
  },
  'defaultSecret',
  {
    algorithm: ALGORITHM
  }
);

describe('Pass Fails', () => {
  beforeEach(async () => {
    await databaseOperation(1, 'setup');
  });

  afterEach(async () => {
    await databaseOperation(1, 'teardown');
  });

  test('Handler - 400 Bad Request - nothing passed in', async () => {
    expect(await writePassHandler.handler(null, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'There was an error in your submission.',
        title: 'Bad Request'
      }),
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - Missing JWT', async () => {
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkName: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: 'Parking lot A',
        email: '',
        date: '',
        type: '',
        numberOfGuests: '',
        phoneNumber: ''
        // Missing JWT
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'Missing CAPTCHA verification.',
        title: 'Missing CAPTCHA verification'
      }),
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - JWT Invalid', async () => {
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkName: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: 'Parking lot A',
        email: '',
        date: '',
        type: '',
        numberOfGuests: '',
        phoneNumber: '',
        captchaJwt: 'This is an invalid JWT'
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'CAPTCHA verification failed.',
        title: 'CAPTCHA verification failed'
      }),
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - Trail pass limit maximum', async () => {
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkName: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: 'Trail B',
        email: '',
        date: '',
        type: '',
        numberOfGuests: 5, // Too many
        phoneNumber: '',
        captchaJwt: token
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"You cannot have more than 4 guests on a trail.","title":"Too many guests"}',
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - Invalid Date', async () => {
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkName: '',
        firstName: '',
        lastName: '',
        facilityName: '',
        email: '',
        date: '',
        type: '',
        numberOfGuests: 1,
        phoneNumber: '',
        captchaJwt: token
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'Something went wrong.',
        title: 'Operation Failed'
      }),
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - Booking date in the past', async () => {
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkName: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: 'Parking lot A',
        email: '',
        date: '1970-01-01T00:00:00.758Z',
        type: '',
        numberOfGuests: 1,
        phoneNumber: '',
        captchaJwt: token
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'You cannot book for a date in the past.',
        title: 'Booking date in the past'
      }),
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - One or more params are invalid.', async () => {
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkName: '',
        firstName: '',
        lastName: '',
        facilityName: '',
        email: '',
        date: new Date(),
        type: '',
        numberOfGuests: 1,
        phoneNumber: '',
        captchaJwt: token
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'Something went wrong.',
        title: 'Operation Failed'
      }),
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });
});

describe('Pass Successes', () => {
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

  test('Handler - 200 Email Failed to Send, but pass has been created for a Trail.', async () => {
    process.env.QR_CODE_ENABLED = "true";
    process.env.ADMIN_FRONTEND = "http://localhost:4300";
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkName: 'Test Park 1',
        firstName: 'Jest',
        lastName: 'User',
        facilityName: 'Trail B',
        email: 'testEmail1@test.ca',
        date: new Date(),
        type: 'DAY',
        numberOfGuests: 1,
        phoneNumber: '2505555555',
        captchaJwt: token
      })
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body.pk).toEqual('pass::Test Park 1');
    expect(typeof body.sk).toBe('string');
    expect(body.firstName).toEqual('Jest');
    expect(body.lastName).toEqual('User');
    expect(body.facilityName).toEqual('Trail B');
    expect(body.email).toEqual('testEmail1@test.ca');
    expect(typeof body.date).toBe('string');
    expect(body.type).toEqual('DAY');
    expect(typeof body.registrationNumber).toBe('string');
    expect(body.numberOfGuests).toEqual(1);
    expect(['reserved', 'active']).toContain(body.passStatus);
    expect(body.phoneNumber).toEqual('2505555555');
    expect(body.facilityType).toEqual('Trail');
    expect(typeof body.err).toBe('string');
    expect(body.adminPassLink).toContain(`${process.env.ADMIN_FRONTEND}/pass-lookup/Test Park 1/`);
  });

  test('Handler - 200 Email Failed to Send, but pass has been created for a Parking Pass.', async () => {
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkName: 'Test Park 1',
        firstName: 'Jest',
        lastName: 'User',
        facilityName: 'Parking lot A',
        email: 'testEmail2@test.ca',
        date: new Date(),
        type: 'DAY',
        numberOfGuests: 1,
        phoneNumber: '2505555555',
        facilityType: 'Parking',
        mapLink: 'http://maps.google.com',
        captchaJwt: token
      })
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body.pk).toEqual('pass::Test Park 1');
    expect(typeof body.sk).toBe('string');
    expect(body.firstName).toEqual('Jest');
    expect(body.lastName).toEqual('User');
    expect(body.facilityName).toEqual('Parking lot A');
    expect(body.email).toEqual('testEmail2@test.ca');
    expect(typeof body.date).toBe('string');
    expect(body.type).toEqual('DAY');
    expect(typeof body.registrationNumber).toBe('string');
    expect(body.numberOfGuests).toEqual(1);
    expect(['reserved', 'active']).toContain(body.passStatus);
    expect(body.phoneNumber).toEqual('2505555555');
    expect(body.facilityType).toEqual('Parking');
    expect(typeof body.err).toBe('string');
  });

  test('Handler - 400 Number of guests cannot be less than 1.', async () => {
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkName: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: 'Trail B',
        email: '',
        date: '',
        type: '',
        numberOfGuests: 0, // Too little
        phoneNumber: '',
        captchaJwt: token
      })
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(400);
    const body = JSON.parse(response.body);
    expect(body.msg).toEqual('Passes must have at least 1 guest.');
    expect(body.title).toEqual('Invalid number of guests');
  });

  test('Expect checkWarmup function to fire.', async () => {
    const event = {
      headers: {
        Authorization: 'None'
      },
      warmup: true
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({});
  });
});

async function databaseOperation(version, mode) {
  if (version === 1) {
    if (mode === 'setup') {
      await ddb
        .put({
          TableName: TABLE_NAME,
          Item: {
            pk: 'park',
            sk: 'Test Park 1',
            name: 'Test Park 1',
            description: '<p>My Description</p>',
            bcParksLink: 'http://google.ca',
            mapLink: 'https://maps.google.com',
            status: 'open',
            visible: true
          }
        })
        .promise();

      await ddb
        .put({
          TableName: TABLE_NAME,
          Item: {
            pk: 'facility::Test Park 1',
            sk: 'Parking lot A',
            name: 'Parking lot A',
            description: 'A Parking Lot!',
            isUpdating: false,
            type: "Parking",
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

      await ddb
        .put({
          TableName: TABLE_NAME,
          Item: {
            pk: 'facility::Test Park 1',
            sk: 'Trail B',
            name: 'Trail B',
            description: 'A Trail!',
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
            pk: 'park',
            sk: 'Test Park 1'
          }
        })
        .promise();
      await ddb
        .delete({
          TableName: TABLE_NAME,
          Key: {
            pk: 'facility::Test Park 1',
            sk: 'Parking lot A'
          }
        })
        .promise();
    }
  }
}
