const AWS = require('aws-sdk');
const readline = require('readline');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';

const options = {
  region: 'ca-central-1',
  // endpoint: 'http://localhost:8000'
};

// todo: need to confirm correct values for parkName, facilityName, email, firstName, lastName
const parkName = 'Joffre Lakes Provincial Park';
const facilityName = 'Day-Use Trails';
const email = 'parkinfo@gov.bc.ca';
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
    if (passDate - new Date() < 4 * 24 * 60 * 60 * 1000) {
      // 4 days is a just rough date check, but should prevent the data corruption
      // issues that we warn about in JOFFRE-README.md
      console.log('The booking date must be more than 4 days in the future.');
      console.log((passDate - new Date()) / (24 * 60 * 60 * 1000));
    } else if (
      isNaN(numberOfGuests) ||
      shortPassDate.length === 10 ||
      new Date(shortPassDate).getFullYear() !== new Date().getFullYear()
    ) {
      console.log('Invalid inputs');
    } else {
      const transactItems = { TransactItems: [{ Put: getPassObj() }, { Put: getResCountObj() }] };
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

function getPassObj() {
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

function getResCountObj() {
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
