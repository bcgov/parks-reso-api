const AWS = require('aws-sdk');
const { exec } = require("child_process");
const dynamodb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
  let passObject = {
    TableName: process.env.TABLE_NAME
  };

  try {
    console.log(event.body);
    let newObject = JSON.parse(event.body);

    const registrationNumber = generate(10);

    const { parkName, firstName, lastName, facilityName, email, date, type, numberOfGuests, ...otherProps } = newObject;

    passObject.Item = {};
    passObject.Item['pk'] = { S: "pass::" + parkName };
    passObject.Item['sk'] = { S: registrationNumber };
    passObject.Item['firstName'] = { S: firstName };
    passObject.Item['lastName'] = { S: lastName };
    passObject.Item['facilityName'] = { S: facilityName };
    passObject.Item['email'] = { S: email };
    passObject.Item['date'] = { S: date };
    passObject.Item['type'] = { S: type };
    passObject.Item['registrationNumber'] = { S: registrationNumber };
    passObject.Item['numberOfGuests'] = { S: numberOfGuests };

    // Only let pass come through if there's enough room
    let parkObj = {
      TableName: process.env.TABLE_NAME
    }

    parkObj.ExpressionAttributeValues = {};
    parkObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
    parkObj.ExpressionAttributeValues[':sk'] = { S: parkName };
    parkObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';

    const parkData = await runQuery(parkObj);
    console.log("ParkData:", parkData);
    if (parkData[0].visible === true) {
      let updateFacility = {
        Key: {
          'pk': { S: 'facility::' + parkName },
          'sk': { S: facilityName }
        },
        ExpressionAttributeValues: {
          ":inc": { N:"1" },
        },
        ExpressionAttributeNames: {
          '#booking': 'bookingTimes',
          '#type': type,
          '#currentCount': 'currentCount',
          '#maximum': 'max'
        },
        UpdateExpression: "SET #booking.#type.#currentCount = #booking.#type.#currentCount + :inc",
        ConditionExpression: "#booking.#type.#currentCount < #booking.#type.#maximum",
        ReturnValues: "ALL_NEW",
        TableName: process.env.TABLE_NAME
      };
      console.log("updateFacility:", updateFacility);
      const facilityRes = await dynamodb.updateItem(updateFacility).promise();
      console.log("FacRes:", facilityRes);

      console.log("putting item:", passObject);
      const res = await dynamodb.putItem(passObject).promise();
      console.log("res:", res);

      // SEND EMAIL TO CONFIRM
      exec ( "curl --location --request POST '" + process.env.GC_NOTIFY_API_PATH + "'\
        --header 'Authorization: " + process.env.GC_NOTIFY_API_KEY + "'\
        --header 'Content-Type: application/json' --data-raw '{\
          \"email_address\": \"" + passObject.Item['email'] + "\",\
          \"template_id\": \"" + process.env.GC_NOTIFY_RECEIPT_TEMPLATE_ID + "\",\
          \"personalisation\": {\
            \"fistName\" : \"" + passObject.Item['firstName'] + "\",\
            \"lastName\" : \"" + passObject.Item['lastName'] + "\",\
            \"date\" : \"" + passObject.Item['date'] + "\",\
            \"facilityName\" : \"" + passObject.Item['facilityName'] + "\",\
            \"registrationNumber\" : \"" + passObject.Item['registrationNumber'] + "\"\
          }\
        }'", (error, stdout, stderr) => {
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

      return sendResponse(200, res);
    } else {
      // Not allowed for whatever reason.
      return sendResponse(400, { msg: 'Operation Failed' });
    }
  } catch (err) {
    console.log("err", err);
    return sendResponse(400, { msg: 'Operation Failed' });
  }
}

const sendEmail = async function () {
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
