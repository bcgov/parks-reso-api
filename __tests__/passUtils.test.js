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
    process.env.PASS_MANAGEMENT_ROUTE = "/pass-management";
    const QRFileString = 'data:image/png;base64,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';
    const expected = {
      hasQRCode: true,
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
    const expected = { hasQRCode: false };
    const qrObject = await getPersonalizationAttachment('0015', 'P1 and Lower P5', 'id2');
    expect(qrObject).toEqual(expected);
  });

  test('Ensure QR Code is not part of the payload', async () => {
    process.env.QR_CODE_ENABLED = 'true';
    const expected = { hasQRCode: false };
    const qrObject = await getPersonalizationAttachment('0015', 'P1 and something else', 'id2');
    expect(qrObject).toEqual(expected);
  });

  test('Ensure QR Code is not part of the payload', async () => {
    process.env.QR_CODE_ENABLED = 'true';
    const expected = { hasQRCode: false };
    const qrObject = await getPersonalizationAttachment('0014', 'P1 and Lower P5', 'id2');
    expect(qrObject).toEqual(expected);
  });
});