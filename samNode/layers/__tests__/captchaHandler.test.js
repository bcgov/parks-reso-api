const AWSMock = require('aws-sdk-mock');
const { REGION, ENDPOINT, TABLE_NAME } = require('./global/settings');

const captchaHandler = require('../lambda/captcha/handler');
const { encrypt } = require('../lambda/captchaUtil');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const jwt = require('jsonwebtoken');
const ALGORITHM = process.env.ALGORITHM || 'HS384';
const SECRET = process.env.JWT_SECRET || 'defaultSecret';

const docClient = new DocumentClient({
  region: REGION,
  endpoint: ENDPOINT,
  convertEmptyValues: true
});

let encrypted;
describe('checkActivationHandler', () => {
  beforeAll(async () => {
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          "pk": "park",
          "sk": "1111",
          "bcParksLink": "https://bcparks.ca/explore/parkpgs/garibaldi/",
          "description": "<p><span data-contrast=\"auto\">Day-use passes are required before entering Garibaldi Park at Diamond Head, Rubble Creek, and Cheakamus.&nbsp;</span><span data-ccp-props=\"{&quot;201341983&quot;:0,&quot;335559739&quot;:160,&quot;335559740&quot;:259}\">&nbsp;</span></p>\n<p><span data-contrast=\"auto\">Familiarizing yourself with the park through this <a href=\"https://www.youtube.com/watch?v=JZc5qt5il-c\">in-depth trail walk-through</a> will help you better prepare for your trip</span><span data-contrast=\"auto\">. </span><span data-ccp-props=\"{&quot;201341983&quot;:0,&quot;335559739&quot;:160,&quot;335559740&quot;:259}\">&nbsp;</span></p>\n<p><span data-contrast=\"auto\">Detailed program information and history can be found on the <a href=\"https://bcparks.ca/reserve/day-use/\">Day-Use Pass information page</a>. </span><span data-ccp-props=\"{&quot;201341983&quot;:0,&quot;335559739&quot;:160,&quot;335559740&quot;:259}\">&nbsp;</span></p>",
          "mapLink": null,
          "name": "Some Test Park",
          "orcs": "1111",
          "roles": [
            "sysadmin",
            "0007"
          ],
          "status": "open",
          "visible": true,
          "winterWarning": false
        }
      }).promise();

    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: {
          pk: 'facility::1111',
          sk: 'Test Trail',
          name: 'Test Trail',
          description: '',
          bcParksLink: '',
          status: {
            state: 'open'
          },
          visible: true,
          qrcode: true,
          type: 'parking',
          reservations: {},
          bookingOpeningHour: null,
          bookingDaysAhead: null,
          bookingTimes: {
            AM: {
              max: 25
            },
            DAY: {
              max: 25
            }
          },
          bookingDays: {
            Sunday: true,
            Monday: true,
            Tuesday: true,
            Wednesday: true,
            Thursday: true,
            Friday: true,
            Saturday: true
          },
        }
      })
      .promise();

    const body = {
      answer: '123abc',
      expiry: Date.now() + 1 * 60000,
      facility: 'Test Trail',
      orcs: '1111',
      bookingDate: '1970-01-01',
      passType: 'DAY',
      jwt: jwt.sign({ facility: 'Test Trail',
                      orcs: '1111',
                      bookingDate: '1970-01-01',
                      passType: 'DAY'
                    },
                    SECRET,
                    { algorithm: ALGORITHM })
    };

    encrypted = await encrypt(body);
  });

  afterAll(async () => {
    await docClient
      .delete({
        TableName: TABLE_NAME,
        Key: {
          pk: 'facility::1111',
          sk: 'Test Trail'
        }
      })
      .promise();
  })

  test('generateCaptcha - 200', async () => {
    const event = {
      body: JSON.stringify({
        facility: 'Test Trail',
        orcs: '1111',
        bookingDate: new Date() + 1 * 60000,
        passType: 'DAY'
      })
    };
    const res = await captchaHandler.generateCaptcha(event);

    expect(res.statusCode).toEqual(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('generateCaptcha - 400 Missing fields', async () => {
    const event = {
      body: JSON.stringify({
        facility: 'Test Trail',
        orcs: undefined,
        bookingDate: '1970-01-01',
        passType: 'DAY'
      })
    };
    const res = await captchaHandler.generateCaptcha(event);

    expect(res.statusCode).toEqual(400);
    expect(JSON.parse(res.body).msg).toEqual('Failed to generate captcha');
  });

  test('verifyAnswer - 200 - Correct answer provided', async () => {
    const postBody = {
      body: JSON.stringify({
        validation: encrypted,
        answer: '123abc'
      })
    };

    console.log("X:", postBody)
    const res = await captchaHandler.verifyAnswer(postBody);

    expect(res.statusCode).toEqual(200);
    expect(JSON.parse(res.body).valid).toEqual(true);
  });

  test('verifyAnswer - 400 - Missing fields in validation', async () => {
    const body = {
      answer: '123abc',
      expiry: Date.now() + 1 * 60000,
      facility: 'Test Trail',
      orcs: undefined
    };

    encrypted = await encrypt(body);
    const postBody = {
      body: JSON.stringify({
        validation: encrypted,
        answer: '123abc'
      })
    };

    const res = await captchaHandler.verifyAnswer(postBody);

    expect(res.statusCode).toEqual(400);
    console.log(res);
    expect(JSON.parse(res.body).msg).toEqual('Failed to verify captcha');
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

    const event = {
      body: JSON.stringify({ validation: encrypted })
    };

    const res = await captchaHandler.generateAudio(event);

    expect(res.statusCode).toEqual(200);
    expect(JSON.parse(res.body).audio).toEqual('data:audio/mp3;base64,MTIzYWJj');
  });
});
