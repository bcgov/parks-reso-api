const { Console } = require('winston/lib/winston/transports');
const { logger } = require('/opt/baseLayer');
const axios = require('axios');

exports.handler = async (event) => {
  if (event === null || !(Symbol.iterator in Object(event.Records))) {
    logger.error('Invalid event object.');
    return {};
  }

  logger.info("SQS Processor:", event.Records?.length);
  for(const record of event.Records) {
    let bodyObject;
    try {
      bodyObject = JSON.parse(record.body);
      if (bodyObject.service === 'GCN') {
        await handleGCNRecord(bodyObject);
      }
    } catch (error) {
      console.error("Error parsing JSON from record.body did not handle gcn record:", error);
    }
  }
  return {};
};

const handleGCNRecord = async function (record, retry = true) {
  logger.info('Handling GCN Record');
  const gcnData = {
    email_address: record.email_address,
    template_id: record.template_id,
    personalisation: record.personalisation
  };
  
  try {
    logger.info('Sending payload to GCN');
    const response = await axios({
      method: 'post',
      url: process.env.GC_NOTIFY_API_PATH,
      headers: {
        Authorization: process.env.GC_NOTIFY_API_KEY,
        'Content-Type': 'application/json'
      },
      data: gcnData
    });

    // If we get here, the request was successful
    logger.info('GCNotify email sent.');
    return response;

  } catch (error) {
    // Check if it's a 503 error and we haven't retried yet
    if (error.response?.status === 503 && retry === true) {
      logger.info('Received 503 from GCNotify, waiting 5 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 5000)); 
      
      try {
        return await handleGCNRecord(record, false); // Retry once
      } catch (retryError) {
        logger.warn('Retry failed, ignoring this record:', retryError.message);
        return null; 
      }
    }
    throw error;
  }
};