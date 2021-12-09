const writePassHandler = require('../lambda/writePass/index');
const {DocumentClient} = require('aws-sdk/clients/dynamodb');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';

const isTest = true;
const config = {
  convertEmptyValues: true,
  ...(isTest && {
    endpoint: 'localhost:8000',
    sslEnabled: false,
    region: 'local-env',
  }),
};

const ddb = new DocumentClient(config);

const jwt = require('jsonwebtoken');
const token = jwt.sign({
                         data: 'verified'
                       },
                       'defaultSecret');

beforeAll(async () => {
  return await initializeDatabase();
});

async function initializeDatabase() {
  try {
    const AWS = require("aws-sdk");
    const dynamo = new AWS.DynamoDB(config);
    await dynamo.createTable({
      TableName: TABLE_NAME,
      KeySchema: [
        {
          AttributeName: 'pk',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'sk',
          KeyType: 'RANGE'
        }
      ],
      AttributeDefinitions: [
        {
          AttributeName: 'pk',
          AttributeType: 'S'
        },
        {
          AttributeName: 'sk',
          AttributeType: 'S'
        }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1
      },
    }).promise();

    console.log('Initialized Database')
  } catch (e) {
    // Table already exists
    console.log("Error initializing database", e);
  }
}

describe('Pass Fails', () => {
  test('Handler - 400 Bad Request - nothing passed in', async () => {
    expect(await writePassHandler.handler(null, null)).toMatchObject(
      {
        "body": JSON.stringify({
          msg: "There was an error in your submission.",
          title: "Bad Request"
        }),
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 400
      }
    );
  });

  test('Handler - 400 Bad Request - Missing JWT', async () => {
    const event = {
      body: JSON.stringify({
        parkName: '',
        firstName: '',
        lastName: '',
        facilityName: '',
        email: '',
        date: '',
        type: '',
        numberOfGuests: '',
        phoneNumber: '',
        facilityType: '',
        license: ''
        // Missing JWT
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject(
      {
        "body": JSON.stringify({
          msg: "Missing CAPTCHA verification.",
          title: "Missing CAPTCHA verification"
        }),
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 400
      }
    );
  });

  test('Handler - 400 Bad Request - JWT Invalid', async () => {
    const event = {
      body: JSON.stringify({
        parkName: '',
        firstName: '',
        lastName: '',
        facilityName: '',
        email: '',
        date: '',
        type: '',
        numberOfGuests: '',
        phoneNumber: '',
        facilityType: '',
        license: '',
        captchaJwt: 'This is an invalid JWT'
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject(
      {
        "body": JSON.stringify({
          msg: "CAPTCHA verification failed.",
          title: "CAPTCHA verification failed"
        }),
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 400
      }
    );
  });

  test('Handler - 400 Bad Request - Trail pass limit maximum', async () => {
    const event = {
      body: JSON.stringify({
        parkName: '',
        firstName: '',
        lastName: '',
        facilityName: '',
        email: '',
        date: '',
        type: '',
        numberOfGuests: 5, // Too many
        phoneNumber: '',
        facilityType: 'Trail',
        license: '',
        captchaJwt: token
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject(
      {
        "body": "{\"msg\":\"You cannot have more than 4 guests on a trail.\",\"title\":\"Too many guests\"}",
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 400
      }
    );
  });

  test('Handler - 400 Bad Request - Invalid Date', async () => {
    const event = {
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
        facilityType: '',
        license: '',
        captchaJwt: token
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject(
      {
        "body": JSON.stringify({
          msg: "Something went wrong.",
          title: "Operation Failed"
        }),
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 400
      }
    );
  });

  test('Handler - 400 Bad Request - One or more params are invalid.', async () => {
    const event = {
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
        facilityType: '',
        license: '',
        captchaJwt: token
      })
    };
    expect(await writePassHandler.handler(event, null)).toMatchObject(
      {
        "body": JSON.stringify({
          msg: "Something went wrong.",
          title: "Operation Failed"
        }),
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 400
      }
    );
  });

});

describe('Pass Successes', () => {

  beforeEach(async () => {
    await databaseOperation(1, 'setup');
  });

  afterEach(async () => {
    await databaseOperation(1, 'teardown');
  });

  test('Handler - 200 Email Failed to Send, but pass has been created for a Trail.', async () => {
    const event = {
      body: JSON.stringify({
        parkName: 'Test Park 1',
        firstName: 'Jest',
        lastName: 'User',
        facilityName: 'Parking lot A',
        email: 'noreply@gov.bc.ca',
        date: new Date(),
        type: 'AM',
        numberOfGuests: 1,
        phoneNumber: '2505555555',
        facilityType: 'Trail',
        license: 'abc123',
        captchaJwt: token
      })
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body.pk).toEqual("pass::Test Park 1");
    expect(typeof body.sk).toBe('string');
    expect(body.firstName).toEqual('Jest');
    expect(body.lastName).toEqual('User');
    expect(body.facilityName).toEqual('Parking lot A');
    expect(body.email).toEqual('noreply@gov.bc.ca');
    expect(typeof body.date).toBe('string');
    expect(body.type).toEqual('AM');
    expect(typeof body.registrationNumber).toBe('string');
    expect(body.numberOfGuests).toEqual(1);
    expect(body.passStatus).toEqual('reserved');
    expect(body.phoneNumber).toEqual('2505555555');
    expect(body.facilityType).toEqual('Trail');
    expect(typeof body.err).toBe('string');
  });

  test('Handler - 200 Email Failed to Send, but pass has been created for a Parking Pass.', async () => {
    const event = {
      body: JSON.stringify({
        parkName: 'Test Park 1',
        firstName: 'Jest',
        lastName: 'User',
        facilityName: 'Parking lot A',
        email: 'noreply@gov.bc.ca',
        date: new Date(),
        type: 'AM',
        numberOfGuests: 1,
        phoneNumber: '2505555555',
        facilityType: 'Parking',
        mapLink: 'http://maps.google.com',
        license: 'abc123',
        captchaJwt: token
      })
    };

    const response = await writePassHandler.handler(event, null);
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body.pk).toEqual("pass::Test Park 1");
    expect(typeof body.sk).toBe('string');
    expect(body.firstName).toEqual('Jest');
    expect(body.lastName).toEqual('User');
    expect(body.facilityName).toEqual('Parking lot A');
    expect(body.email).toEqual('noreply@gov.bc.ca');
    expect(typeof body.date).toBe('string');
    expect(body.type).toEqual('AM');
    expect(typeof body.registrationNumber).toBe('string');
    expect(body.numberOfGuests).toEqual(1);
    expect(body.passStatus).toEqual('reserved');
    expect(body.phoneNumber).toEqual('2505555555');
    expect(body.facilityType).toEqual('Parking');
    expect(typeof body.err).toBe('string');
  });
});

async function databaseOperation(version, mode) {
  if (version === 1) {
    if (mode === 'setup') {
      await ddb.put({
                      TableName: TABLE_NAME,
                      Item: {
                        "pk": "park",
                        "sk": "Test Park 1",
                        "name": "Test Park 1",
                        "description": "<p>My Description</p>",
                        "bcParksLink": "http://google.ca",
                        "mapLink": "https://maps.google.com",
                        "status": "open",
                        "visible": true
                      }
                    }).promise();

      await ddb.put({
          TableName: TABLE_NAME,
          Item: {
            "pk": "facility::Test Park 1",
            "sk": "Parking lot A",
            "name": "Parking lot A",
            "description": "A Parking Lot!",
            "bookingTimes": {
              "AM": {
                "max": 25
              },
            },
            "reservations": {
              "20211207": {
                "AM": 1
              }
            },
            "status": "open",
            "visible": true
          }
        }).promise();
    } else {
      console.log("Teardown")
      // Teardown
      await ddb.delete({
        TableName: TABLE_NAME,
        Key: {
          "pk": "park",
          "sk": "Test Park 1"
        }
      }).promise();
      await ddb.delete({
        TableName: TABLE_NAME,
        Key: {
          "pk": "facility::Test Park 1",
          "sk": "Parking lot A"
        }
      }).promise();
    }
  }
}