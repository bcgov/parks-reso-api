const AWS = require('aws-sdk');
const axios = require('axios');

const { verifyJWT } = require('../captchaUtil');
const { dynamodb, runQuery } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';

exports.handler = async (event, context) => {
  let passObject = {
    TableName: TABLE_NAME
  };

  if (!event) {
    return sendResponse(400, {
      msg: 'There was an error in your submission.',
      title: 'Bad Request'
    }, context);
  }

  try {
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
      captchaJwt,
      ...otherProps
    } = newObject;

    if (!captchaJwt || !captchaJwt.length) {
      return sendResponse(400, { 
                                 msg: 'Missing CAPTCHA verification.', 
                                 title: 'Missing CAPTCHA verification'
                               });
    }

    const verification = verifyJWT(captchaJwt);
    if (!verification.valid) {
      return sendResponse(400, { 
                                 msg: 'CAPTCHA verification failed.', 
                                 title: 'CAPTCHA verification failed'
                               });
    }

    // Enforce maximum limit per pass
    if (facilityType === 'Trail' && numberOfGuests > 4) {
      return sendResponse(400, { 
                                 msg: 'You cannot have more than 4 guests on a trail.', 
                                 title: 'Too many guests'
                               });
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

    const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedDate = new Date(date).toLocaleDateString('en-US', dateOptions) + ' (' + type + ')';

    // Get park's mapLink
    const parkInformation = await getParkInformation(parkName);

    let personalisation = {
      firstName: firstName,
      lastName: lastName,
      date: formattedDate,
      facilityName: facilityName,
      numberOfGuests: numberOfGuests.toString(),
      registrationNumber: registrationNumber.toString(),
      cancellationLink: encodedCancellationLink,
      parkName: parkName,
      mapLink: parkInformation.mapLink
    };

    // Mandatory if parking.
    if (facilityType === 'Parking') {
      passObject.Item['license'] = { S: license };
      gcNotifyTemplate = process.env.GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID;
      personalisation['license'] = license;
    }

    // Only let pass come through if there's enough room
    let parkObj = {
      TableName: TABLE_NAME
    };

    parkObj.ExpressionAttributeValues = {};
    parkObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
    parkObj.ExpressionAttributeValues[':sk'] = { S: parkName };
    parkObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';

    const theDate = new Date(date);
    const dateselector = theDate.toISOString().split('T')[0];

    const parkData = await runQuery(parkObj);
    console.log('ParkData:', parkData);
    if (parkData[0].visible === true) {
      // Check existing pass for the same facility, email, type and date
      try {
        const existingPassCheckObject = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk',
          FilterExpression:
            'facilityName = :facilityName AND email = :email AND #type = :type AND #date = :date AND (passStatus = :reserved OR passStatus = :active)',
          ExpressionAttributeNames: {
            '#type': 'type',
            '#date': 'date'
          },
          ExpressionAttributeValues: {
            ':pk': { S: 'pass::' + parkName },
            ':facilityName': { S: facilityName },
            ':email': { S: email },
            ':type': { S: type },
            ':date': { S: date },
            ':reserved': { S: 'reserved' },
            ':active': { S: 'active' }
          }
        };

        const existingItems = await dynamodb.query(existingPassCheckObject).promise();

        if (existingItems.Count > 0) {
          return sendResponse(400, {
            title: 'This email account already has a reservation for this booking time.',
            msg: 'A reservation associated with this email for this booking time already exists. Please check to see if you already have a reservation for this time. If you do not have an email confirmation of your reservation please contact <a href="mailto:parkinfo@gov.bc.ca">parkinfo@gov.bc.ca</a>'
          });
        }
      } catch (err) {
        console.log('err', err);
        return sendResponse(400, { msg: 'Something went wrong.', title:'Operation Failed' });
      }

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
          TableName: TABLE_NAME
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
          TableName: TABLE_NAME
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
        TableName: TABLE_NAME
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
      return sendResponse(400, { msg: 'Something went wrong.', title:'Operation Failed' });
    }
  } catch (err) {
    console.log('err', err);
    return sendResponse(400, { msg: 'Something went wrong.', title:'Operation Failed' });
  }
};

function generate(count) {
  // TODO: Make this better
  return Math.random().toString().substr(count);
}

async function getParkInformation(parkName) {
  let queryObj = {
    TableName: process.env.TABLE_NAME
  };
  queryObj.ExpressionAttributeValues = {};
  queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
  queryObj.ExpressionAttributeValues[':sk'] = { S: parkName };
  queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
  queryObj.ExpressionAttributeValues[':visible'] = { BOOL: true };
  queryObj.FilterExpression = 'visible =:visible';
  return await runQuery(queryObj);
}