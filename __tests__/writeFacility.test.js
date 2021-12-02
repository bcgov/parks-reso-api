const writeFacilityHandler = require('../lambda/writeFacility/index');
const jwt = require('jsonwebtoken');
var token = jwt.sign({ foo: 'bar' }, 'shhhhh');

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
