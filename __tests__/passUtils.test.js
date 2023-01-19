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