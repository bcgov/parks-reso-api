const AWS = require('aws-sdk');
const jose = require('node-jose');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'defaultSecret';
const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? JSON.parse(process.env.PRIVATE_KEY)
  : {
    kty: 'oct',
    kid: 'gBdaS-G8RLax2qObTD94w',
    use: 'enc',
    alg: 'A256GCM',
    k: 'FK3d8WvSRdxlUHs4Fs_xxYO3-6dCiUarBwiYNFw5hv8'
  };
const { logger } = require('./logger');

const ALGORITHM = process.env.ALGORITHM || 'HS384';

/**
 * Verifies the authenticity of a JSON Web Token (JWT).
 *
 * @param {string} token - The JWT to be verified.
 * @returns {Object} - An object containing the verification result and decoded token data.
 *                    If the token is valid, the object will have the following properties:
 *                    - valid: true
 *                    - registrationNumber: The registration number associated with the token.
 *                    - facility: The facility associated with the token.
 *                    - orcs: The ORCS associated with the token.
 *                    - bookingDate: The booking date associated with the token.
 *                    - passType: The pass type associated with the token.
 *                    If the token is invalid, the object will have the following property:
 *                    - valid: false
 */
function verifyJWT(token) {
  try {
    const decoded = jwt.verify(token, SECRET, { algorithm: ALGORITHM });
    logger.info('JWT decoded.');
    return {
      valid: true,
      registrationNumber: decoded.registrationNumber,
      facility: decoded.facility,
      orcs: decoded.orcs,
      bookingDate: decoded.bookingDate,
      passType: decoded.passType
    };
  } catch (e) {
    logger.error(e);
    return {
      valid: false
    };
  }
}

/**
 * Encrypts the given body using JSON Web Encryption (JWE).
 *
 * @param {Object} body - The body to be encrypted.
 * @returns {Promise<string>} - A promise that resolves to the encrypted data.
 */
async function encrypt(body) {
  const buff = Buffer.from(JSON.stringify(body));
  const cr = await jose.JWE.createEncrypt(PRIVATE_KEY).update(buff).final();
  return cr;
}

/**
 * Decrypts the given encrypted body using the provided private key.
 * @param {string} body - The encrypted body to decrypt.
 * @param {string} private_key - The private key used for decryption.
 * @returns {Promise<Object>} - A promise that resolves to the decrypted object.
 * @throws {Error} - If an error occurs during decryption.
 */
async function decrypt(body, private_key) {
  try {
    const res = await jose.JWK.asKey(private_key, 'json');
    const decrypted = await jose.JWE.createDecrypt(res).decrypt(body);
    const decryptedObject = JSON.parse(decrypted.plaintext.toString('utf8'));
    return decryptedObject;
  } catch (e) {
    logger.error(e);
    throw e;
  }
}

function generateRegistrationNumber(count) {
  // TODO: Make this better
  return Math.random().toString().substr(count);
}

module.exports = {
  verifyJWT,
  encrypt,
  generateRegistrationNumber
};
