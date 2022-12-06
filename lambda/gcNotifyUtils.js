const axios = require('axios');
const { logger } = require('./logger');

/**
 * An Axios 'post' call to GC Notify used to deliver single or bulk emails.
 * @param {*} url The url of the GC Notify Api endpoint (different for single/bulk operations).
 * @param {*} apiKey The API key of the GC Notify service.
 * @param {*} data Object containing the request JSON payload.
 * @returns Object containing `statusCode`, `data`, and `errors` of Axios response.
 */
// Sample bulk data param:
// data = {
//  name: name of the job
//  template_id: GCN email template
//  rows: bulk rows to send   
// }
async function gcnSend(url, apiKey, data) {
  let response;
  try {
    logger.info("Posting to GC Notify");
    const res = await axios({
      method: 'post',
      url: url,
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json'
      },
      data: data
    });
    response = {
      statusCode: res?.status || 200,
      data: res,
      errors: null
    }
    logger.info("Posted.");
  } catch (err) {
    logger.debug(err);
    response = {
      statusCode: err?.response?.status || 400,
      data: err,
      errors: err?.response?.data?.errors || 'An unknown error occurred.'
    }
  }
  return response;
}

module.exports = {
  gcnSend
}
