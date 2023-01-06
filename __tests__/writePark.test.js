const writeParkHandler = require('../lambda/writePark/index');
const jwt = require('jsonwebtoken');
const ALGORITHM = process.env.ALGORITHM || "HS384";
const { mockdb } = require('./global/mock_db');

jest.mock('../lambda/permissionUtil', () => {
  return {
    decodeJWT: jest.fn((event) => {
      if (event?.headers?.Authorization === 'validAdminToken') {
        return 'validAdminToken'
      } else if (event?.headers?.Authorization === 'validToken') {
        return 'validToken'
      } else {
        return 'invalidToken'
      }
    }),
    resolvePermissions: jest.fn((token) => {
      let obj = {
        isAuthenticated: false,
      }
      if (token === 'validToken' || token === 'validAdminToken') {
        obj.isAuthenticated = true;
      }
      if (token === 'validAdminToken') {
        obj.isAdmin = true;
      }
      return obj
    }),
    getParkAccess: jest.fn(),
  }
});

const token = jwt.sign({ foo: 'bar' }, 'shhhhh', { algorithm: ALGORITHM });

describe('Unsuccessful authentications', () => {

  test('Handler - 403 Unauthorized - nothing passed in', async () => {
    expect(await writeParkHandler.handler(null, null)).toMatchObject(
      {
        "body": "{\"msg\":\"Unauthorized\"}",
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 403
      }
    );
  });

  test('Handler - 403 Unauthorized - invalid token', async () => {
    // decodeJWT.mockImplementation((event) => {
    //   console.log('event:', event);
    //   return 'shhhhhh'
    // })
    const event = {
      headers: {
        Authorization: "Bearer " + token + "invalid"
      },
      httpMethod: "POST"
    };
    expect(await writeParkHandler.handler(event, null)).toMatchObject(
      {
        "body": "{\"msg\":\"Unauthorized\"}",
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 403
      }
    );
  });

  test('GET fails - 405 - Not Implemented', async () => {
    const event = {
      headers: {
        Authorization: "Bearer " + token
      },
      httpMethod: "GET"
    };
    expect(await writeParkHandler.handler(event, null)).toMatchObject(
      {
        "body": "{\"msg\":\"Not Implemented\"}",
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 405
      }
    );
  });

  // TODO: Mock jwksClient
  test('POST operation TODO', async () => {
    const event = {
      headers: {
        Authorization: "Bearer " + token
      },
      httpMethod: "POST"
    };
    expect(await writeParkHandler.handler(event, null)).toMatchObject(
      {
        "body": "{\"msg\":\"Unauthorized\"}",
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 403
      }
    );
  });

  // TODO: Mock jwksClient
  test('PUT operation TODO', async () => {
    const event = {
      headers: {
        Authorization: "bad"
      },
      httpMethod: "PUT"
    };
    expect(await writeParkHandler.handler(event, null)).toMatchObject(
      {
        "body": "{\"msg\":\"Unauthorized\"}",
        "headers": {
          "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        },
        "statusCode": 403
      }
    );
  });

});

describe('Successful authentications', () => {
  const permissionUtil = require('../lambda/permissionUtil');
  const decodeSpy = jest.spyOn(permissionUtil, 'decodeJWT');
  const getAccessSpy = jest.spyOn(permissionUtil, 'getParkAccess');

  beforeEach(async () => {
    jest.clearAllMocks();
  })

  test('non-Admin - PUT', async () => {
    const event = {
      headers: {
        Authorization: "validToken"
      },
      httpMethod: "PUT",
      body: '{}',
    };
    await writeParkHandler.handler(event, null)
    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(getAccessSpy).toHaveBeenCalledTimes(1);
  });

  test('non-Admin - POST', async () => {
    const event = {
      headers: {
        Authorization: "validToken"
      },
      httpMethod: "POST",
      body: '{}',
    };
    await writeParkHandler.handler(event, null)
    expect(decodeSpy).toHaveBeenCalledTimes(1);
  });

  test('admin - PUT', async () => {
    const event = {
      headers: {
        Authorization: "validAdminToken"
      },
      httpMethod: "PUT",
      body: '{}',
    };
    await writeParkHandler.handler(event, null)
    expect(decodeSpy).toHaveBeenCalledTimes(1);
  });

  test('admin - POST', async () => {
    const event = {
      headers: {
        Authorization: "validAdminToken"
      },
      httpMethod: "POST",
      body: '{}',
    };
    await writeParkHandler.handler(event, null)
    expect(decodeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Create a park', () => {
  let mockBody = {
    park: {
      name: 'Mock Park 1',
      orcs: 'MOC1',
      status: 'open',
      bcParksLink: 'https://bcparks.ca',
      mapLink: 'https://bcparks.ca',
      capacity: 10,
    },
    description: 'Mock Park 1 description',
    visible: true,
    winterWarning: false,
    facilities: []
  }

  let mockClient

  beforeEach(async () => {
    mockClient = await mockdb.setupDb()
  })

  test('creates a park', async () => {
    const createEvent = {
      headers: {
        Authorization: "validAdminToken"
      },
      httpMethod: "POST",
      body: JSON.stringify(mockBody)
    };
    expect(await writeParkHandler.handler(createEvent, null)).toMatchObject({}) // success;
    const createRes = await mockClient
      .get({
        TableName: mockdb.TABLE_NAME,
        Key: {
          pk: 'park',
          sk: 'MOC1'
        }
      })
      .promise();
    expect(createRes.Item.pk).toBe('park');
    expect(createRes.Item.sk).toBe('MOC1');
    expect(createRes.Item.status).toBe('open');
  });

  test('updates a park', async () => {
    mockBody.pk = 'park';
    mockBody.sk = 'MOC1';
    mockBody.park.status = 'closed';
    const updateEvent = {
      headers: {
        Authorization: "validAdminToken"
      },
      httpMethod: "PUT",
      body: JSON.stringify(mockBody)
    };
    await writeParkHandler.handler(updateEvent, null);
    const updateRes = await mockClient
      .get({
        TableName: mockdb.TABLE_NAME,
        Key: {
          pk: 'park',
          sk: 'MOC1'
        }
      })
      .promise();
    expect(updateRes.Item.pk).toBe('park');
    expect(updateRes.Item.sk).toBe('MOC1');
    expect(updateRes.Item.status).toBe('closed');
  });

});
