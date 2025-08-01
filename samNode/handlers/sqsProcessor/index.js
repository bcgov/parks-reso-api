const { logger } = require('/opt/baseLayer');
const axios = require('axios');

exports.handler = async event => {
  logger.debug('SQS Processor: ', event);
  const batchItemFailures = [];

  if (!event || !Array.isArray(event.Records)) {
    logger.error('Invalid event object.');
    return { batchItemFailures };
  }

  logger.debug(`SQS Processor: Received ${event.Records.length} records`);

  await Promise.all(
    event.Records.map(async record => {
      try {
        const bodyObject = JSON.parse(record.body);

        if (bodyObject.service === 'GCN') {
          await handleGCNRecord(bodyObject);
        } else {
          logger.debug(`Unknown service type: ${bodyObject.service}`);
        }
      } catch (error) {
        logger.error('Failed to process record', {
          messageId: record.messageId,
          error: error?.message,
          stack: error?.stack
        });

        // If the error is a NoRetry error, we log it but do not retry
        if (error.name === 'NoRetry') {
          logger.debug(`NoRetry; won't retry messageId: ${record.messageId}`);
        } else {
          batchItemFailures.push({ itemIdentifier: record.messageId });
        }
      }
    })
  );

  return { batchItemFailures };
};

const handleGCNRecord = async record => {
  logger.debug('Handling GCN Record', { template_id: record.template_id });

  const gcnData = {
    email_address: record.email_address,
    template_id: record.template_id,
    personalisation: record.personalisation
  };

  try {
    const response = await axios({
      method: 'post',
      url: process.env.GC_NOTIFY_API_PATH,
      headers: {
        Authorization: process.env.GC_NOTIFY_API_KEY,
        'Content-Type': 'application/json'
      },
      data: gcnData
    });

    logger.info('GCNotify email sent.', { status: response.status });
    return response;
  } catch (error) {
    if (error.response) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      logger.debug('Received error from GCNotify', {
        status,
        data: errorData
      });

      if (status === 429 || status === 500 || status === 503) {
        // These should be retries
        throw error;
      }

      if (status === 400 || status === 403) {
        // These 400 errors are essentially client errors, such as invalid template ID or wonky email address.
        // We log the error and throw a NoRetry error to avoid retrying them
        logger.debug('Client or auth error from GCNotify', {
          status,
          data: JSON.stringify(errorData)
        });
        const noRetryError = new Error(`NoRetry: ${status}`);
        noRetryError.name = 'NoRetry';
        throw noRetryError;
      }

      // Unexpected status, we'll retry this
      logger.debug('Unexpected HTTP status', { status });
      throw error;
    }

    // Network errors, we'll retry this
    logger.debug('Transient network error calling GCNotify', { message: error.message });
    throw error;
  }
};
