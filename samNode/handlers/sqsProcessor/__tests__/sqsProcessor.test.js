describe('SQS Processor Tests', () => {
  const OLD_ENV = process.env;
  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
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
    axios.mockImplementation(() => Promise.resolve({ data: {} }));
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

  test('handles error when gcNotify fails with non-503 error', async () => {
    const axios = require('axios');
    
    // Mock console.error to prevent error output during test
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    axios.mockImplementation(() => Promise.reject(new Error('Network error')));
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
    consoleErrorSpy.mockRestore();
  });

  // 503 
  test('retries once on 503 error and succeeds', async () => {
    const axios = require('axios');

    // 503 then success
    const error503 = {
      response: { status: 503 },
      message: 'Service Unavailable'
    };
    const successResponse = { status: 200, data: { id: 'notification-123' } };

    // First call fails with 503, second call succeeds
    axios.mockImplementationOnce(() => Promise.reject(error503))
         .mockImplementationOnce(() => Promise.resolve(successResponse));

    jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 1;
    });

    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        body: JSON.stringify({
          email_address: 'test@example.com',
          service: 'GCN',
          template_id: 'template-123',
          personalisation: { name: 'Test User' }
        })
      }]
    });

    expect(res).toEqual({});
    expect(axios).toHaveBeenCalledTimes(2); // Verify retry happened
    global.setTimeout.mockRestore();
  });

  test('retries once on 503 error and fails, then ignores record', async () => {
    const axios = require('axios');
    
    const error503 = {
      response: { status: 503 },
      message: 'Service Unavailable'
    };

    // Both 503
    axios.mockImplementation(() => Promise.reject(error503));

    jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 1;
    });

    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        body: JSON.stringify({
          email_address: 'test@example.com',
          service: 'GCN',
          template_id: 'template-123',
          personalisation: { name: 'Test User' }
        })
      }]
    });

    expect(res).toEqual({}); // Should complete without throwing
    expect(axios).toHaveBeenCalledTimes(2); // Verify retry happened
    global.setTimeout.mockRestore();
  });

  test('does not retry on non-503 errors', async () => {
    const axios = require('axios');
    
    const error400 = {
      response: { status: 400 },
      message: 'Bad Request'
    };

    // Mock console.error to prevent error output during test
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    axios.mockImplementation(() => Promise.reject(error400));

    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        body: JSON.stringify({
          email_address: 'test@example.com',
          service: 'GCN',
          template_id: 'template-123',
          personalisation: { name: 'Test User' }
        })
      }]
    });

    expect(res).toEqual({}); // Should complete (error is caught in main loop)
    expect(axios).toHaveBeenCalledTimes(1); // Verify no retry
    consoleErrorSpy.mockRestore();
  });

  test('waits 5 seconds before retry on 503 error', async () => {
    const axios = require('axios');
    
    const error503 = {
      response: { status: 503 },
      message: 'Service Unavailable'
    };
    const successResponse = { status: 200, data: { id: 'notification-123' } };

    axios.mockImplementationOnce(() => Promise.reject(error503))
         .mockImplementationOnce(() => Promise.resolve(successResponse));

    // Mock setTimeout to verify 5-second delay
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
      expect(delay).toBe(5000);
      callback();
      return 1;
    });

    const handler = require('../index');

    await handler.handler({
      Records: [{
        body: JSON.stringify({
          email_address: 'test@example.com',
          service: 'GCN',
          template_id: 'template-123',
          personalisation: { name: 'Test User' }
        })
      }]
    });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    setTimeoutSpy.mockRestore();
  });

  test('handles multiple records with mixed 503 results', async () => {
    const axios = require('axios');
    
    const error503 = { response: { status: 503 }, message: 'Service Unavailable' };
    const successResponse = { status: 200, data: { id: 'notification-123' } };

    // First record: 503 then success, Second record: immediate success
    axios.mockImplementationOnce(() => Promise.reject(error503))
         .mockImplementationOnce(() => Promise.resolve(successResponse))
         .mockImplementationOnce(() => Promise.resolve(successResponse));

    jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 1;
    });

    const handler = require('../index');

    const res = await handler.handler({
      Records: [
        {
          body: JSON.stringify({
            email_address: 'test1@example.com',
            service: 'GCN',
            template_id: 'template-123',
            personalisation: { name: 'User 1' }
          })
        },
        {
          body: JSON.stringify({
            email_address: 'test2@example.com',
            service: 'GCN',
            template_id: 'template-456',
            personalisation: { name: 'User 2' }
          })
        }
      ]
    });

    expect(res).toEqual({});
    expect(axios).toHaveBeenCalledTimes(3); // First record: 2 calls, Second record: 1 call
    global.setTimeout.mockRestore();
  });

  test('handles invalid JSON in record body gracefully', async () => {
    // Mock console.error to prevent error output during test
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        body: 'invalid json string'
      }]
    });

    expect(res).toEqual({});
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error parsing JSON from record.body did not handle gcn record:',
      expect.any(SyntaxError)
    );
    
    consoleErrorSpy.mockRestore();
  });
});