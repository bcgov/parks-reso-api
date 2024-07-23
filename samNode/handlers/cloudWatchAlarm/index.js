const axios = require('axios');
const { DateTime } = require('luxon');
const { TIMEZONE, logger } = require('/opt/baseLayer');
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const AWS_ACCOUNT_LIST = JSON.parse(process.env.AWS_ACCOUNT_LIST);

exports.handler = async (event, context) => {
  logger.debug('Cloudwatch Alarm Event:', event, context);
  try {
    // parse through the records
    for(const record of event.Records) {
      logger.debug("record.body.Subject:", record.body);
      const body = JSON.parse(record.body);
      logger.debug("body:", body);
      const message = JSON.parse(body.Message);

      const payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "0076D7",
        "summary": "Cloudwatch Alarm",
        "sections": [{
          "activityTitle": "Cloudwatch Alarm",
          "activitySubtitle": `On ${AWS_ACCOUNT_LIST[message.AWSAccountId]}`,
          "activityImage": "https://adaptivecards.io/content/cats/3.png",
          "facts": [{
            "name": "Alarm Description",
            "value": `${message.AlarmDescription}`
          }, {
            "name": "AWS Account ID",
            "value": `${message.AWSAccountId}`
          }, {
            "name": "Date (America/Vancouver Time)",
            "value": `${DateTime.fromISO(message.StateChangeTime).setZone(TIMEZONE).toISO() }`
          }, {
            "name": "Date (UTC Time)",
            "value": `${message.StateChangeTime}`
          }, {
            "name": "ARN",
            "value": `${message.AlarmArn}`
          }],
          "markdown": true
        }]
      }

      try {
        await axios({
          method: 'post',
          url: WEBHOOK_URL,
          headers: {
            'Content-Type': 'application/json'
          },
          data: payload
        });
      } catch (e) {
        logger.error("Error, couldn't send notification.", e);
      }
    }
  } catch (e) {
    logger.error("Error parsing cloudwatch alarm data!", e);
  }

    return {};
};
