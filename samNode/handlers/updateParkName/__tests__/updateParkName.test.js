
const { REGION, ENDPOINT } = require('../../../__tests__/settings');
const { createDB, deleteDB, getHashedText } = require('../../../__tests__/setup.js')
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb");

const mockDataRegistryUtils = {
  getCurrentDisplayNameById: jest.fn(async (identifier) => {
    if (identifier === 'MOC1') {
      return 'New Park 1 Name';
    }
    return 'Old Park 2 Name';
  })
}

async function setupDb(TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });
  const param = {
      TableName: TABLE_NAME,
      Item: marshall({
        pk: 'park',
        sk: 'MOC1',
        orcs: 'MOC1',
        name: 'Old Park 1 Name',
        description: '',
        bcParksLink: '',
        status: 'open',
        visible: true
      })
  }
  await dynamoClient.send(new PutItemCommand(param));

  const param2 = {
      TableName: TABLE_NAME,
      Item: marshall({
        pk: 'park',
        sk: 'MOC2',
        orcs: 'MOC2',
        name: 'Old Park 2 Name',
        description: '',
        bcParksLink: '',
        status: 'open',
        visible: true
      })
    }
  await dynamoClient.send(new PutItemCommand(param2));
}

describe('updateParkNameHandler', () => {
  const OLD_ENV = process.env.TABLE_NAME;
  let hash
  let TABLE_NAME
  beforeAll(() => {
    jest.resetModules();
  });

  beforeEach(async () => {
    jest.resetModules();
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash;
    TABLE_NAME = process.env.TABLE_NAME
    await createDB(hash);
    await setupDb(hash);
  })

  afterEach(async () => {
    await deleteDB(process.env.TABLE_NAME);
    process.env.TABLE_NAME = OLD_ENV; // Restore old environment
  });

  test('Name update changes if necessary', async () => {
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });
    jest.mock('/opt/dataRegisterLayer', () => {
      return mockDataRegistryUtils;
    });

    const updateParkName = require('../index');
    await updateParkName.handler(null, {});
    const params = {
      TableName: TABLE_NAME,
      Key: marshall({
        pk: 'park',
        sk: 'MOC1',
      })
    }
    const res1 = await dynamoClient.send(new GetItemCommand(params));
    const test1 = unmarshall(res1.Item);
    
    const params2 = {
      TableName: TABLE_NAME,
      Key: marshall({
        pk: 'park',
        sk: 'MOC2',
      })
    }
    const res2 = await dynamoClient.send(new GetItemCommand(params2));
    const test2 = unmarshall(res2.Item);
    expect(test1.name).toEqual('New Park 1 Name');
    expect(test2.name).toEqual('Old Park 2 Name');
  });
})
