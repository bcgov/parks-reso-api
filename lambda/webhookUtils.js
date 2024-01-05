const axios = require('axios');
const { logger } = require('./logger');

/**
 * Makes a post to a webhook url.
 * @param {*} url Webhook URL
 * @param {*} title Title of message
 * @param {*} text Text content
 * @param {*} fields Fields to put into facts
 * @returns Axios response.
 */
async function webhookPost(url, title, text, fields) {
  let payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "0076D7",
    "summary": title,
    "sections": [{
      "activityTitle": title,
      "activityImage": "https://adaptivecards.io/content/cats/3.png",
      "facts": [{
        "name": "Description",
        "value": `${text}`
      }],
      "markdown": true
    }]
  };
  // Add the fields
  for (const field of fields) {
    payload.sections[0].facts.push({
      "name": field.title,
      "value": field.value
    });
  };

  try {
    const res = await axios({
      method: 'post',
      url: url,
      headers: {
        'Content-Type': 'application/json'
      },
      data: payload,
    });
    return res;
  } catch (err) {
    logger.error('Error posting alert:', err);
    return err;
  }
}

module.exports = {
  webhookPost
}