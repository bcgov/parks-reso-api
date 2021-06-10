// const AWS = require('aws-sdk');
// const dynamodb = new AWS.DynamoDB();

const { exec } = require("child_process");

exports.handler = async (event, context) => {
  // let passObject = {
  //   TableName: process.env.TABLE_NAME
  // };

  try {
    // console.log(event.body);
    // let newObject = JSON.parse(event.body);

    // const registrationNumber = generate(10);

    // const { parkName, firstName, lastName, facilityName, email, numberOfGuests, ...otherProps } = newObject;

    // passObject.Item = {};
    // passObject.Item['pk'] = { S: "pass::" + parkName };
    // passObject.Item['sk'] = { S: registrationNumber };
    // passObject.Item['firstName'] = { S: firstName };
    // passObject.Item['lastName'] = { S: lastName };
    // passObject.Item['facilityName'] = { S: facilityName };
    // passObject.Item['email'] = { S: email };
    // passObject.Item['registrationNumber'] = { S: registrationNumber };
    // passObject.Item['numberOfGuests'] = { S: numberOfGuests };

    // console.log("putting item:", passObject);
    // const res = await dynamodb.putItem(passObject).promise();

    const res = await exec ( "curl --location --request POST 'https://api.notification.canada.ca/v2/notifications/email' --header 'Authorization: ApiKey-v1 172da89d-b2ed-42f3-9555-cf6b3fad5339' --header 'Content-Type: application/json' --data-raw '{ \"email_address\": \"max.wardle@gov.bc.ca\",\"template_id\": \"e3cc5e79-f6b4-4662-ba36-01c83ff458ac\"}'", (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
    console.log("res:", res);
    return sendResponse(200, res);
  } catch (err) {
    console.log("err", err);
    return sendResponse(400, err);
  }
}

// function generate(count) {
//   // TODO: Make this better
//   return Math.random().toString().substr(count);
// }

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
