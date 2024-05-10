const { REGION, ENDPOINT, TABLE_NAME } = require('./global/settings');

const { encrypt } = require('../lambda/jwtUtil');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const jwt = require('jsonwebtoken');
const ALGORITHM = process.env.ALGORITHM || 'HS384';
const SECRET = process.env.JWT_SECRET || 'defaultSecret';

const docClient = new DocumentClient({
  region: REGION,
  endpoint: ENDPOINT,
  convertEmptyValues: true
});

let encrypted;
describe('checkActivationHandler', () => {
  test('encrypt test', async () => {
    const body = {
      answer: '123abc',
      expiry: Date.now() + 1 * 60000,
      facility: 'Test Trail',
      orcs: undefined
    };

    encrypted = await encrypt(body);
    const postBody = {
      body: JSON.stringify({
        validation: encrypted,
        answer: '123abc'
      })
    };

    expect(encrypted.protected).toBe('eyJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiZGlyIiwia2lkIjoiZ0JkYVMtRzhSTGF4MnFPYlREOTR3In0');
  });
});
