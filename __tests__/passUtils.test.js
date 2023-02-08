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
    process.env.PASS_MANAGEMENT_ROUTE="/pass-management";
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