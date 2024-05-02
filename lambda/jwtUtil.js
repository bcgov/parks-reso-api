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

async function encrypt(body) {
  const buff = Buffer.from(JSON.stringify(body));
  const cr = await jose.JWE.createEncrypt(PRIVATE_KEY).update(buff).final();
  return cr;
}

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
