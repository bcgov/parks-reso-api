const AWSMock = require('aws-sdk-mock');

const captchaHandler = require('../lambda/captcha/handler');
const { encrypt } = require('../lambda/captchaUtil');

let encrypted;
describe('checkActivationHandler', () => {
  beforeAll(async () => {
    const body = {
      answer: '123abc',
      expiry: Date.now() + 1 * 60000
    };

    encrypted = await encrypt(body);
  });

  test('generateCaptcha - 200', async () => {
    const res = await captchaHandler.generateCaptcha();

    expect(res.statusCode).toEqual(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('verifyAnswer - 200 - Correct answer provided', async () => {
    const postBody = {
      body: JSON.stringify({
        validation: encrypted,
        answer: '123abc'
      })
    };

    const res = await captchaHandler.verifyAnswer(postBody);

    expect(res.statusCode).toEqual(200);
    expect(JSON.parse(res.body).valid).toEqual(true);
  });

  test('verifyAnswer - 400 - Incorrect answer provided', async () => {
    const postBody = {
      body: JSON.stringify({
        validation: encrypted,
        answer: 'abc123'
      })
    };

    const res = await captchaHandler.verifyAnswer(postBody);

    expect(res.statusCode).toEqual(400);
    expect(JSON.parse(res.body).msg).toEqual('Failed to verify captcha');
  });

  test('generateAudio - 200', async () => {
    AWSMock.mock(
      'Polly',
      'synthesizeSpeech',
      jest.fn().mockReturnValue(Promise.resolve({ AudioStream: Buffer.from('123abc') }))
    );

    const res = await captchaHandler.generateAudio({ body: JSON.stringify({ validation: encrypted }) });

    expect(res.statusCode).toEqual(200);
    expect(JSON.parse(res.body).audio).toEqual('data:audio/mp3;base64,MTIzYWJj');
  });
});