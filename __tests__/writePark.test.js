const writeParkHandler = require('../lambda/writePark/index');
const jwt = require('jsonwebtoken');
const ALGORITHM = process.env.ALGORITHM || "HS384";

const token = jwt.sign({ foo: 'bar' }, 'shhhhh', { algorithm: ALGORITHM});

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