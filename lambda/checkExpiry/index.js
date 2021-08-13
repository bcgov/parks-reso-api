
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
    console.log('check expiry', event);

    let queryObj = {
      TableName: process.env.TABLE_NAME
    };

    // Look for today's expiries
    let yesterdaysDate = formatDate(new Date())

    try {
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
      queryObj.KeyConditionExpression = 'pk =:pk';
      console.log("queryObj:", queryObj);

      const parkData = await runQuery(queryObj);

      for(let i=0;i < parkData.length;i++) {
        let passQuery = {
          TableName: process.env.TABLE_NAME
        };
        passQuery.ExpressionAttributeNames = {
          '#dateselector': 'date'
        };
        passQuery.ExpressionAttributeValues = {};
        passQuery.ExpressionAttributeValues[':pk'] = { S: 'pass::' + parkData[i].sk };
        passQuery.ExpressionAttributeValues[':yesterdaysDate'] = { S: yesterdaysDate };
        passQuery.ExpressionAttributeValues[':reservedStatus'] = { S: 'reserved' };
        passQuery.KeyConditionExpression = 'pk =:pk';
        passQuery.FilterExpression = 'begins_with(#dateselector, :yesterdaysDate) AND passStatus =:reservedStatus';

        console.log("passQuery:", passQuery);
        const passData = await runQuery(passQuery);
        console.log("passData:", passData);

        await setStatus(passData, 'expired');
      }
      return sendResponse(200, {}, context);
    } catch (err) {
      console.log(err);
      return sendResponse(200, {msg: 'Activation Check Complete'}, context);
    }
}

async function setStatus(passes, status) {
  for(let i=0;i < passes.length;i++) {
    let updateParams = {
      Key: {
        'pk': { S: passes[i].pk },
        'sk': { S: passes[i].sk }
      },
      ExpressionAttributeValues: {
        ':statusValue': { S: status }
      },
      UpdateExpression : "SET passStatus = :statusValue",
      ReturnValues: "ALL_NEW",
      TableName: process.env.TABLE_NAME
    };

    await dynamodb.updateItem(updateParams).promise();
  }
}

function formatDate(d) {
  let month = '' + (d.getMonth() + 1),
      day = '' + (d.getDate() - 1), // We need yesterday's date to check for moving active -> expired
      year = d.getFullYear();

  if (month.length < 2)
      month = '0' + month;
  if (day.length < 2) 
      day = '0' + day;

  return [year, month, day].join('-');
}

const runQuery = async function (query) {
  console.log("query:", query);
  const data = await dynamodb.query(query).promise();
  console.log("data:", data);
  var unMarshalled = data.Items.map(item => {
    return AWS.DynamoDB.Converter.unmarshall(item);
  });
  console.log(unMarshalled);
  return unMarshalled;
}

const sendResponse = function (code, data, context) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Origin" : "*",
      "Access-Control-Allow-Methods": "OPTIONS,GET"
    },
    body: JSON.stringify(data)
  };
  return response;
}