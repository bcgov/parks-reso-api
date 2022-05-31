const AWS = require('aws-sdk');
const axios = require('axios');

const { verifyJWT } = require('../captchaUtil');
const { dynamodb, runQuery, TABLE_NAME, DEFAULT_BOOKING_DAYS_AHEAD } = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { utcToZonedTime } = require('date-fns-tz');
const { formatISO, add, compareAsc, startOfDay } = require('date-fns');

// default opening/closing hours in 24h time
const DEFAULT_AM_OPENING_HOUR = 7;
const DEFAULT_PM_OPENING_HOUR = 12;

exports.handler = async (event, context) => {
  let passObject = {
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_not_exists(sk)'
  };

  if (!event) {
    return sendResponse(
      400,
      {
        msg: 'There was an error in your submission.',
        title: 'Bad Request'
      },
      context
    );
  }

  if (checkWarmup(event)) {
    return sendResponse(200, {});
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

    // Get current time vs booking time information
    const localDate = utcToZonedTime(Date.now(), 'America/Vancouver');
    const currentHour = localDate.getHours();
    const bookingDate = new Date(date);

    let facilityObj = {
      TableName: TABLE_NAME
    };

    // check if booking date in the past
    localDate.setHours(0, 0, 0, 0);
    if (localDate > bookingDate) {
      return sendResponse(400, {
        msg: 'You cannot book for a date in the past.',
        title: 'Booking date in the past'
      });
    }

    facilityObj.ExpressionAttributeValues = {};
    facilityObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + parkName };
    facilityObj.ExpressionAttributeValues[':sk'] = { S: facilityName };
    facilityObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    const facilityData = await runQuery(facilityObj);

    // Check bookingDaysAhead
    const bookingDaysAhead = facilityData[0].bookingDaysAhead === null ? DEFAULT_BOOKING_DAYS_AHEAD : facilityData[0].bookingDaysAhead;
    const futureDateMax = add(localDate, { days: bookingDaysAhead });
    const datecompared = compareAsc(startOfDay(new Date(date)), startOfDay(new Date(futureDateMax)));
    if (datecompared > 0) {
      return sendResponse(400, {
        msg: 'You cannot book for a date that far ahead.',
        title: 'Booking date in the future invalid'
      });
    }

    // There should only be 1 facility.
    let openingHour = facilityData[0].bookingOpeningHour || DEFAULT_AM_OPENING_HOUR;
    let closingHour = DEFAULT_PM_OPENING_HOUR;

    let capacity = 0;
    if (facilityData.length > 0 && facilityData[0].bookingTimes[type]) {
      capacity = facilityData[0].bookingTimes[type].max;
    }

    let status = 'reserved';

    // check if booking same-day
    if (localDate.getDate() === bookingDate.getDate()) {
      // check if AM/PM/DAY is currently open
      if (type === 'AM' && currentHour >= DEFAULT_PM_OPENING_HOUR) {
        // it is beyond AM closing time
        return sendResponse(400, {
          msg:
            'It is too late to book an AM pass on this day (AM time slot is from ' +
            to12hTimeString(openingHour) +
            ' to ' +
            to12hTimeString(closingHour) +
            ').',
          title: 'AM time slot has expired'
        });
      }
      if (type === 'PM') {
        openingHour = DEFAULT_PM_OPENING_HOUR;
      }
      if (currentHour >= openingHour) {
        status = 'active';
      }
    }

    const dateselector = formatISO(new Date(date), { representation: 'date' });

    passObject.Item = {};
    passObject.Item['pk'] = { S: 'pass::' + parkName };
    passObject.Item['sk'] = { S: registrationNumber };
    passObject.Item['firstName'] = { S: firstName };
    passObject.Item['searchFirstName'] = { S: firstName.toLowerCase() };
    passObject.Item['lastName'] = { S: lastName };
    passObject.Item['searchLastName'] = { S: lastName.toLowerCase() };
    passObject.Item['facilityName'] = { S: facilityName };
    passObject.Item['email'] = { S: email };
    passObject.Item['date'] = { S: date };
    passObject.Item['shortPassDate'] = { S: dateselector };
    passObject.Item['type'] = { S: type };
    passObject.Item['registrationNumber'] = { S: registrationNumber };
    passObject.Item['numberOfGuests'] = AWS.DynamoDB.Converter.input(numberOfGuests);
    passObject.Item['passStatus'] = { S: status };
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
      parkName + 
      '&date=' +
      dateselector + 
      '&type=' +
      type;

    const encodedCancellationLink = encodeURI(cancellationLink);

    let gcNotifyTemplate = process.env.GC_NOTIFY_TRAIL_RECEIPT_TEMPLATE_ID;

    const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedDate = new Date(date).toLocaleDateString('en-US', dateOptions);

    // Only let pass come through if there's enough room
    let parkObj = {
      TableName: TABLE_NAME
    };

    parkObj.ExpressionAttributeValues = {};
    parkObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
    parkObj.ExpressionAttributeValues[':sk'] = { S: parkName };
    parkObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    const parkData = await runQuery(parkObj);
    console.log('ParkData:', parkData);

    let personalisation = {
      firstName: firstName,
      lastName: lastName,
      date: formattedDate,
      type: type === 'DAY' ? 'ALL DAY' : type,
      facilityName: facilityName,
      numberOfGuests: numberOfGuests.toString(),
      registrationNumber: registrationNumber.toString(),
      cancellationLink: encodedCancellationLink,
      parkName: parkName,
      mapLink: parkData[0].mapLink,
      parksLink: parkData[0].bcParksLink
    };

    // Parking.
    if (facilityType === 'Parking') {
      gcNotifyTemplate = process.env.GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID;
    }

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
        return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
      }

      // insert booking level record if one doesn't already exist
      const resCountPK = `rescount::${parkName}::${facilityName}`;
      let insertReservationCount = {
        TableName: TABLE_NAME
        //ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
      };      
      insertReservationCount.Item = {};
      insertReservationCount.Item['pk'] = { S: resCountPK };
      insertReservationCount.Item['sk'] = { S: dateselector };
      insertReservationCount.Item['reservations'] = { M: {} };

      try {
        console.log('putting item:', insertReservationCount);
        const insertReservationCountRes = await dynamodb.putItem(insertReservationCount).promise();
        console.log('insertReservationCountRes:', insertReservationCountRes);
      } catch (e) {
        console.log('rescount already exists', e);
      }

      try {
        // Add the type into the map
        let addingProperty = {
          Key: {
            pk: { S: resCountPK },
            sk: { S: dateselector }
          },
          ExpressionAttributeValues: {
            ':typeSelectorInitialValue': { N: '0' }
          },
          ExpressionAttributeNames: {
            '#reservations': 'reservations',
            '#type': type
          },
          UpdateExpression: 'SET #reservations.#type = :typeSelectorInitialValue',
          ConditionExpression: 'attribute_not_exists(#reservations.#type)',
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

      try {
        let updateReservationCount = {
          Key: {
            pk: { S: resCountPK },
            sk: { S: dateselector }
          },
          ExpressionAttributeValues: {
            ':inc': AWS.DynamoDB.Converter.input(numberOfGuests),
            ':maxAllowedPreTransactionReservations': AWS.DynamoDB.Converter.input(capacity - numberOfGuests)
          },
          ExpressionAttributeNames: {
            '#reservations': 'reservations',
            '#type': type
          },
          UpdateExpression:
            'SET #reservations.#type = #reservations.#type + :inc',
          ConditionExpression: ':maxAllowedPreTransactionReservations >= #reservations.#type',
          TableName: TABLE_NAME
        };

        // insert the pass and update the booking count in a transaction
        const transactItems = { TransactItems: [
          {'Update' : updateReservationCount },
          {'Put' : passObject }
        ]};
        console.log('transactItems:', transactItems);
        const transactRes = await dynamodb.transactWriteItems(transactItems).promise();
        console.log('transactRes:', AWS.DynamoDB.Converter.unmarshall(transactRes));
      } catch (err) {
        // There are no more passes available.
        console.log('err', err);
        return sendResponse(400, {
          msg: 'We have sold out of allotted passes for this time, please check back on the site from time to time as new passes may come available.',
          title: 'Sorry, we are unable to fill your specific request.'
        });
      }

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
        console.log('GCNotify email sent.');
        return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(passObject.Item));
      } catch (err) {
        console.log('GCNotify error:', err);
        let errRes = AWS.DynamoDB.Converter.unmarshall(passObject.Item);
        errRes['err'] = 'Email Failed to Send';
        return sendResponse(200, errRes);
      }
    } else {
      // Not allowed for whatever reason.
      return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
    }
  } catch (err) {
    console.log('err', err);
    return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
  }
};

function to12hTimeString(hour) {
  let period = 'am';
  if (hour > 11) {
    period = 'pm';
    if (hour > 12) {
      hour -= 12;
    }
  }
  let hourStr = hour === 0 ? '12' : hour.toString();
  return hourStr + period;
}

function generate(count) {
  // TODO: Make this better
  return Math.random().toString().substr(count);
}
