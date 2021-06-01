
const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
    console.log('Read Park');
    const dynamodb = new AWS.DynamoDB();

    try {
      let query = {
        "TableName": "parkreso", // Make a variable.
        "FilterExpression": "published = :val",
        "ExpressionAttributeValues": {":val": {"BOOL": true}},
        "ReturnConsumedCapacity": "TOTAL"
      };

      const data = await dynamodb.scan(query).promise();
      console.log("data:", data);
      var unMarshalled = data.Items.map(item => {
        return AWS.DynamoDB.Converter.unmarshall(item);
      });
      console.log(unMarshalled);
      return sendResponse(200, unMarshalled);
    } catch (err) {
      console.log(err);
      return err;
    }
}

var sendResponse = function (code, data) {
    const response = {
      statusCode: code,
      headers: {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Headers" : "'Content-Type'",
        "Access-Control-Allow-Origin" : "*",
        "Access-Control-Allow-Methods": "OPTIONS,GET"
      },
      body: JSON.stringify(data)
    };
    return response;
  }