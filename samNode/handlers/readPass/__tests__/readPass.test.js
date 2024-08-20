
const jwt = require('jsonwebtoken');

const { REGION, ENDPOINT } = require('../../../__tests__/settings');
const { createDB, deleteDB, getHashedText } = require('../../../__tests__/setup.js');
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');


const pass1 = {
  pk: 'pass::0016',
  sk: '123456789',
  parkName: 'Test Park 2',
  firstName: 'First',
  searchFirstName: 'first',
  lastName: 'Last',
  searchLastName: 'last',
  facilityName: 'Parking lot A',
  email: 'noreply@gov.bc.ca',
  date: new Date('2012-01-01').toISOString(),
  shortPassDate: '2012-01-01',
  type: 'DAY',
  registrationNumber: '123456789',
  numberOfGuests: '4',
  passStatus: 'active',
  phoneNumber: '5555555555',
  facilityType: 'Trail',
  park: '0016',
  isOverbooked: false,
  creationDate: new Date('2012-01-01').toISOString(),
  dateUpdated: new Date('2012-01-01').toISOString(),
};

const ALGORITHM = process.env.ALGORITHM || "HS384";
const token = jwt.sign({ foo: 'bar' }, 'shhhhh', { algorithm: ALGORITHM });

describe('Read Pass', () => {
  const OLD_ENV = process.env;
  beforeEach(async () => {
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME
    await createDB(hash)
    await databaseOperation(TABLE_NAME);
  });

  afterAll(async () => {
    process.env = OLD_ENV; // Restore old environment
  });

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env = OLD_ENV; // Restore old environment
  });

  test('ReadPass Handler - 400 Bad Request - nothing passed in', async () => {
    const handler = require('../index');
    expect(await (await handler.handler(null, null)).statusCode).toEqual(400);
  });

  test('ReadPass Handler - 400 Bad Request - JWT Invalid', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return {
        decodeJWT: jest.fn((event) => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn((token) => {
          return {
            isAdmin: false,
            roles: ['boo']
          }
        })
      }
    });
    const handler = require('../index');
    const event = {
      headers: {
        Authorization: 'None'
      },
      queryStringParameters: {
        manualLookup: true,
        park: 'Test Park 2',
        date: '2012-02-02'
      }
    };
    const response = await handler.handler(event, null);
    expect(response.statusCode).toEqual(403);
    const body = JSON.parse(response.body);
    expect(body.msg).toEqual('Unauthorized to perform this action.');
    expect(body.title).toEqual('Unauthorized.');
  });

  test('ReadPass Handler - 400 Bad Request - JWT Invalid', async () => {
    const handler = require('../index');
    const event = {
      headers: {
        Authorization: 'None'
      },
      queryStringParameters: {
        manualLookup: true,
        park: false,
        date: 'bad date'
      }
    };
    const response = await handler.handler(event, null);
    expect(response.statusCode).toEqual(400);
    const body = JSON.parse(response.body);
    expect(body.msg).toEqual('Invalid Request');
  });

  test('ReadPass - 200 - No pass found', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return {
        decodeJWT: jest.fn((event) => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn((token) => {
          return {
            isAdmin: true,
            isAuthenticated: true,
            roles: ['sysadmin']
          }
        })
      }
    });
    const handler = require('../index');
    const event = {
      headers: {
        Authorization: "Bearer " + token
      },
      queryStringParameters: {
        manualLookup: true,
        park: '0016',
        date: '2012-01-01',
        facilityName: 'Parking Lot XYZ non-existent',
        registrationNumber: '123456789',
        email: 'noreply@gov.bc.ca',
        firstName: 'First',
        lastName: 'Last'
      }
    };
    const response = await handler.handler(event, null);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual([]);
  });

  test('ReadPass - 400 - Invalid Request', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return {
        decodeJWT: jest.fn((event) => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn((token) => {
          return {
            isAdmin: true,
            isAuthenticated: true,
            roles: ['sysadmin']
          }
        })
      }
    });
    const handler = require('../index');
    const event = {
      headers: {
        Authorization: "Bearer " + token
      },
      queryStringParameters: {
        fail: null
      }
    };
    const response = await handler.handler(event, null);
    expect(response.statusCode).toEqual(400);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      msg: "Invalid Request"
    });
  });

  test('ReadPass Handler - 200', async () => {
    jest.mock('/opt/permissionLayer', () => {
      return {
        decodeJWT: jest.fn((event) => {
          // console.log("STUB");
        }),
        resolvePermissions: jest.fn((token) => {
          return {
            isAdmin: true,
            isAuthenticated: true,
            roles: ['sysadmin']
          }
        })
      }
    });
    const handler = require('../index');
    const event = {
      headers: {
        Authorization: "Bearer " + token
      },
      queryStringParameters: {
        manualLookup: true,
        park: '0016',
        date: '2012-01-01',
        facilityName: 'Parking lot A',
        registrationNumber: '123456789',
        email: 'noreply@gov.bc.ca',
        firstName: 'First',
        lastName: 'Last'
      }
    };

    const response = await handler.handler(event, null);
    const parsedBody = JSON.parse(response.body);
    
    expect(parsedBody[0].email).toEqual(pass1.email);
    expect(parsedBody[0].registrationNumber).toEqual(pass1.registrationNumber);
    expect(parsedBody[0].firstName).toEqual(pass1.firstName);
    expect(parsedBody[0].lastName).toEqual(pass1.lastName);
    expect(parsedBody[0].facilityName).toEqual(pass1.facilityName);
    expect(parsedBody[0].park).toEqual(pass1.park);
    expect(parsedBody[0].date).toEqual(pass1.date);
  });
});

async function databaseOperation(TABLE_NAME) {
      const dynamoClient = new DynamoDBClient({
        region: REGION,
        endpoint: ENDPOINT
      });

      const params = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'park',
            sk: 'Test Park 2',
            name: 'Test Park 2',
            description: '<p>My Description</p>',
            bcParksLink: 'http://google.ca',
            mapLink: 'https://maps.google.com',
            status: 'open',
            visible: true
          })
        }
      await dynamoClient.send(new PutItemCommand(params));

      const params2 = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'park',
            sk: '0016',
            name: '0016',
            description: '<p>My Description</p>',
            bcParksLink: 'http://google.ca',
            mapLink: 'https://maps.google.com',
            status: 'open',
            visible: true
          })
        }
        await dynamoClient.send(new PutItemCommand(params2))

      // Example Pass
      const params3 = {
          TableName: TABLE_NAME,
          Item: marshall(pass1)
        }
      await dynamoClient.send(new PutItemCommand(params3))

      const params4 = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'facility::Test Park 2',
            sk: 'Parking lot A',
            name: 'Parking lot A',
            description: 'A Parking Lot!',
            isUpdating: false,
            type: "Parking",
            bookingTimes: {
                AM: {
                  max: '25'
                },
                DAY: {
                  max: '25'
                }
            },
            bookingDays: 
              {
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
            status: {
                stateReason: '',
                state: 'open' 
            },
            qrcode: true ,
            visible: true 
          })
        }
      await dynamoClient.send(new PutItemCommand(params4));

      const params5 = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'facility::Test Park 2',
            sk: 'Trail B',
            name: 'Trail B',
            description: 'A Trail!',
            qrcode: true,
            isUpdating: false,
            type: "Trail",
            bookingTimes: {
                AM: {
                   max: '25'
                },
                DAY: {
                  max: '25'
                }
            },
            bookingDays: {
                "Sunday": true,
                "Monday": true,
                "Tuesday": true,
                "Wednesday": true,
                "Thursday": true,
                "Friday": true ,
                "Saturday": true 
            },
            bookingDaysRichText: '',
            bookableHolidays: [],
            status: {
                stateReason: '',
                state: 'open' 
            },
            visible: true
          })
        }
      await dynamoClient.send(new PutItemCommand(params5))

      const params6 = {
          TableName: TABLE_NAME,
          Item: marshall({
            pk: 'facility::0016',
            sk: 'P1 and Lower P5',
            name: 'P1 and Lower P5',
            description: 'A Trail!',
            qrcode: true,
            isUpdating: false,
            type: "Trail",
            bookingTimes: {
                AM: {
                  max: '25' 
                },
                DAY: {
                  max: '25'  
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
            status: {
                stateReason: '' ,
                state: 'open'
            },
            visible: true 
          })
        }
        await dynamoClient.send(new PutItemCommand(params6))
}
