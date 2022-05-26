## Joffe Lakes Bulk Booking Script

This script pre-books hiking reservations at Joffre Lakes Provincial Park for Parkbus and community groups

This script is intended to be run from a developer workstation. 

NOTE: At the time this script was written, final facility and park names for Joffre had not been determined. Confirm that these 2 lines are correct before running this on dev/test/prod environments.

```
const parkName = 'Joffre Lakes Provincial Park';
const facilityName = 'Day-Use Trails';
```

WARNING: Do not enter a date for which the public booking window has already opened, or this tool will corrupt the rescount data.

### Running the script against your local DynamoDB instance

1. uncomment the line `// endpoint: 'http://localhost:8000'`
5. run the script `node ./joffreBulkBooking.js`
6. you will be prompted to enter a date and the number of guests
    - if you subsequently run the script again for the same date, the previous booking will be overwritten

### Running the script on AWS

1. login to the BC Government AWS console [https://oidc.gov.bc.ca/auth/realms/umafubc9/protocol/saml/clients/amazon-aws]
2. select the approprioate day use pass environment
    - pil3ef-dev
    - pil3ef-test
    - pil3ef-prod
3. click the 'Click for Credentials' button and copy the credentials
4. paste the credentials into a bash terminal (e.g. git bash on Windows)
5. run the script `node ./joffreBulkBooking.js`
6. you will be prompted to enter a date and the number of guests
    - if you subsequently run the script again for the same date, the previous booking will be overwritten

WARNING: Do not enter a date for which the public booking window has already opened, or this tool will corrupt the rescount data.
