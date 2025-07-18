const { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb");
const { REGION, ENDPOINT } = require('../../../__tests__/settings');
const { createDB, deleteDB, getHashedText } = require('../../../__tests__/setup.js')
const ALLOWED_HEADERS = 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-App-Version';
const ALGORITHM = process.env.ALGORITHM || 'HS384';
const jwt = require('jsonwebtoken');
const { DateTime } = require('luxon');


describe('Pass Fails', () => {
  const OLD_ENV = process.env.TABLE_NAME;
  let hash
 
  beforeEach(async () => {
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME
    await createDB(hash)
    await databaseOperation(1, 'setup', process.env.TABLE_NAME);
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV; // Restore old environment
  });
  
  test('400 Bad Request - nothing passed in', async () => {
    const writePassHandler = require('../index');
    expect(await writePassHandler.handler(null, null)).toMatchObject({
      body: JSON.stringify({
        msg: 'There was an error in your submission.',
        title: 'Bad Request'
      }),
      headers: {
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,DELETE,POST',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('400 Bad Request - Missing JWT', async () => {
    const writePassHandler = require('../index');
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
        'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,DELETE,POST',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('400 Bad Request - JWT Invalid', async () => {
    const writePassHandler = require('../index');
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
        'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,DELETE,POST',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('400 Bad Request - Trail pass limit maximum', async () => {
    jest.mock('/opt/permissionLayer', () => {
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

    const writePassHandler = require('../index');
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
        'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,DELETE,POST',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('400 Bad Request - Invalid Date', async () => {
    jest.mock('/opt/permissionLayer', () => {
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
    const writePassHandler = require('../index');
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
        'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,DELETE,POST',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - Booking date in the past', async () => {
    const writePassHandler = require('../index');
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
        'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,DELETE,POST',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 400
    });
  });

  test('Handler - 400 Bad Request - One or more params are invalid.', async () => {
    const writePassHandler = require('../index');
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
  const OLD_ENV = process.env.TABLE_NAME;
  let hash
  beforeEach(async () => {
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME
    await createDB(hash)
    await databaseOperation(1, 'setup', process.env.TABLE_NAME);
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV; // Restore old environment
  });

  test('writePass warmup', async () => {
    const writePassHandler = require('../index').handler;
    const event = {
      warmup: true
    };
    const context = null;
    const response = await writePassHandler(event, context);
    expect(response.statusCode).toEqual(200);
  });

  test('writePass putPassHandler', async () => {
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    const writePassHandler = require('../index').handler;
    jest.mock('/opt/permissionLayer', () => {
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
      Key: marshall({
        pk: 'pass::0015',
        sk: '523456789'
      })
    };
    let res = await dynamoClient.send(new GetItemCommand(params))
    let dbRes = unmarshall(res.Item);
    expect(dbRes.checkedIn).toEqual(true);

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


    res = await dynamoClient.send(new GetItemCommand(params))
    dbRes = unmarshall(res.Item);
    expect(dbRes.checkedIn).toEqual(false);

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
    const date = new Date().toISOString().split('T')[0];
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });

    jest.mock('/opt/permissionLayer', () => {
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
    jest.mock('/opt/reservationLayer', () => {
      return {
        createNewReservationsObj: jest.fn(() => {
          // Do nothing, don't throw, create a mock object  below
        }),
      };
    });

    // Create a mock reservation object to prevent the reservationLayer from throwing an error.
    const resPutCommand = {
      TableName: TABLE_NAME,
      Item: marshall({
        pk: 'reservations::0015::P1 and Lower P5',
        sk: date,
        capacities: {
          AM: {
            availablePasses: 10,
            baseCapacity: 100
          },
          PM: {
            availablePasses: 10,
            baseCapacity: 100
          },
          DAY: {
            availablePasses: 10,
            baseCapacity: 100
          }
        }
      })
    };
    await dynamoClient.send(new PutItemCommand(resPutCommand));

    const writePassHandler = require('../index');
    process.env.ADMIN_FRONTEND = 'http://localhost:4300';
    process.env.PASS_MANAGEMENT_ROUTE = '/pass-management';

    //THIS IS BROKEN for test ---- Missing 
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
        date: new Date().toISOString(),
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
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    jest.mock('/opt/permissionLayer', () => {
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

    const writePassHandler = require('../index');
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
    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
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
        })
      }
    await dynamoClient.send(new PutItemCommand(params))

    // Put the JWT in the table.
    const params2 = {
        TableName: TABLE_NAME,
        Item: marshall({
          sk: token,
          pk: 'jwt'
        })
      }
    await dynamoClient.send(new PutItemCommand(params2))

    const response = await writePassHandler.handler(event, null);

    // Remove the database item
    const params3 = {
      TableName: TABLE_NAME,
      Key: marshall({
        pk: 'pass::Test Park 1',
        sk: '1111111115'
      })
    }
    await dynamoClient.send(new DeleteItemCommand(params3))

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
    expect(body.numberOfGuests).toEqual(1);
    expect(['reserved', 'active']).toContain(body.passStatus);
    expect(body.facilityType).toEqual('Parking');
  });

  // TODO: Copy the function above and change it so that it can't update the pass in the system.

  test('Handler - 400 Number of guests cannot be less than 1.', async () => {
    const writePassHandler = require('../index');
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
    const writePassHandler = require('../index');
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
    jest.mock('/opt/permissionLayer', () => {
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
    const writePassHandler = require('../index');
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
    jest.mock('/opt/permissionLayer', () => {
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
    const writePassHandler = require('../index');
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
    jest.mock('/opt/permissionLayer', () => {
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
    const writePassHandler = require('../index');
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
    jest.mock('/opt/permissionLayer', () => {
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
    const writePassHandler = require('../index');
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
});

async function databaseOperation(version, mode, TABLE_NAME) {
  
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });
  const passDate = DateTime.fromISO('2021-12-08T19:01:58.135Z').setZone('America/Vancouver');
  if (version === 1) {
    if (mode === 'setup') {
      const params = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'config',
            sk: 'config',
            ENVIRONMENT: 'test'
          })
        }
      await dynamoClient.send(new PutItemCommand(params))
      
      const params2 = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'park',
            sk: 'Test Park 1',
            name: 'Test Park 1',
            description: '<p>My Description</p>',
            bcParksLink: 'http://google.ca',
            mapLink: 'https://maps.google.com',
            status: 'open',
            visible: true
          })
        }
      await dynamoClient.send(new PutItemCommand(params2))

      const params3 = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'park',
            sk: '0015',
            name: '0015',
            description: '<p>My Description</p>',
            bcParksLink: 'http://google.ca',
            mapLink: 'https://maps.google.com',
            status: 'open',
            visible: true
          })
        }
      await dynamoClient.send(new PutItemCommand(params3))

      // Example Pass
      const params4 = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'pass::0015',
            sk: '123456789',
            parkName: 'Test Park 1',
            firstName: 'First',
            searchFirstName: 'first',
            lastName: 'Last',
            searchLastName: 'last',
            facilityName: 'Parking lot A',
            email: 'noreply@gov.bc.ca',
            date: passDate.toUTC().toISO(),
            shortPassDate: '2012-01-01',
            type: 'DAY',
            registrationNumber: '123456789',
            numberOfGuests: '4',
            passStatus: 'active',
            phoneNumber: '5555555555',
            facilityType: 'Trail',
            isOverbooked: false,
            creationDate: passDate.toUTC().toISO(),
            dateUpdated: passDate.toUTC().toISO()
          })
        }
      await dynamoClient.send(new PutItemCommand(params4))
     
     const params5 = {
          TableName: TABLE_NAME,
          Item: marshall({
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
            date: passDate.toUTC().toISO(),
            shortPassDate: '2012-01-01',
            type: 'DAY',
            registrationNumber: '123456789',
            numberOfGuests: '4',
            passStatus: 'active',
            phoneNumber: '5555555555',
            facilityType: 'Trail',
            isOverbooked: false,
            creationDate: passDate.toUTC().toISO(),
            dateUpdated: passDate.toUTC().toISO()
          })
        }
      await dynamoClient.send(new PutItemCommand(params5))

      const params6 = {
          TableName: TABLE_NAME,
          Item: marshall({
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
          })
        }
      await dynamoClient.send(new PutItemCommand(params6))

     const params7 = {
          TableName: TABLE_NAME,
          Item: marshall({
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
          })
        }
      await dynamoClient.send(new PutItemCommand(params7))

      const params8 = {
          TableName: TABLE_NAME,
          Item: marshall({
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
          })
        }
        await dynamoClient.send(new PutItemCommand(params8))
    } 
    
  }
}
