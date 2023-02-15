const { getPersonalizationAttachment } = require('../lambda/passUtils');

describe('Pass Utility Tests', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV }; // Make a copy of environment
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  test('Ensure QR Code generates correctly and creates the GCN object', async () => {
    process.env.QR_CODE_ENABLED = 'true';
    process.env.ADMIN_FRONTEND = "http://localhost:4300";
    const QRFileString = 'data:image/png;base64,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';
    const expected = {
      application_file: {
        file: QRFileString.split('base64,')[1],
        filename: 'QRCode.png',
        sending_method: 'attach'
      }
    };
    const qrObject = await getPersonalizationAttachment('0015', 'P1 and Lower P5', 'id2');
    expect(qrObject).toEqual(expected);
  });

  test('Ensure QR Code is not part of the payload', async () => {
    process.env.QR_CODE_ENABLED = undefined;
    const expected = undefined;
    const qrObject = await getPersonalizationAttachment('0015', 'P1 and Lower P5', 'id2');
    expect(qrObject).toEqual(expected);
  });

  test('Ensure QR Code is not part of the payload', async () => {
    process.env.QR_CODE_ENABLED = 'true';
    const expected = undefined;
    const qrObject = await getPersonalizationAttachment('0015', 'P1 and something else', 'id2');
    expect(qrObject).toEqual(expected);
  });

  test('Ensure QR Code is not part of the payload', async () => {
    process.env.QR_CODE_ENABLED = 'true';
    const expected = undefined;
    const qrObject = await getPersonalizationAttachment('0014', 'P1 and Lower P5', 'id2');
    expect(qrObject).toEqual(expected);
  });
});