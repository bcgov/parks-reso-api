const AWS = require('aws-sdk');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');

const mockDataRegistryUtils = {
  getCurrentDisplayNameById: jest.fn(async (identifier) => {
    if (identifier === 'MOC1') {
      return 'New Park 1 Name';
    }
    return 'Old Park 2 Name';

  })
}

const { REGION, ENDPOINT, TABLE_NAME } = require('./global/settings');

let docClient;

async function setupDb() {

  docClient = new DocumentClient({
    region: REGION,
    endpoint: ENDPOINT,
    convertEmptyValues: true
  });

  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        pk: 'park',
        sk: 'MOC1',
        orcs: 'MOC1',
        name: 'Old Park 1 Name',
        description: '',
        bcParksLink: '',
        status: 'open',
        visible: true
      }
    })
    .promise();

  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        pk: 'park',
        sk: 'MOC2',
        orcs: 'MOC2',
        name: 'Old Park 2 Name',
        description: '',
        bcParksLink: '',
        status: 'open',
        visible: true
      }
    })
    .promise();
}

describe('updateParkNameHandler', () => {
  beforeAll(() => {
    jest.resetModules();
    return setupDb();
  });

  test('Name update changes if necessary', async () => {
    jest.mock('../lambda/dataRegisterUtils', () => {
      return mockDataRegistryUtils;
    });

    const updateParkName = require('../lambda/updateParkName/index');
    await updateParkName.handler(null, {});
    const res1 = await docClient.get({
      TableName: TABLE_NAME,
      Key: {
        pk: 'park',
        sk: 'MOC1',
      }
    }).promise();
    const res2 = await docClient.get({
      TableName: TABLE_NAME,
      Key: {
        pk: 'park',
        sk: 'MOC2',
      }
    }).promise();
    expect(res1.Item.name).toEqual('New Park 1 Name');
    expect(res2.Item.name).toEqual('Old Park 2 Name');
  });
})
