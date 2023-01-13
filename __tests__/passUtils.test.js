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
        file: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJQAAACUCAYAAAB1PADUAAAAAklEQVR4AewaftIAAATTSURBVO3BQY4kRxIEQdNA/f/Lun1bPwWQSK/mcGgi+CNVS06qFp1ULTqpWnRSteikatFJ1aKTqkUnVYtOqhadVC06qVp0UrXopGrRSdWik6pFn7wE5DepeQLIpOYGyKRmE5AbNROQ36TmjZOqRSdVi06qFn2yTM0mIE8AmdS8AeRGzQ2QSc0E5Ak1m4BsOqladFK16KRq0SdfBuQJNU8AmdRMQJ5QMwG5ATKpuQGyCcgTar7ppGrRSdWik6pFn/xlgExqngDyhJoJyKRmAjKp+ZucVC06qVp0UrXok7+Mmhsgk5obNTdAJjUTkP+Sk6pFJ1WLTqoWffJlan4TkDfU3AB5Q80mNX+Sk6pFJ1WLTqoWfbIMyD9JzQRkUjMBmdRMQCY1E5A3gExqboD8yU6qFp1ULTqpWoQ/8i8G5EbNBGRScwPkRk3930nVopOqRSdViz55CcikZgKySc2kZgIyAXkCyI2aGyCTmhsgk5oJyCY133RSteikatFJ1aJPXlIzAXlCzQRkUrNJzQRkUvMEkEnNDZBJzQTkDTVPAJnUvHFSteikatFJ1aJP/nBAnlBzA+QJIE8AuVHzhpoJyBtqNp1ULTqpWnRSteiTl4DcqJmATEBu1NwAeULNBORGzQ2QSc0mNROQSc0TQCY1m06qFp1ULTqpWoQ/8kVANqm5ATKpmYA8oeYJIJOaGyCTmjeA3Kj5ppOqRSdVi06qFn3yZWpugNyo+U1qJiCTmhs1N0AmNROQN9RMQG6ATGreOKladFK16KRq0SfLgExq3gDyhJobNTdAJjUTkEnNBORGzQRkUjMB+SY1m06qFp1ULTqpWvTJMjU3QG7UvAHkCTWTmjfU3ACZ1DyhZgJyo2YCMqnZdFK16KRq0UnVIvyRF4BMat4AcqPmBsikZhOQN9RMQCY1m4BMar7ppGrRSdWik6pFn3wZkCfU3ACZ1ExqJiCTmgnIjZpJzQTkCSCTmhsg3wRkUvPGSdWik6pFJ1WLPvkyNROQJ4BMaiYgk5pJzY2aCcgE5Ak1bwCZ1ExAJjUTkCfUbDqpWnRSteikatEnXwZkUnMDZFLzBpAbNTdqJiCbgExqJiCTmgnIpOYGyKRm00nVopOqRSdVi/BHXgAyqbkBcqNmAjKpmYA8oeYJIG+ouQGySc0E5Ak1b5xULTqpWnRStQh/5F8MyI2aGyCTmieAbFLzBJBNat44qVp0UrXopGrRJy8B+U1qJjVvqHkCyI2aGyBPAJnUvKHmm06qFp1ULTqpWvTJMjWbgNwAmdRMQG7U3ACZ1DwBZFIzAblR84aaCcikZtNJ1aKTqkUnVYs++TIgT6jZpGYCMgGZ1ExqngAyqXkCyBtqJiA3QCY1b5xULTqpWnRSteiT/zg1N0AmNROQGyCTmhs1bwD5J51ULTqpWnRSteiTvwyQSc2kZgIyqZnUTECeUPMGkCfU3ACZ1Gw6qVp0UrXopGrRJ1+m5pvUPAHkDTUTkEnNDZAn1ExAJjUTkEnNbzqpWnRSteikatEny4D8JiBPqJmATEBu1ExqJiCTmknNDZBJzRNqJiCTmm86qVp0UrXopGoR/kjVkpOqRSdVi06qFp1ULTqpWnRSteikatFJ1aKTqkUnVYtOqhadVC06qVp0UrXopGrR/wCCpUIqlN6vwgAAAABJRU5ErkJggg==',
        filename: 'QRCode.png',
        sending_method: 'attach'
      }
    };
    const qrObject = await getPersonalizationAttachment('id', 'id2');
    expect(qrObject).toEqual(expected);
  });

  test('Ensure QR Code is not part of the payload', async () => {
    process.env.QR_CODE_ENABLED = undefined;
    const expected = undefined;
    const qrObject = await getPersonalizationAttachment('id', 'id2');
    expect(qrObject).toEqual(expected);
  });
});