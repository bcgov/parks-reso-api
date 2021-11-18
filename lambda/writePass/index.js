const AWS = require('aws-sdk');
const axios = require('axios');

const { dynamodb, runQuery } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

exports.handler = async (event, context) => {
  let passObject = {
    TableName: process.env.TABLE_NAME
  };

  try {
    console.log(event.body);
    let newObject = JSON.parse(event.body);

    const registrationNumber = generate(10);

    let {
      parkName,
      firstName,
      lastName,
      facilityName,
      email,
      date,
      type,
      numberOfGuests,
      phoneNumber,
      facilityType,
      license,
      ...otherProps
    } = newObject;

    // Enforce maximum limit per pass
    if (facilityType === 'Trail' && numberOfGuests > 4) {
      return sendResponse(400, { msg: 'Operation Failed' });
    }

    if (facilityType === 'Parking') {
      numberOfGuests = 1;
    }

    passObject.Item = {};
    passObject.Item['pk'] = { S: 'pass::' + parkName };
    passObject.Item['sk'] = { S: registrationNumber };
    passObject.Item['firstName'] = { S: firstName };
    passObject.Item['lastName'] = { S: lastName };
    passObject.Item['facilityName'] = { S: facilityName };
    passObject.Item['email'] = { S: email };
    passObject.Item['date'] = { S: date };
    passObject.Item['type'] = { S: type };
    passObject.Item['registrationNumber'] = { S: registrationNumber };
    passObject.Item['numberOfGuests'] = AWS.DynamoDB.Converter.input(numberOfGuests);
    passObject.Item['passStatus'] = { S: 'reserved' };
    passObject.Item['phoneNumber'] = AWS.DynamoDB.Converter.input(phoneNumber);
    passObject.Item['facilityType'] = { S: facilityType };

    const cancellationLink =
      process.env.PUBLIC_FRONTEND +
      process.env.PASS_CANCELLATION_ROUTE +
      '?passId=' +
      registrationNumber +
      '&email=' +
      email +
      '&park=' +
      parkName;

    const encodedCancellationLink = encodeURI(cancellationLink);

    let gcNotifyTemplate = process.env.GC_NOTIFY_TRAIL_RECEIPT_TEMPLATE_ID;

    let personalisation = {
      firstName: firstName,
      lastName: lastName,
      date: date,
      facilityName: facilityName,
      numberOfGuests: numberOfGuests.toString(),
      registrationNumber: registrationNumber.toString(),
      cancellationLink: encodedCancellationLink
    };

    // Mandatory if parking.
    if (facilityType === 'Parking') {
      passObject.Item['license'] = { S: license };
      gcNotifyTemplate = process.env.GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID;
      personalisation['license'] = license;
    }

    // Only let pass come through if there's enough room
    let parkObj = {
      TableName: process.env.TABLE_NAME
    };

    parkObj.ExpressionAttributeValues = {};
    parkObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
    parkObj.ExpressionAttributeValues[':sk'] = { S: parkName };
    parkObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';

    const theDate = new Date(date);
    var month = ('0' + (theDate.getMonth() + 1)).slice(-2);
    var day = ('0' + theDate.getUTCDate()).slice(-2);
    var year = theDate.getUTCFullYear();
    const dateselector = year + '' + month + '' + day;

    const parkData = await runQuery(parkObj);
    console.log('ParkData:', parkData);
    if (parkData[0].visible === true) {
      try {
        // Make sure the key for the reservation exists
        let updateReservationObject = {
          Key: {
            pk: { S: 'facility::' + parkName },
            sk: { S: facilityName }
          },
          ExpressionAttributeValues: {
            ':dateSelectorInitialValue': { M: {} }
          },
          ExpressionAttributeNames: {
            '#dateselector': dateselector
          },
          UpdateExpression: 'SET reservations.#dateselector = :dateSelectorInitialValue',
          ConditionExpression: 'attribute_not_exists(reservations.#dateselector)',
          ReturnValues: 'ALL_NEW',
          TableName: process.env.TABLE_NAME
        };
        console.log('updateReservationObject:', updateReservationObject);
        const updateReservationObjectRes = await dynamodb.updateItem(updateReservationObject).promise();
        console.log('updateReservationObjectRes:', updateReservationObjectRes);
      } catch (e) {
        // Already there.
        console.log('dateSelectorInitialValue exists', e);
      }

      try {
        // Add the type into the map
        let addingProperty = {
          Key: {
            pk: { S: 'facility::' + parkName },
            sk: { S: facilityName }
          },
          ExpressionAttributeValues: {
            ':dateSelectorInitialValue': { N: '0' }
          },
          ExpressionAttributeNames: {
            '#dateselector': dateselector,
            '#type': type
          },
          UpdateExpression: 'SET reservations.#dateselector.#type = :dateSelectorInitialValue',
          ConditionExpression: 'attribute_not_exists(reservations.#dateselector.#type)',
          ReturnValues: 'ALL_NEW',
          TableName: process.env.TABLE_NAME
        };
        console.log('addingProperty:', addingProperty);
        const addingPropertyRes = await dynamodb.updateItem(addingProperty).promise();
        console.log('addingPropertyRes:', AWS.DynamoDB.Converter.unmarshall(addingPropertyRes));
      } catch (e) {
        // Already there.
        console.log('Type Prop exists', e);
      }

      let updateFacility = {
        Key: {
          pk: { S: 'facility::' + parkName },
          sk: { S: facilityName }
        },
        ExpressionAttributeValues: {
          ':inc': AWS.DynamoDB.Converter.input(numberOfGuests),
          ':start': AWS.DynamoDB.Converter.input(0)
        },
        ExpressionAttributeNames: {
          '#booking': 'bookingTimes',
          '#type': type,
          '#dateselector': dateselector,
          '#maximum': 'max'
        },
        UpdateExpression:
          'SET reservations.#dateselector.#type = if_not_exists(reservations.#dateselector.#type, :start) + :inc',
        ConditionExpression: '#booking.#type.#maximum > reservations.#dateselector.#type',
        ReturnValues: 'ALL_NEW',
        TableName: process.env.TABLE_NAME
      };
      console.log('updateFacility:', updateFacility);
      const facilityRes = await dynamodb.updateItem(updateFacility).promise();
      console.log('FacRes:', facilityRes);

      console.log('putting item:', passObject);
      const res = await dynamodb.putItem(passObject).promise();
      console.log('res:', res);

      try {
        await axios({
          method: 'post',
          url: process.env.GC_NOTIFY_API_PATH,
          headers: {
            Authorization: process.env.GC_NOTIFY_API_KEY,
            'Content-Type': 'application/json'
          },
          data: {
            email_address: email,
            template_id: gcNotifyTemplate,
            personalisation: personalisation
          }
        });

        return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(passObject.Item));
      } catch (err) {
        let errRes = AWS.DynamoDB.Converter.unmarshall(passObject.Item);
        errRes['err'] = 'Email Failed to Send';
        return sendResponse(200, errRes);
      }
    } else {
      // Not allowed for whatever reason.
      return sendResponse(400, { msg: 'Operation Failed' });
    }
  } catch (err) {
    console.log('err', err);
    return sendResponse(400, { msg: 'Operation Failed' });
  }
};

function generate(count) {
  // TODO: Make this better
  return Math.random().toString().substr(count);
}
