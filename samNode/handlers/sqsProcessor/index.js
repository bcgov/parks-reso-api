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

const handleGCNRecord = async function (record) {
  logger.info('Handling GCN Record');
  const gcnData = {
    email_address: record.email_address,
    template_id: record.template_id,
    personalisation: record.personalisation
  };
  logger.info('Sending payload to GCN');
  // Email this using GCNotify. Allow this to throw without a catch as it will push it back
  // into the SQS queue
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