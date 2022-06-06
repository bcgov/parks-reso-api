const AWS = require('aws-sdk');
const readline = require('readline');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';

const options = {
  region: 'ca-central-1',
  // endpoint: 'http://localhost:8000'
};

// todo: need to confirm correct values for parkName, facilityName, email, firstName, lastName
const parkName = 'Joffre Lakes Provincial Park';
const facilityName = 'Joffre Lakes';
const email = 'noreply@gov.bc.ca';
const firstName = 'Bulk';
const lastName = 'Pre-booking';
const facilityType = 'Trail';
const type = 'DAY';
const passStatus = 'reserved';

let passDate, shortPassDate, numberOfGuests, registrationNumber;

const dynamodb = new AWS.DynamoDB(options);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\nJOFFRE LAKES BULK BOOKING TOOL\n');
console.log('Warning: This tool writes directly to the AWS database with very minimal input validation.');
console.log('Please ensure your inputs are valid and read JOFFRE-README.md before using this tool.');
console.log('Press CTRL-C to exit.\n');
console.log(`Park name: ${parkName}`);
console.log(`Facility name: ${facilityName}`);
console.log(`Pass type: ${type}`);

rl.question('Booking date (YYYY-MM-DD): ', async function (dateInput) {
  shortPassDate = dateInput;

  // note: the date is being set to 12 noon UTC time to match the Angular FE app.
  // Any updates to how dates are recorded in the Angular app should also be made here!
  passDate = new Date(Date.parse(shortPassDate) + 12 * 60 * 60 * 1000);

  // make the registration number non-random so the sk on the pass is repeatable
  // and we can overwrite records in the db with a put
  registrationNumber = '00' + shortPassDate.replace(/-/g, '');

  rl.question('Number of guests?: ', async function (guestsInput) {
    numberOfGuests = guestsInput;

    // find the booking window for the facility in the db
    const bookingDaysAhead = +(await getBookingDaysAhead());

    if (isNaN(bookingDaysAhead)) {
      // 3 days is the default for env.ADVANCE_BOOKING_LIMIT and the hard-coded
      // limit for DEFAULT_BOOKING_DAYS_AHEAD
      bookingDaysAhead = 3;
    }

    if (passDate - new Date() < (bookingDaysAhead + 1) * 24 * 60 * 60 * 1000) {
      // check if the booking windows has alread opened.  Add 1 day just to be extra
      // safe with regard to server and local timezones.
      console.log(
        `The ${bookingDaysAhead}-day booking window for this facility/date is already opened or too close to opening.`
      );
    } else if (
      isNaN(numberOfGuests) ||
      shortPassDate.length !== 10 ||
      new Date(shortPassDate).getFullYear() !== new Date().getFullYear()
    ) {
      console.log('Invalid inputs');
    } else {
      const transactItems = { TransactItems: [{ Put: passObj() }, { Put: resCountObj() }] };
      console.log(transactItems);
      const response = await dynamodb.transactWriteItems(transactItems).promise();
      console.log('response:', AWS.DynamoDB.Converter.unmarshall(response));
      console.log(
        `Successfully booked ${numberOfGuests} ${type} passes for ${parkName}::${facilityName} on ${shortPassDate}`
      );
    }
    rl.close();
  });
});

rl.on('close', function () {
  process.exit(0);
});

function passObj() {
  return {
    TableName: TABLE_NAME,
    Item: {
      pk: { S: `pass::${parkName}` },
      sk: { S: registrationNumber.toString() },
      firstName: { S: firstName },
      searchFirstName: { S: firstName.toLowerCase() },
      lastName: { S: lastName },
      searchLastName: { S: lastName.toLowerCase() },
      facilityName: { S: facilityName },
      email: { S: email },
      date: { S: passDate.toISOString() },
      shortshortPassDate: { S: shortPassDate },
      type: { S: type },
      registrationNumber: { S: registrationNumber },
      numberOfGuests: { N: numberOfGuests },
      passStatus: { S: passStatus },
      facilityType: { S: facilityType }
    }
  };
}

function resCountObj() {
  const resCountObj = {
    TableName: TABLE_NAME,
    Item: {
      pk: { S: `rescount::${parkName}::${facilityName}` },
      sk: { S: shortPassDate },
      reservations: { M: {} }
    }
  };
  resCountObj.Item.reservations.M[type] = { N: numberOfGuests.toString() };
  return resCountObj;
}

async function getBookingDaysAhead() {
  let getFacilityObj = {
    TableName: TABLE_NAME
  };
  getFacilityObj.ExpressionAttributeValues = {};
  getFacilityObj.ExpressionAttributeValues[':pk'] = { S: `facility::${parkName}` };
  getFacilityObj.ExpressionAttributeValues[':sk'] = { S: facilityName };
  getFacilityObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
  const facilityData = await dynamodb.query(getFacilityObj).promise();
  if (facilityData.Items.length === 0) {
    console.log('Invalid facility. Check the  parkName and facilityName constants at the top of the script.');
    process.exit(0);
  }
  return facilityData.Items[0].bookingDaysAhead?.N;
}
