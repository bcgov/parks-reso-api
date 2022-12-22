const writeFacilityHandler = require('../lambda/writeFacility/index');
const jwt = require('jsonwebtoken');
const ALGORITHM = process.env.ALGORITHM || "HS384";

const token = jwt.sign({ foo: 'bar' }, 'shhhhh', { algorithm: ALGORITHM });

describe('WriteFacility General', () => {
  test('Handler - 403 Unauthorized - nothing passed in', async () => {
    expect(await writeFacilityHandler.handler(null, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('Handler - 403 Unauthorized - invalid token', async () => {
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
});

describe('ParkAccess', () => {
  test('GET fails General - 403 - Unauthorized', async () => {
    expect(await writeFacilityHandler.handler(null, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('POST fails General - 403 - Unauthorized', async () => {
    const event = {
      httpMethod: 'POST'
    }
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });

  test('PUT fails General - 403 - Unauthorized', async () => {
    const event = {
      httpMethod: 'PUT'
    }
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
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Not Implemented"}',
      statusCode: 405
    });
  });

  test('POST fails - 403 - Not an admin', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({}),
      httpMethod: 'POST'
    };
    expect(await writeFacilityHandler.handler(event, null)).toMatchObject({
      body: '{"msg":"Unauthorized"}',
      statusCode: 403
    });
  });
});