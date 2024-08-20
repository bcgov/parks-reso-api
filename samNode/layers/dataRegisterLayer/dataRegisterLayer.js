const axios = require('axios');
const { logger } = require('/opt/baseLayer');

const DATA_REGISTER_URL = process.env.DATA_REGISTER_URL || '';
const DATA_REGISTER_NAME_API_KEY = process.env.DATA_REGISTER_NAME_API_KEY || '';
const ESTABLISHED_STATE = 'established';

async function getCurrentNameData(identifier) {
  const url = DATA_REGISTER_URL + `/parks/${identifier}/name?status=${ESTABLISHED_STATE}`;
  try {
    const data = await axios({
      method: 'get',
      url: url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'None',
        'x-api-key': DATA_REGISTER_NAME_API_KEY
      }
    })
    return data;
  } catch (err) {
    logger.error(`Failed to get established name data for ${identifier}.`, err);
    throw err;
  }
}

async function getCurrentDisplayNameById(identifier) {
  // cast identifier as number
  try {
    let data = await getCurrentNameData(Number(identifier));
    let item = data?.data?.data?.items[0];
    return item?.displayName || null;
  } catch (err) {
    logger.error('Failed to get established display name by id.', err);
    throw err;
  }
}

module.exports = {
  getCurrentNameData,
  getCurrentDisplayNameById
}
