describe('SQS Processor Tests', () => {
  const OLD_ENV = process.env;
  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV }; // Make a copy of environment
    process.env.GC_NOTIFY_API_PATH = 'http://localhost:3000/api';
    process.env.GC_NOTIFY_API_KEY  = 'abc123';
  });
  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  test('returns {} when noting passed in', async () => {
    const handler = require('../index');
    console.log("This test should pass properly")
    const res = await handler.handler(null);
    expect(res).toEqual({});
  });

  test('returns {} when event passed in, but records empty', async () => {
    const handler = require('../index');
    console.log("This test should pass properly")
    const res = await handler.handler({});
    expect(res).toEqual({});
  });

  test('returns {} when event passed in and calls GCNotify', async () => {
    const axios = require('axios');
    jest.mock("axios");
    axios.post.mockImplementation(() => Promise.resolve({ data: {} }));
    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        body: JSON.stringify({
          email_address: 'foo@example.com',
          service: 'GCN',
          template_id: 'someID',
          personalisation: { id: "1234" }
        })
      }]
    });
    expect(res).toEqual({});
  });

  test('throws an error when gcNotify fails', async () => {
    const axios = require('axios');
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('error'));
    const handler = require('../index');

    await handler.handler({
      Records: [{
        'messageAttributes': {
          'email_address': {
            'stringValue': 'foo@example.com'
          },
          'service': {
            'stringValue': 'GCN'
          },
          'template_id': {
            'stringValue': 'someID'
          },
          'personalisation': {
            'stringValue': '{ "id": 1234 }'
          }
        }
      }]
    }).catch(e => {
      expect(e).toBeTruthy();
    });
  });
});
