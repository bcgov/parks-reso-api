const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
  let passObject = {
    TableName: process.env.TABLE_NAME
  };

  try {
    console.log(event.body);
    let newObject = JSON.parse(event.body);

    const registrationNumber = generate(10);

    const { parkName, firstName, lastName, facilityName, email, numberOfGuests, ...otherProps } = newObject;

    passObject.Item = {};
    passObject.Item['pk'] = { S: "pass::" + parkName };
    passObject.Item['sk'] = { S: registrationNumber };
    passObject.Item['firstName'] = { S: firstName };
    passObject.Item['lastName'] = { S: lastName };
    passObject.Item['facilityName'] = { S: facilityName };
    passObject.Item['email'] = { S: email };
    passObject.Item['registrationNumber'] = { S: registrationNumber };
    passObject.Item['numberOfGuests'] = { S: numberOfGuests };

    console.log("putting item:", passObject);
    const res = await dynamodb.putItem(passObject).promise();
    console.log("res:", res);
    return sendResponse(200, res);
  } catch (err) {
    console.log("err", err);
    return sendResponse(400, err);
  }
}

function generate(count) {
  // TODO: Make this better
  return Math.random().toString().substr(count);
}

const sendResponse = function (code, data) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST"
    },
    body: JSON.stringify(data)
  };
  return response;
}