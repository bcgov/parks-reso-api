const { getParks } = require('../../../lambda/dynamoUtil');

function formatTime(time) {
  let sec = parseInt(time / 1000, 10);
  let hours = Math.floor(sec / 3600);
  let minutes = Math.floor((sec - (hours * 3600)) / 60);
  let seconds = sec - (hours * 3600) - (minutes * 60);
  if (hours < 10) { hours = "0" + hours; }
  if (minutes < 10) { minutes = "0" + minutes; }
  if (seconds < 10) { seconds = "0" + seconds; }
  return hours + ':' + minutes + ':' + seconds;
}

function updateConsoleProgress(startTime, intervalStartTime, text, complete = 0, total = 1, modulo = 1) {
  if (complete % modulo === 0 || complete === total) {
    const currentTime = new Date().getTime();
    let currentElapsed = formatTime(currentTime - intervalStartTime);
    let totalElapsed = formatTime(currentTime - startTime);
    const percent = (complete / total) * 100;
    process.stdout.write(` ${text}: ${complete}/${total} (${percent.toFixed(1)}%) completed in ${currentElapsed} (${totalElapsed} elapsed)\r`);
  }
}

async function getOldParks() {
  let parks = await getParks();
  let oldParks = parks.filter((park) => park.sk !== park.orcs);
  return oldParks;
}

module.exports = {
  updateConsoleProgress,
  getOldParks
}