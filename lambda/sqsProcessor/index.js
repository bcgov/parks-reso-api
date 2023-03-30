const { logger } = require('../logger');
const axios = require('axios');

exports.handler = async (event) => {
  if (event === null || !(Symbol.iterator in Object(event.Records))) {
    logger.error('Invalid event object.');
    return {};
  }

  logger.info("SQS Processor:", event.Records?.length);

  for(const record of event.Records) {
    // Process GCN
    if (record?.messageAttributes?.service?.stringValue === 'GCN') {
      await handleGCNRecord(record);
    }
  }

  return {};
};

const handleGCNRecord = async function (record) {
  logger.info('Handling GCN Record');
  logger.debug(record);
  const gcnData = {
    email_address: record.messageAttributes.email_address.stringValue,
    template_id: record.messageAttributes.template_id.stringValue,
    personalisation: JSON.parse(record.messageAttributes.personalisation.stringValue)
  };
  logger.info('Sending payload to GCN');
  // Email this using GCNotify.  Allow this to throw without a catch as it will push it back
  // into the SQS queue.
  await axios({
    method: 'post',
    url: process.env.GC_NOTIFY_API_PATH,
    headers: {
      Authorization: process.env.GC_NOTIFY_API_KEY,
      'Content-Type': 'application/json'
    },
    data: gcnData
  });
  logger.info('GCNotify email sent.');
}