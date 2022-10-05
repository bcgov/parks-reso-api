const fs = require('fs');

const reserved = JSON.parse(fs.readFileSync('reservedAfterApril.js', 'utf8'));
const expired = JSON.parse(fs.readFileSync('expiredAfterApril.js', 'utf8'));

// console.log("reserved:", reserved);
// console.log("expired:", expired);

let reservedCount = 0;
let expiredCount = 0;

for (passesReserved of reserved.Items) {
  // console.log("pass:", pass);
  reservedCount += Number(passesReserved.numberOfGuests.N);
}

for (passesExpired of expired.Items) {
  // console.log("pass:", pass);
  expiredCount += Number(passesExpired.numberOfGuests.N);
}

console.log("Reserved People:", reservedCount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","))
console.log("Expired People:", expiredCount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","))