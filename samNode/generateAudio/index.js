const { sendResponse } = require('/opt/baseLayer');
const { getCaptchaAudio } = require('/opt/captchaLauer')

exports.handler = async (event, context) => {
    try {
        const postBody = JSON.parse(event.body);
        const res = await getCaptchaAudio(postBody);
        return sendResponse(200, res);
    } catch (error) {
        console.error('Error generating audio:', error);
        return sendResponse(500, { message: 'Internal Server Error' });
    }
};