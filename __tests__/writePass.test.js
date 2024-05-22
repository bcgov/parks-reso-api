const { DocumentClient } = require('aws-sdk/clients/dynamodb');

const { REGION, ENDPOINT, TABLE_NAME } = require('./global/settings');

const ALLOWED_HEADERS = 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-App-Version';

const ALGORITHM = process.env.ALGORITHM || 'HS384';

const ddb = new DocumentClient({
  region: REGION,
  endpoint: ENDPOINT,
  convertEmptyValues: true
});

const jwt = require('jsonwebtoken');

describe('Pass Fails', () => {
  beforeEach(async () => {
    await databaseOperation(1, 'setup');
  });

  afterEach(async () => {
    await databaseOperation(1, 'teardown');
    jest.resetModules();
  });

  test('400 Bad Request - nothing passed in', async () => {
    const writePassHandler = require('../lambda/writePass/index');
    expect(await writePassHandler.handler(null, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'There was an error in your submission.',
        title: 'Bad Request'
      }),
      headers: {
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('400 Bad Request - Missing JWT', async () => {
    const writePassHandler = require('../lambda/writePass/index');
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: 'Parking lot A',
        email: '',
        date: '',
        type: '',
        numberOfGuests: '',
        phoneNumber: '',
        commit: true,
        // Missing `token`
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'Invalid token',
        title: 'Operation Failed.'
      }),
      headers: {
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('400 Bad Request - JWT Invalid', async () => {
    const writePassHandler = require('../lambda/writePass/index');
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: 'Parking lot A',
        email: 'test@example.where',
        date: new Date().toISOString().split('T')[0],
        type: 'DAY',
        numberOfGuests: 1,
        phoneNumber: '',
        token: 'This is an invalid token',
        commit: true
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'Invalid token',
        title: 'Operation Failed.'
      }),
      headers: {
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('400 Bad Request - Trail pass limit maximum', async () => {
    jest.mock('../lambda/permissionUtil', () => {
      return {
        validateToken: jest.fn(event => {
          // Do Nothing, Don't throw
        }),
        decodeJWT: jest.fn(event => {
          return null;
        }),
        resolvePermissions: jest.fn(() => {
          return {
            isAdmin: false,
            roles: [''],
            isAuthenticated: false
          };
        })
      };
    });
    
    const writePassHandler = require('../lambda/writePass/index');
    const token = jwt.sign(
      {
        registrationNumber: '1111111111',
        facility: 'Parking lot B',
        bookingDate: '2022-01-01',
        passType: 'DAY',
        orcs: 'Test Park 1'
      },
      'defaultSecret',
      {
        algorithm: ALGORITHM
      }
    );
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: 'Parking lot B',
        email: '',
        date: '',
        type: '',
        numberOfGuests: 5, // Too many
        phoneNumber: ''
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"You cannot have more than 4 guests on a trail.","title":"Operation Failed"}',
      headers: {
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('400 Bad Request - Invalid Date', async () => {
    jest.mock('../lambda/permissionUtil', () => {
      return {
        validateToken: jest.fn(event => {
          // Do Nothing, Don't throw
        }),
        decodeJWT: jest.fn(event => {
          return {
            parkOrcs: 'Test Park 1',
            firstName: '',
            lastName: '',
            facilityName: 'Parking lot B',
            email: 'test@example.nowhere',
            date: '',
            type: 'DAY',
            numberOfGuests: 1,
            phoneNumber: ''
          };
        }),
        resolvePermissions: jest.fn(() => {
          return {
            isAdmin: false,
            roles: [''],
            isAuthenticated: false
          };
        })
      };
    });
    const writePassHandler = require('../lambda/writePass/index');
    const parkObject = {
      registrationNumber: '1111111112',
      facility: 'Parking lot B',
      email: 'test@example.nowhere',
      orcs: 'Test Park 1',
      bookingDate: '2022-01-01',
      passType: 'DAY',
    };
    const token = jwt.sign(
      parkObject,
      'defaultSecret',
      {
        algorithm: ALGORITHM
      }
    );
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: parkObject.orcs,
        firstName: '',
        lastName: '',
        facilityName: parkObject.facility,
        email: parkObject.email,
        date: '',
        type: parkObject.passType,
        numberOfGuests: 1,
        phoneNumber: '',
        token: token
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'Invalid booking date.',
        title: 'Operation Failed'
      }),
      headers: {
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - Booking date in the past', async () => {
    const writePassHandler = require('../lambda/writePass/index');
    const token = jwt.sign(
      {
        registrationNumber: '1111111113',
        facility: 'Parking lot A',
        orcs: 'Test Park 1',
        bookingDate: '1970-01-01',
        passType: 'DAY'
      },
      'defaultSecret',
      {
        algorithm: ALGORITHM
      }
    );
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: 'Parking lot A',
        email: '',
        date: '1970-01-01T00:00:00.758Z',
        type: 'DAY',
        numberOfGuests: 1,
        phoneNumber: '',
        holdPassJwt: token
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'You cannot book for a date in the past.',
        title: 'Operation Failed'
      }),
      headers: {
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Allow-Methods': 'OPTIONS,GET',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - One or more params are invalid.', async () => {
    const writePassHandler = require('../lambda/writePass/index');
    const token = jwt.sign(
      {
        registrationNumber: '1111111114',
        facility: 'Parking lot B',
        orcs: 'Test Park 1',
        bookingDate: '2022-01-01',
        passType: 'DAY',
      },
      'defaultSecret',
      {
        algorithm: ALGORITHM
      }
    );
    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: 'Test Park 1',
        firstName: '',
        lastName: '',
        facilityName: '',
        email: 'something@where.not',
        date: new Date(),
        type: 'DAY',
        numberOfGuests: 1,
        phoneNumber: '',
        holdPassJwt: token,
      })
    };
    const res = await writePassHandler.handler(event, null);
    expect(res.statusCode === 400);
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

  test('writePass warmup', async () => {
    const writePassHandler = require('../lambda/writePass/index').handler;
    const event = {
      warmup: true
    };
    const context = null;
    const response = await writePassHandler(event, context);
    expect(response.statusCode).toEqual(200);
  });

  test('writePass putPassHandler', async () => {
    const writePassHandler = require('../lambda/writePass/index').handler;
    jest.mock('../lambda/permissionUtil', () => {
      return {
        decodeJWT: jest.fn(event => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn(token => {
          return {
            isAdmin: true,
            roles: ['sysasdmin'],
            isAuthenticated: true
          };
        })
      };
    });
    const token = jwt.sign({ foo: 'bar' }, 'shhhhh', { algorithm: ALGORITHM });
    let event = {
      httpMethod: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token
      },
      queryStringParameters: {
        checkedIn: 'true'
      },
      body: JSON.stringify({
        pk: '0015',
        sk: '523456789'
      })
    };
    const context = null;
    let response = await writePassHandler(event, context);
    expect(response.statusCode).toEqual(200);

    let params = {
      TableName: TABLE_NAME,
      Key: {
        pk: 'pass::0015',
        sk: '523456789'
      }
    };

    let dbRes = await ddb.get(params).promise();
    expect(dbRes.Item?.checkedIn).toEqual(true);

    event = {
      httpMethod: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token
      },
      queryStringParameters: {
        checkedIn: 'false'
      },
      body: JSON.stringify({
        pk: '0015',
        sk: '523456789'
      })
    };

    response = await writePassHandler(event, context);
    expect(response.statusCode).toEqual(200);

    dbRes = await ddb.get(params).promise();
    expect(dbRes.Item?.checkedIn).toEqual(false);

    event = {
      httpMethod: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token
      },
      queryStringParameters: {
        checkedIn: 1234
      },
      body: JSON.stringify({
        pk: '0015',
        sk: '523456789'
      })
    };

    response = await writePassHandler(event, context);
    expect(response.statusCode).toEqual(400);
  });

  test('200 pass has been held for a Trail.', async () => {
    jest.mock('../lambda/permissionUtil', () => {
      return {
        validateToken: jest.fn(event => {
          // Do Nothing, Don't throw
        }),
        decodeJWT: jest.fn(event => {
          return {
            parkOrcs: 'Test Park 1',
            firstName: '',
            lastName: '',
            facilityName: 'Parking lot B',
            email: 'test@example.nowhere',
            date: '',
            type: 'DAY',
            numberOfGuests: 1,
            phoneNumber: ''
          };
        }),
        resolvePermissions: jest.fn(() => {
          return {
            isAdmin: false,
            roles: [''],
            isAuthenticated: false
          };
        }),
        getExpiryTime: jest.fn(() => {
          return new Date().toISOString();
        })
      };
    });
    const writePassHandler = require('../lambda/writePass/index');
    process.env.ADMIN_FRONTEND = 'http://localhost:4300';
    process.env.PASS_MANAGEMENT_ROUTE = '/pass-management';

    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: '0015',
        firstName: 'Jest',
        lastName: 'User',
        facilityName: 'P1 and Lower P5',
        email: 'testEmail7@test.ca',
        date: new Date(),
        type: 'DAY',
        numberOfGuests: 1,
        phoneNumber: '2505555555'
      })
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    const decodedJWT = jwt.decode(body);
    expect(decodedJWT.facilityName).toEqual('P1 and Lower P5');
    const datePST = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const [month, day, year] = datePST.split(',')[0].split('/').map(num => num.padStart(2, '0'));
    expect(decodedJWT.shortPassDate).toEqual(`${year}-${month}-${day}`);
    expect(decodedJWT.type).toEqual('DAY');
    expect(decodedJWT.numberOfGuests).toEqual(1);
    expect(decodedJWT.passStatus).toEqual('hold');
    expect(decodedJWT.facilityType).toEqual('Trail');
  });

  test('200 pass has been created for a Parking Pass.', async () => {
    jest.mock('../lambda/permissionUtil', () => {
      return {
        validateToken: jest.fn(event => {
          // Do Nothing, Don't throw
        }),
        decodeJWT: jest.fn(event => {
          return {
            parkOrcs: 'Test Park 1',
            registrationNumber: '1111111115',
            firstName: 'Jest',
            lastName: 'User',
            facilityName: 'Parking lot A',
            email: 'testEmail2@test.ca',
            date: new Date().toISOString(),
            type: 'DAY',
            numberOfGuests: 1,
            phoneNumber: '2505555555',
            facilityType: 'Parking',
            mapLink: 'https://maps.google.com',
            commit: true
          };
        }),
        verifyHoldToken: jest.fn(event => {
          return {
            parkOrcs: 'Test Park 1',
            registrationNumber: '1111111115',
            firstName: 'Jest',
            lastName: 'User',
            facilityName: 'Parking lot A',
            email: 'testEmail2@test.ca',
            date: new Date().toISOString(),
            type: 'DAY',
            numberOfGuests: 1,
            phoneNumber: '2505555555',
            facilityType: 'Parking',
            mapLink: 'https://maps.google.com',
            commit: true
          };
        }),
        deleteHoldToken:jest.fn(() => {
          return;
        }),
        getOne: jest.fn(() => {
          return undefined // Simulate not found
        }),
        resolvePermissions: jest.fn(() => {
          return {
            isAdmin: false,
            roles: [''],
            isAuthenticated: false
          };
        })
      };
    });
    const token = jwt.sign({
      parkOrcs: 'Test Park 1',
      registrationNumber: '1111111115',
      firstName: 'Jest',
      lastName: 'User',
      facilityName: 'Parking lot A',
      email: 'testEmail2@test.ca',
      date: new Date().toISOString(),
      type: 'DAY',
      numberOfGuests: 1,
      phoneNumber: '2505555555',
      facilityType: 'Parking',
      mapLink: 'https://maps.google.com',
      commit: true
    },
    'defaultSecret',
    { algorithm: ALGORITHM, expiresIn: '7m' });

    const writePassHandler = require('../lambda/writePass/index');
    const event = {
      httpMethod: 'POST',
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: 'Test Park 1',
        registrationNumber: '1111111115',
        firstName: 'Jest',
        lastName: 'User',
        facilityName: 'Parking lot A',
        email: 'testEmail2@test.ca',
        date: new Date().toISOString(),
        type: 'DAY',
        numberOfGuests: 1,
        phoneNumber: '2505555555',
        facilityType: 'Parking',
        mapLink: 'https://maps.google.com',
        commit: true,
        token: token
      })
    };

    // Put the hold pass in the DB first
    await ddb
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'pass::Test Park 1',
          sk: '1111111115',
          registrationNumber: '1111111115',
          facilityName: 'Parking lot B',
          date: new Date().toISOString(),
          status: 'hold',
          type: 'DAY',
          numberOfGuests: 1,
          facilityType: 'Parking',
          mapLink: 'https://maps.google.com'
        }
      })
      .promise();
    
    // Put the JWT in the table.
    await ddb
      .put({
        TableName: TABLE_NAME,
        Item: {
          sk: token,
          pk: 'jwt'
        }
      })
      .promise();

    const response = await writePassHandler.handler(event, null);

    // Remove the database item
    await ddb.delete({
      TableName: TABLE_NAME,
      Key: {
        pk: 'pass::Test Park 1',
        sk: '1111111115'
      }
    }).promise();

    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body.pk).toEqual('pass::Test Park 1');
    expect(typeof body.sk).toBe('string');
    expect(body.firstName).toEqual('Jest');
    expect(body.lastName).toEqual('User');
    expect(body.facilityName).toEqual('Parking lot B');
    expect(body.email).toEqual('testEmail2@test.ca');
    expect(typeof body.date).toBe('string');
    expect(body.type).toEqual('DAY');
    expect(typeof body.registrationNumber).toBe('string');
    expect(body.numberOfGuests).toEqual(1);
    expect(['reserved', 'active']).toContain(body.passStatus);
    expect(body.facilityType).toEqual('Parking');
  });

  // TODO: Copy the function above and change it so that it can't update the pass in the system.

  test('Handler - 400 Number of guests cannot be less than 1.', async () => {
    const writePassHandler = require('../lambda/writePass/index');
    const parkObject = {
      facility: 'Parking lot B',
      email: 'test@example.nowhere',
      orcs: 'Test Park 1',
      bookingDate: '2022-01-01',
      passType: 'DAY',
      numberOfGuests: 0
    };
    const token = jwt.sign(
      {
        registrationNumber: '1111111117',
        facility: 'Parking lot B',
        orcs: 'Test Park 1'
      },
      'defaultSecret',
      {
        algorithm: ALGORITHM
      }
    );

    const event = {
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: parkObject.orcs,
        firstName: '',
        lastName: '',
        facilityName: parkObject.facility,
        email: parkObject.email,
        date: parkObject.bookingDate,
        type: parkObject.passType,
        numberOfGuests: 0, // Too little
        phoneNumber: ''
      })
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(400);
    const body = JSON.parse(response.body);
    expect(body.msg).toEqual('Passes must have at least 1 guest.');
    expect(body.title).toEqual('Operation Failed');
  });

  test('Expect checkWarmup function to fire.', async () => {
    const writePassHandler = require('../lambda/writePass/index');
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

  test('Expect pass check in to fail 403.', async () => {
    // Mock the auth to be fail (This is the new method for mocking auth)
    jest.mock('../lambda/permissionUtil', () => {
      return {
        decodeJWT: jest.fn(event => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn(token => {
          return {
            isAdmin: false,
            roles: ['badRole']
          };
        })
      };
    });
    const writePassHandler = require('../lambda/writePass/index');
    const event = {
      headers: {
        Authorization: 'None'
      },
      httpMethod: 'PUT',
      body: JSON.stringify({})
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(403);
  });

  test('Expect pass to be checked in.', async () => {
    jest.mock('../lambda/permissionUtil', () => {
      return {
        decodeJWT: jest.fn(event => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn(token => {
          return {
            isAdmin: true,
            roles: ['sysadmin'],
            isAuthenticated: true
          };
        })
      };
    });
    const writePassHandler = require('../lambda/writePass/index');
    const event = {
      httpMethod: 'PUT',
      body: JSON.stringify({
        pk: '0015',
        sk: '123456789'
      }),
      queryStringParameters: {
        checkedIn: 'true'
      }
    };

    const response = await writePassHandler.handler(event, null);
    const body = JSON.parse(response.body);
    expect(response.statusCode).toEqual(200);
    expect(body.checkedIn).toEqual(true);
  });

  test('Expect pass not to be checked in. 1', async () => {
    jest.mock('../lambda/permissionUtil', () => {
      return {
        decodeJWT: jest.fn(event => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn(token => {
          return {
            isAdmin: false,
            roles: ['sysadmin'],
            isAuthenticated: false
          };
        })
      };
    });
    const writePassHandler = require('../lambda/writePass/index');
    const event = {
      httpMethod: 'PUT',
      body: JSON.stringify({
        pk: '0015',
        sk: '123456789'
      }),
      queryStringParameters: {
        checkedIn: 'false'
      }
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(403);
  });

  test('Expect pass not to be checked in. 2', async () => {
    jest.mock('../lambda/permissionUtil', () => {
      return {
        decodeJWT: jest.fn(event => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn(token => {
          return {
            isAdmin: false,
            roles: ['sysadmin'],
            isAuthenticated: false
          };
        })
      };
    });
    const writePassHandler = require('../lambda/writePass/index');
    const event = {
      httpMethod: 'PUT',
      body: JSON.stringify({
        sk: '123456789'
      }),
      queryStringParameters: {
        foo: 'false'
      }
    };
    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(403);
  });

  test('400 pass exists according to token check.', async () => {
    const theDate = '2022-01-01T12:00:00Z';
    const holdToken = 'eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJwYXJrT3JjcyI6IlRlc3QgUGFyayAxIiwiZmFjaWxpdHlOYW1lIjoiUGFya2luZyBsb3QgQiIsInJlZ2lzdHJhdGlvbk51bWJlciI6IjExMTExMTExMTUiLCJpYXQiOjE3MTQ1MTc3ODN9.VbeNekaVj6gjqSI6GdtFmz6YI2oevMmcZM0QjXgy8m-agEDPZDmg-9VOSKSVz7mG';
    jest.mock('../lambda/permissionUtil', () => {
      return {
        validateToken: jest.fn(event => {
          // Do Nothing, Don't throw
        }),
        decodeJWT: jest.fn(event => {
          return {
            parkOrcs: 'Test Park 1',
            registrationNumber: '1111111115',
            firstName: 'Jest',
            lastName: 'User',
            facilityName: 'Parking lot B',
            email: 'testEmail2@test.ca',
            date: '2022-01-01T12:00:00Z',
            type: 'DAY',
            numberOfGuests: 1,
            phoneNumber: '2505555555',
            facilityType: 'Parking',
            mapLink: 'https://maps.google.com',
            commit: true
          };
        }),
        verifyHoldToken: jest.fn(event => {
          return {
            parkOrcs: 'Test Park 1',
            registrationNumber: '1111111115',
            firstName: 'Jest',
            lastName: 'User',
            facilityName: 'Parking lot B',
            email: 'testEmail2@test.ca',
            date: '2022-01-01T12:00:00Z',
            type: 'DAY',
            numberOfGuests: 1,
            phoneNumber: '2505555555',
            facilityType: 'Parking',
            mapLink: 'https://maps.google.com',
            commit: true
          };
        }),
        getOne: jest.fn(() => {
          return undefined;
        }),
        resolvePermissions: jest.fn(() => {
          return {
            isAdmin: false,
            roles: [''],
            isAuthenticated: false
          };
        })
      };
    });
    const writePassHandler = require('../lambda/writePass/index');

    const event = {
      httpMethod: 'POST',
      headers: {
        Authorization: 'None'
      },
      body: JSON.stringify({
        parkOrcs: 'Test Park 1',
        firstName: 'Jest',
        lastName: 'User',
        facilityName: 'Parking lot B',
        email: 'testEmail2@test.ca',
        registrationNumber: '1111111115',
        date: theDate,
        type: 'DAY',
        numberOfGuests: 1,
        phoneNumber: '2505555555',
        facilityType: 'Parking',
        mapLink: 'https://maps.google.com',
        token: holdToken,
        commit: true
      })
    };

    // Put the JWT in the table.
    await ddb
      .put({
        TableName: TABLE_NAME,
        Item: {
          sk: 'eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJwYXJrT3JjcyI6IlRlc3QgUGFyayAxIiwiZmFjaWxpdHlOYW1lIjoiUGFya2luZyBsb3QgQiIsInJlZ2lzdHJhdGlvbk51bWJlciI6IjExMTExMTExMTUiLCJpYXQiOjE3MTQ1MTc3ODN9.VbeNekaVj6gjqSI6GdtFmz6YI2oevMmcZM0QjXgy8m-agEDPZDmg-9VOSKSVz7mG',
          pk: 'jwt'
        }
      })
      .promise();

    await ddb
      .put({
        TableName: TABLE_NAME,
        Item: {
          sk: '1111111115',
          registrationNumber: '1111111115',
          pk: 'pass::Test Park 1',
          firstName: 'Jest',
          lastName: 'User',
          facilityName: 'Parking lot B',
          email: 'testEmail2@test.ca',
          date: theDate,
          shortPassDate: '2022-01-01',
          type: 'DAY',
          passStatus: 'reserved',
          numberOfGuests: 1,
          phoneNumber: '2505555555',
          facilityType: 'Parking',
          mapLink: 'https://maps.google.com',
          commit: true
        }
      })
      .promise();

    let foo = await ddb.get({
      TableName: TABLE_NAME,
      Key: {
        pk: 'pass::Test Park 1',
        sk: '1111111115'
      }
    }).promise();
    console.log(foo.Item)

    let response = await writePassHandler.handler(event, null);

    // Remove the item from the DB
    await ddb.delete({
      TableName: TABLE_NAME,
      Key: {
        pk: 'pass::Test Park 1',
        sk: '1111111115'
      }
    }).promise();

    expect(response.statusCode).toEqual(400);
    const body = JSON.parse(response.body);
    expect(body.msg).toEqual('This email account already has a reservation for this booking time. A reservation associated with this email for this booking time already exists. Please check to see if you already have a reservation for this time. If you do not have an email confirmation of your reservation please contact <a href=\"mailto:parkinfo@gov.bc.ca\">parkinfo@gov.bc.ca</a>');
    expect(body.title).toEqual('Operation Failed.');
  });
});

async function databaseOperation(version, mode) {
  if (version === 1) {
    if (mode === 'setup') {
      await ddb
        .put({
          TableName: TABLE_NAME,
          Item: {
            pk: 'config',
            sk: 'config',
            ENVIRONMENT: 'test'
          }
        })
        .promise();

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
            pk: 'park',
            sk: '0015',
            name: '0015',
            description: '<p>My Description</p>',
            bcParksLink: 'http://google.ca',
            mapLink: 'https://maps.google.com',
            status: 'open',
            visible: true
          }
        })
        .promise();

      // Example Pass
      await ddb
        .put({
          TableName: TABLE_NAME,
          Item: {
            pk: 'pass::0015',
            sk: '123456789',
            parkName: 'Test Park 1',
            firstName: 'First',
            searchFirstName: 'first',
            lastName: 'Last',
            searchLastName: 'last',
            facilityName: 'Parking lot A',
            email: 'noreply@gov.bc.ca',
            date: new Date('2012-01-01'),
            shortPassDate: '2012-01-01',
            type: 'DAY',
            registrationNumber: '123456789',
            numberOfGuests: '4',
            passStatus: 'active',
            phoneNumber: '5555555555',
            facilityType: 'Trail',
            isOverbooked: false,
            creationDate: new Date('2012-01-01'),
            dateUpdated: new Date('2012-01-01')
          }
        })
        .promise();

      await ddb
        .put({
          TableName: TABLE_NAME,
          Item: {
            pk: 'pass::0015',
            sk: '523456789',
            parkName: 'Test Park 1',
            parkOrcs: 'Test Park 1',
            firstName: 'First',
            searchFirstName: 'first',
            lastName: 'Last',
            searchLastName: 'last',
            facilityName: 'Parking lot A',
            email: 'noreply@gov.bc.ca',
            date: new Date('2012-01-01'),
            shortPassDate: '2012-01-01',
            type: 'DAY',
            registrationNumber: '123456789',
            numberOfGuests: '4',
            passStatus: 'active',
            phoneNumber: '5555555555',
            facilityType: 'Trail',
            isOverbooked: false,
            creationDate: new Date('2012-01-01'),
            dateUpdated: new Date('2012-01-01')
          }
        })
        .promise();

      await ddb
        .put({
          TableName: TABLE_NAME,
          Item: {
            pk: 'facility::Test Park 1',
            parkOrcs: 'Test Park 1',
            facilityName: 'Parking lot A',
            sk: 'Parking lot A',
            name: 'Parking lot A',
            description: 'A Parking Lot!',
            qrcode: true,
            isUpdating: false,
            type: 'Parking',
            bookingTimes: {
              AM: {
                max: 25
              },
              DAY: {
                max: 25
              }
            },
            bookingDays: {
              Sunday: true,
              Monday: true,
              Tuesday: true,
              Wednesday: true,
              Thursday: true,
              Friday: true,
              Saturday: true
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
            sk: 'Parking lot B',
            parkOrcs: 'Test Park 1',
            name: 'Parking lot B',
            description: 'A Trail!',
            qrcode: true,
            isUpdating: false,
            type: 'Trail',
            bookingTimes: {
              AM: {
                max: 25
              },
              DAY: {
                max: 25
              }
            },
            bookingDays: {
              Sunday: true,
              Monday: true,
              Tuesday: true,
              Wednesday: true,
              Thursday: true,
              Friday: true,
              Saturday: true
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
            pk: 'facility::0015',
            sk: 'P1 and Lower P5',
            name: 'P1 and Lower P5',
            description: 'A Trail!',
            qrcode: true,
            isUpdating: false,
            type: 'Trail',
            bookingTimes: {
              AM: {
                max: 25
              },
              DAY: {
                max: 25
              }
            },
            bookingDays: {
              Sunday: true,
              Monday: true,
              Tuesday: true,
              Wednesday: true,
              Thursday: true,
              Friday: true,
              Saturday: true
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
