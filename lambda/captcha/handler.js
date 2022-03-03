const { getCaptcha, verifyCaptcha, getCaptchaAudio } = require('../captchaUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');

async function generateCaptcha(event, context) {
  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  const captcha = await getCaptcha({ fontSize: 76, width: 190, height: 70 });

  if (captcha?.valid === false) {
    return sendResponse(400, { msg: 'Failed to generate captcha' }, context);
  }

  return sendResponse(200, captcha);
}

async function verifyAnswer(event, context) {
  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  const postBody = JSON.parse(event.body);
  const result = await verifyCaptcha(postBody);

  if (result?.valid !== true) {
    return sendResponse(400, { msg: 'Failed to verify captcha' }, context);
  }

  return sendResponse(200, result);
}

async function generateAudio(event, context) {
  const postBody = JSON.parse(event.body);

  const res = await getCaptchaAudio(postBody);

  return sendResponse(200, res);
}

module.exports = {
  generateCaptcha,
  verifyAnswer,
  generateAudio
};
