const AWS = require('aws-sdk');
const { sendResponse } = require('/opt/baseLayer');

let connections = new Set();
const domainName = 'localhost';

exports.handler = async (event, context) => {
  console.log("Event Type:", event.requestContext.eventType);
  console.log("Id:", event.requestContext.connectionId);

  console.log(connections);

  switch(event.requestContext.eventType) {
    case 'CONNECT': {
      return await onConnect(event);
    }
    case 'MESSAGE': {
      return await onMessage(event);
    }
    case 'DISCONNECT': {
      return await onDisconnect(event);
    }
    default: {
      return sendResponse(400, JSON.stringify(connectionData));
    }
  }
};

async function onConnect(event) {
  console.log(`Received socket connectionId: ${event.requestContext && event.requestContext.connectionId}`);
  connections.add(event.requestContext.connectionId);

  // Stuff this into the DB

  return sendResponse(200, {});
}

async function onMessage(event) {
  console.log(`Received socket message from: ${event.requestContext.connectionId}`);

  const body = JSON.parse(event.body);
  console.log(body);

  // Find the conection ID in memory pool
  const result = connections.has(event.requestContext.connectionId);

  // Send a message to everyone!
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    endpoint: 'http://' + domainName + ':3001/'
  });
  console.log("SENDING")
  console.log({endpoint: 'http://' + domainName + ':3001/'})
  for (const c of connections) {
    console.log("C:", c);
    await apigwManagementApi.postToConnection({ ConnectionId: c, Data: 'HEY!' }).promise();
  }

  if (result) {
    return sendResponse(200, {});
  } else {
    console.log("sending 400");
    return sendResponse(400, {});
  }
}

async function onDisconnect(event) {
  console.log("cursize: ", connections.size);
  const result = connections.has(event.requestContext.connectionId);
  connections.delete(event.requestContext.connectionId);
  console.log("newsize: ", connections.size);
  return sendResponse(200, {});
}