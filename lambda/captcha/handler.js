const { getCaptcha, verifyCaptcha, getCaptchaAudio } = require('../captchaUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { logger } = require('../logger');

async function generateCaptcha(event, context) {
  if (checkWarmup(event)) {
    logger.info('checkWarmup');
    return sendResponse(200, {});
  }
  const postBody = JSON.parse(event.body);
  if (!postBody.facility || !postBody.orcs) {
    return sendResponse(400, { msg: 'Failed to generate captcha' }, context);
  }
  const captcha= await getCaptcha({ fontSize: 76, width: 190, height: 70 },
                                  postBody.facility,
                                  postBody.orcs,
                                  postBody.bookingDate,
                                  postBody.passType);

  if (captcha?.valid === false) {
    logger.info('Failed to generate captcha');
    logger.debug(captcha);
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
    logger.info('Failed to verify captcha');
    logger.debug(result);
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
