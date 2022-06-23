const axios = require('axios');
const { DateTime } = require('luxon');
const { TIMEZONE } = require('../dynamoUtil');
const ROCKETCHAT_URL = process.env.ROCKETCHAT_URL;
const ROCKETCHAT_BEARER_TOKEN = process.env.ROCKETCHAT_BEARER_TOKEN;
const AWS_ACCOUNT_LIST = JSON.parse(process.env.AWS_ACCOUNT_LIST);
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.debug('Cloudwatch Alarm Event:', event, context);
  try {
    // parse through the records
    for(const record of event.Records) {
      // Event this to Rocket.cat
      logger.debug("record.body.Subject:", record.body);
      const body = JSON.parse(record.body);
      logger.debug("body:", body);
      const message = JSON.parse(body.Message);

      // Build the message fields.
      let fields = [];
      fields.push({
        "title": "Alarm Description",
        "value": message.AlarmDescription,
        "short": true
      });
      fields.push({
        "title": "AWS Account ID",
        "value": message.AWSAccountId,
        "short": true
      });
      fields.push({
        "title": "Date (America/Vancouver Time)",
        "value": DateTime.fromISO(message.StateChangeTime).setZone(TIMEZONE).toISO(),
        "short": true
      });
      fields.push({
        "title": "Date (UTC Time)",
        "value": message.StateChangeTime,
        "short": true
      });
      fields.push({
        "title": "ARN",
        "value": message.AlarmArn,
        "short": true
      });

      try {
        await axios({
          method: 'post',
          url: ROCKETCHAT_URL,
          headers: {
            Authorization: ROCKETCHAT_BEARER_TOKEN,
            'Content-Type': 'application/json'
          },
          data: {
            "emoji": ":interrobang:",
            "text": record.body.Subject,
            "attachments": [
              {
                "title": `${AWS_ACCOUNT_LIST[message.AWSAccountId]} Errors`,
                "fields": fields,
                "color": "#eb1414"
              }
            ]
          }
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
