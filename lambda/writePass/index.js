const AWS = require('aws-sdk');
const axios = require('axios');

const { dynamodb, runQuery } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

const ADVANCE_BOOKING_LIMIT = parseInt(process.env.ADVANCE_BOOKING_LIMIT, 10) || 3;
const ADVANCE_BOOKING_HOUR = parseInt(process.env.ADVANCE_BOOKING_HOUR, 10) || 7;
const BOOKING_TIMEZONE = 'America/Vancouver';

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

    // Lookup the facility to confirm that booking is allowed
    // (we are in the booking window and the facility is open and public)
    const facilityQuery = {
      TableName: process.env.TABLE_NAME,
      ExpressionAttributeValues: {
        ':pk': { S: `facility::${parkName}` },
        ':sk': { S: facilityName },
        ':visible': { BOOL: true }
      },
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      FilterExpression: 'visible = :visible'
    };
    const facilityRes = await runQuery(facilityQuery);

    if (facilityRes.length === 0) {
      console.log('Facility not found.');
      return sendResponse(404, { msg: 'Facility not found' });
    }
    const facility = facilityRes[0];

    if (facility.status.state !== 'open') {
      console.log('Facility is not open.');
      return sendResponse(400, { msg: 'Facility is closed' });
    }

    const { minBookingDate, maxBookingDate } = getBookingDateRange(facility);
    // the `date` param is a UTC full timestamp, e.g. '2021-11-25T16:18:46.758Z',
    // but could be shortened to an ISO date in future
    const bookingDate = new Date(date);
    if (bookingDate < minBookingDate || bookingDate > maxBookingDate) {
      console.log(
        `Booking date ${bookingDate} outside of allowed booking range of
        (${minBookingDate} to ${maxBookingDate})`
      );
      return sendResponse(400, { msg: 'Invalid booking date' });
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

    const dateOptions = {day: "numeric", month: "long", year: "numeric"};
    const formattedDate = new Date(date).toLocaleDateString("en-US", dateOptions) + " (" + type + ")";

    let personalisation = {
      firstName: firstName,
      lastName: lastName,
      date: formattedDate,
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
    const dateselector = theDate.toISOString().split('T')[0];

    const parkData = await runQuery(parkObj);
    console.log('ParkData:', parkData);
    if (parkData[0].visible === true) {
      // Check existing pass for the same facility, email, type and date
      try {
        const existingPassCheckObject = {
          TableName: process.env.TABLE_NAME,
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
          return sendResponse(400, { msg: 'Duplicate pass exists' });
        }
      } catch (err) {
        console.log('err', err);
        return sendResponse(400, { msg: 'Operation Failed' });
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

function getBookingDateRange(facility) {
  const bookingOpeningHour = facility.bookingOpeningHour || ADVANCE_BOOKING_HOUR;
  const bookingDaysAhead = facility.bookingDaysAhead || ADVANCE_BOOKING_LIMIT;
  // Server time is UTC
  const now = new Date();

  // check the current date/time in the booking timezone
  const currentYear = now.toLocaleString('en-US', { year: 'numeric', timeZone: BOOKING_TIMEZONE });
  const currentMonth = now.toLocaleString('en-US', { month: '2-digit', timeZone: BOOKING_TIMEZONE });
  const currentDay = now.toLocaleString('en-US', { day: '2-digit', timeZone: BOOKING_TIMEZONE });
  const currentHour = now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: BOOKING_TIMEZONE });

  const minBookingDate = new Date(`${currentYear}-${currentMonth}-${currentDay}`);
  const maxBookingDate = new Date(minBookingDate);
  // if it is after the opening time locally, allow booking the full window.
  // Otherwise, subtract 1 from the window.
  if (parseInt(currentHour, 10) >= bookingOpeningHour) {
    maxBookingDate.setDate(maxBookingDate.getDate() + bookingDaysAhead);
  } else {
    maxBookingDate.setDate(maxBookingDate.getDate() + bookingDaysAhead - 1);
  }
  maxBookingDate.setHours(23, 59, 59, 999);

  return {
    maxBookingDate, minBookingDate
  }
}

function generate(count) {
  // TODO: Make this better
  return Math.random().toString().substr(count);
}
