const AWS = require('aws-sdk');
const jose = require('node-jose');
const svgCaptcha = require('svg-captcha');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'defaultSecret';
const JWT_SIGN_EXPIRY = process.env.JWT_SIGN_EXPIRY || '5'; // In minutes
const CAPTCHA_SIGN_EXPIRY = (process.env.CAPTCHA_SIGN_EXPIRY && +process.env.CAPTCHA_SIGN_EXPIRY) || 30; // In minutes
const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? JSON.parse(process.env.PRIVATE_KEY)
  : {
      kty: 'oct',
      kid: 'gBdaS-G8RLax2qObTD94w',
      use: 'enc',
      alg: 'A256GCM',
      k: 'FK3d8WvSRdxlUHs4Fs_xxYO3-6dCiUarBwiYNFw5hv8'
    };

const AWS_REGION = process.env.AWS_DEFAULT_REGION || 'ca-central-1';

async function getCaptcha(options) {
  const captcha = svgCaptcha.create({
    ...{
      size: 6, // size of random string
      ignoreChars: '0o1il', // filter out some characters like 0o1i
      noise: 2 // number of lines to insert for noise,
    },
    ...options
  });

  if (!captcha || (captcha && !captcha.data)) {
    // Something bad happened with Captcha.
    return {
      valid: false
    };
  }

  // add answer, and expiry to body
  const body = {
    answer: captcha.text,
    expiry: Date.now() + CAPTCHA_SIGN_EXPIRY * 60000
  };
  try {
    const validation = await encrypt(body);
    if (validation === '') {
      return {
        valid: false
      };
    } else {
      // create basic response
      const responseBody = {
        captcha: captcha.data,
        validation: validation
      };
      return responseBody;
    }
  } catch (err) {
    console.error(err);
    return {
      valid: false
    };
  }
}

/**
 * This function requires valid AWS credentials to be present in env when
 * running locally
 */
async function getCaptchaAudio(payload) {
  try {
    const Polly = new AWS.Polly({
      region: AWS_REGION
    });

    const validation = payload.validation;
    const decryptedBody = await decrypt(validation, PRIVATE_KEY);

    const captchaText = decryptedBody.answer.toString().split('').join(', ');

    const params = {
      Text: `Please type in following letters or numbers: ${captchaText}`,
      OutputFormat: 'mp3',
      VoiceId: 'Salli'
    };

    const audioData = await Polly.synthesizeSpeech(params).promise();

    return {
      audio: `data:audio/mp3;base64,${audioData.AudioStream.toString('base64')}`
    };
  } catch (err) {
    console.error(err);
    throw err;
  }
}

async function verifyCaptcha(payload) {
  const validation = payload.validation;
  const answer = payload.answer;

  const token = jwt.sign(
    {
      data: 'verified'
    },
    SECRET,
    {
      expiresIn: JWT_SIGN_EXPIRY + 'm'
    }
  );

  // Normal mode, decrypt token
  const body = await decrypt(validation, PRIVATE_KEY);
  if (body?.answer.toLowerCase() === answer.toLowerCase() && body?.expiry > Date.now()) {
    return {
      valid: true,
      jwt: token
    };
  } else {
    // Bad decyption
    return {
      valid: false
    };
  }
}


function verifyJWT(token) {
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.data) {
      return {
        valid: true
      };
    } else {
      return {
        valid: false
      };
    }
  } catch (e) {
    console.error(e);
    return {
      valid: false
    };
  }
}

async function encrypt(body) {
  const buff = Buffer.from(JSON.stringify(body));
  try {
    const cr = await jose.JWE.createEncrypt(PRIVATE_KEY).update(buff).final();
    return cr;
  } catch (e) {
    console.error(e);
    throw e;
  }
}

async function decrypt(body, private_key) {
  try {
    const res = await jose.JWK.asKey(private_key, 'json');
    const decrypted = await jose.JWE.createDecrypt(res).decrypt(body);
    const decryptedObject = JSON.parse(decrypted.plaintext.toString('utf8'));
    return decryptedObject;
  } catch (e) {
    console.error(e);
    throw e;
  }
}

module.exports = {
  getCaptcha,
  verifyCaptcha,
  verifyJWT,
  getCaptchaAudio,
  encrypt
};
