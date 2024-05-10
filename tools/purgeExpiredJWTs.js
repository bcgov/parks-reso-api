const dynamoUtil = require('../lambda/dynamoUtil');
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'defaultSecret';
const ALGORITHM = process.env.ALGORITHM || 'HS384';

/**
 * Purges expired JWTs from the system.
 * @returns {Promise<void>} A promise that resolves when the purge process is complete.
 */
async function purgeExpiredJWTs() {
  const items = await dynamoUtil.getAllStoredJWTs();
  console.log(`Going through ${items.length} items.`);
  console.log(items)
  for (const item of items) {
    console.log(`Processing item`);
    console.log(item);
    try {
      jwt.verify(item.sk, SECRET, { algorithm: ALGORITHM });
      // Your code here to handle the decoded item
    } catch (error) {
      console.error('Error verifying JWT:', error);
      // Something bad happened with this JWT, remove it from our system.
      try {
        await dynamoUtil.deleteJWT(item.pk, item.sk);
      } catch (error) {
        console.error('Error deleting JWT:', error);
      }
    }
  }
}

purgeExpiredJWTs();