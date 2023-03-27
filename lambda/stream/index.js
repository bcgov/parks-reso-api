const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.debug('Stream Handler', event);
  switch (event?.eventName) {
    case 'INSERT': {
      // await handleInsert(event?.Records);
    } break;
    case 'MODIFY': {
      // await handleModify(event?.Records);
    } break;
    case 'REMOVE': {
      // await handleRemove(event?.Records);
    } break;
  }

  return event;
};

const handleInsert = async function (records) {
  for (const record of records) {
    // {
    //   ApproximateCreationDateTime: 1679697545,
    //   Keys: { sk: { S: 'config' }, pk: { S: 'config' } },
    //   NewImage: { sk: { S: 'config' }, otherProps: { S: 'willShowUp' }, pk: { S: 'config' } },
    //   SequenceNumber: '500000000003949070933',
    //   SizeBytes: 39,
    //   StreamViewType: 'NEW_IMAGE'
    // }
  }
  return;
};

const handleModify = async function (records) {
  // TODO: Implement
  return;
};

const handleRemove = async function (records) {
  // TODO: Implement
  return;
};