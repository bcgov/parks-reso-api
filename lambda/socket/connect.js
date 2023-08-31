const { logger } = require('../logger');
const { getOne, TABLE_NAME, dynamodb } = require('../dynamoUtil');
const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
  logger.debug('Websocket connect event', event);

  console.log("Getting one");

  // TODO: Write this into the database
  // TODO: Remove from database on disconnect
  // TODO: Get stream stuff working in serverless offline.
  const data = await getOne('ws', 'ws');
  console.log("got one");
  console.log("CONN1:", data.connectionId.S);
  console.log("CONN2:", event.requestContext.connectionId);
  const connectionId = data.connectionId.S;

  if (connectionId === event.requestContext.connectionId || connectionId === 'bd8aaeb3-b3c4-4d80-a424-141ba431fe7b') {
    console.log("Skipping same connection.");
    return {
      statusCode: 200,
      body: JSON.stringify({ yay: true }),
    }
  }

  const payload = {
    message: 'Connected yeah buddy',
    connectionId: connectionId
  };
  console.log(connectionId);
  console.log(payload);
  setTimeout(() => {
    const apigatewaymanagementapi = new AWS.ApiGatewayManagementApi({
      apiVersion: '2018-11-29',
      endpoint: 'http://localhost:3001',
    });
    apigatewaymanagementapi.postToConnection(
      {
        ConnectionId: connectionId, // connectionId of the receiving ws-client
        Data: JSON.stringify(payload),
      },
      (err, data) => {
        if (err) {
          console.log('err is', err);
        } else {
          console.log('data is', data);
        }
      }
    );
  }, 2000);
  console.log('done');

  return {
    statusCode: 200,
    body: JSON.stringify({yay: true}),
  }
};