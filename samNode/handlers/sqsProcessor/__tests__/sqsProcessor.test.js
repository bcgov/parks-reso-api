// Mock the logger before requiring the handler
jest.mock('/opt/baseLayer', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('SQS Processor Tests', () => {
  const OLD_ENV = process.env;
  let mockLogger;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...OLD_ENV }; // Make a copy of environment
    process.env.GC_NOTIFY_API_PATH = 'http://localhost:3000/api';
    
    // Get the mocked logger
    mockLogger = require('/opt/baseLayer').logger;
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  test('returns batchItemFailures when nothing passed in', async () => {
    const handler = require('../index');
    const res = await handler.handler(null);
    expect(res).toEqual({ batchItemFailures: [] });
    expect(mockLogger.error).toHaveBeenCalledWith('Invalid event object.');
  });

  test('returns batchItemFailures when event passed in, but records empty', async () => {
    const handler = require('../index');
    const res = await handler.handler({ Records: [] });
    expect(res).toEqual({ batchItemFailures: [] });
    expect(mockLogger.debug).toHaveBeenCalledWith('SQS Processor: Received 0 records');
  });

  test('returns batchItemFailures when event passed in and calls GCNotify successfully', async () => {
    const axios = require('axios');
    jest.mock("axios");
    axios.mockImplementation(() => Promise.resolve({ status: 200, data: { id: 'test-123' } }));
    
    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        messageId: 'message',
        body: JSON.stringify({
          email_address: 'foo@example.com',
          service: 'GCN',
          template_id: 'someID',
          personalisation: { id: "1234" }
        })
      }]
    });
    
    expect(res).toEqual({ batchItemFailures: [] });
    expect(mockLogger.info).toHaveBeenCalledWith('GCNotify email sent.', { status: 200 });
  });

  test('adds to batchItemFailures when gcNotify fails with retryable error', async () => {
    const axios = require('axios');
    
    const error = new Error('Internal Server Error');
    error.response = { status: 500, data: { error: 'Internal Server Error' } };
    axios.mockImplementation(() => Promise.reject(error));
    
    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        messageId: 'message',
        body: JSON.stringify({
          email_address: 'foo@example.com',
          service: 'GCN',
          template_id: 'someID',
          personalisation: { id: "1234" }
        })
      }]
    });
    
    expect(res).toEqual({ batchItemFailures: [{ itemIdentifier: 'message' }] });
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to process record', {
      messageId: 'message',
      error: expect.any(String),
      stack: expect.any(String)
    });
  });

  test('does not retry on 400 error (NoRetry)', async () => {
    const axios = require('axios');
    
    axios.mockImplementation(() => Promise.reject({
      response: { 
        status: 400, 
        data: { error: 'Bad Request - Invalid template' } 
      }
    }));
    
    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        messageId: 'message',
        body: JSON.stringify({
          email_address: 'invalid@example.com',
          service: 'GCN',
          template_id: 'invalidID',
          personalisation: { id: "1234" }
        })
      }]
    });
    
    expect(res).toEqual({ batchItemFailures: [] });
    expect(mockLogger.debug).toHaveBeenCalledWith('NoRetry; won\'t retry messageId: message');
  });

  test('does not retry on 403 error (NoRetry)', async () => {
    const axios = require('axios');
    
    axios.mockImplementation(() => Promise.reject({
      response: { 
        status: 403, 
        data: { error: 'Forbidden - Invalid API key' } 
      }
    }));
    
    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        messageId: 'message-403',
        body: JSON.stringify({
          email_address: 'test@example.com',
          service: 'GCN',
          template_id: 'templateID',
          personalisation: { id: "1234" }
        })
      }]
    });
    
    expect(res).toEqual({ batchItemFailures: [] });
    expect(mockLogger.debug).toHaveBeenCalledWith('NoRetry; won\'t retry messageId: message-403');
  });

  test('retries on 429 error', async () => {
    const axios = require('axios');
    
    axios.mockImplementation(() => Promise.reject({
      response: { status: 429, data: { error: 'Too Many Requests' } }
    }));
    
    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        messageId: 'message-429',
        body: JSON.stringify({
          email_address: 'test@example.com',
          service: 'GCN',
          template_id: 'template-123',
          personalisation: { name: 'Test User' }
        })
      }]
    });

    expect(res).toEqual({ batchItemFailures: [{ itemIdentifier: 'message-429' }] });
  });

  test('retries on 503 error', async () => {
    const axios = require('axios');
    
    axios.mockImplementation(() => Promise.reject({
      response: { status: 503, data: { error: 'Service Unavailable' } }
    }));
    
    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        messageId: 'message-503',
        body: JSON.stringify({
          email_address: 'test@example.com',
          service: 'GCN',
          template_id: 'template-123',
          personalisation: { name: 'Test User' }
        })
      }]
    });

    expect(res).toEqual({ batchItemFailures: [{ itemIdentifier: 'message-503' }] });
  });

  test('handles network errors with retry', async () => {
    const axios = require('axios');
    
    axios.mockImplementation(() => Promise.reject(new Error('Network error')));
    
    const handler = require('../index');

    const res = await handler.handler({
      Records: [{
        messageId: 'message-network',
        body: JSON.stringify({
          email_address: 'test@example.com',
          service: 'GCN',
          template_id: 'template-123',
          personalisation: { name: 'Test User' }
        })
      }]
    });

    expect(res).toEqual({ batchItemFailures: [{ itemIdentifier: 'message-network' }] });
    expect(mockLogger.debug).toHaveBeenCalledWith('Transient network error calling GCNotify', { message: 'Network error' });
  });
});
