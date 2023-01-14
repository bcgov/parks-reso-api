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
    const expected = {
      application_file: {
        file: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJQAAACUCAYAAAB1PADUAAAAAklEQVR4AewaftIAAAS+SURBVO3BQY4kRxIEQdNA/f/Lun2jnwJIpFdzOGsi+CNVS06qFp1ULTqpWnRSteikatFJ1aKTqkUnVYtOqhadVC06qVp0UrXopGrRSdWik6pFn7wE5Dep+U1AJjVvALlRMwH5TWreOKladFK16KRq0SfL1GwC8gSQGzUTkEnNpGYCMqm5ATKpmYA8oWYTkE0nVYtOqhadVC365MuAPKHmCSA3aiYgTwDZBGQTkCfUfNNJ1aKTqkUnVYs++csBuVEzAZnUTEAmIDdqJiCTmr/JSdWik6pFJ1WLPvnLqHlDzQRkUvMEkP8nJ1WLTqoWnVQt+uTL1PxJgExqngAyqXlCzSY1f5KTqkUnVYtOqhZ9sgzInwTIpGYCMqm5UTMBmdQ8AWRScwPkT3ZSteikatFJ1SL8kf8wIE+oeQLIjZr6x0nVopOqRSdVi/BHXgAyqZmAbFJzA2RSMwF5Qs0E5Ak1N0AmNROQTWq+6aRq0UnVopOqRfgji4BMaiYgk5o3gExqngByo2YTkEnNBOQNNU8AmdS8cVK16KRq0UnVok9+mZongExqJjU3QCY1k5oJyARkk5o31ExA3lCz6aRq0UnVopOqRZ/8y4DcqJmAPKFmAnKjZgIyqZmATGo2qZmATGqeADKp2XRSteikatFJ1SL8kReA3KiZgGxScwNkUjMBeULNDZBJzQ2QSc0bQG7UfNNJ1aKTqkUnVYs++TIgN2o2AZnU3KiZgExqnlBzA2RSMwF5Q80E5AbIpOaNk6pFJ1WLTqoWfbJMzQRkUjMBeULNBOQGyI2aSc0NkEnNBORGzQRkUjMB+SY1m06qFp1ULTqpWoQ/8h8C5Ak1bwC5UfMEkEnNDZBJzQRkUnMDZFKz6aRq0UnVopOqRfgjvwjIJjUTkBs1E5DfpGYCMqnZBGRS800nVYtOqhadVC365CUgm9TcAHlCzQTkRs0TQJ4AMqm5AfJNQCY1b5xULTqpWnRSteiTZWpugDwBZFIzAZnU3Kh5AsgTat4AMqmZgExqJiBPqNl0UrXopGrRSdWiT74MyKRmAjIBmdQ8AWRS84aaCcgmIJOaCcikZgIyqbkBMqnZdFK16KRq0UnVok/+MGomIDdqJiATkEnNDZBJzRNAJjVPALkB8gSQGyCTmjdOqhadVC06qVqEP/IfBmRSMwG5UXMDZFIzAdmk5gkgm9S8cVK16KRq0UnVok9eAvKb1ExqbtRMQCYgN2omIDdqboA8AWRS84aabzqpWnRSteikatEny9RsAnIDZFIzAXlCzY2aJ4BMaiYgN2reUDMBuVHzxknVopOqRSdViz75MiBPqNmkZgLyTUAmNU8AeUPNBOQ3nVQtOqladFK16JO/DJAn1ExAJjU3QG6ATGpu1LwB5N90UrXopGrRSdWiT/5yajYBeULNG0CeUHMDZFKz6aRq0UnVopOqRZ98mZpvUvMEkEnNpOZGzQRkUnMD5Ak1E5BJzQRkUvObTqoWnVQtOqla9MkyIL8JyBNqboDcqJnUTEAmNZOaGyCTmifUTEAmNd90UrXopGrRSdUi/JGqJSdVi06qFp1ULTqpWnRSteikatFJ1aKTqkUnVYtOqhadVC06qVp0UrXopGrRSdWi/wFExC8uVj3+swAAAABJRU5ErkJggg==',
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