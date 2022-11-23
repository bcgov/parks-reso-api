const axios = require('axios');
const { logger } = require('../logger');

/**
 * Makes a post to an existing RocketChat integration.
 * @param {*} url RocketChat webhook URL
 * @param {*} token RocketChat webhook bearer token
 * @param {*} job RocketChat post payload (request)
 * @returns Axios response.
 */
// request = {
//   content: {
//     postTitle: Title of post.
//     postText: Body text of post.
//     alias: RocketChat poster name.
//     avatar: RocketChat poster profile picture.
//     author_name: Author.
//     author_icon: URL to author image.
//     author_link: URL to webpage when author is clicked on.
//     color: "#2D834F" (Hex colour).
//     fields: [
//       {
//         title: Field 1 title.
//         value: Field 1 value.
//         short: true/false.
//       },
//       {
//         title: Field 2 title.
//         value: field 2 value.
//         short: true/false.
//       }
//     ]
//   }
// }
async function rcPost(url, token, job) {
  try {
    const rcRes = await axios({
      method: 'post',
      url: url,
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      data: job,
    });
    return rcRes;
  } catch (err) {
    logger.error('Error posting alert to RocketChat:', err);
    return err;
  }
}

module.exports = {
  rcPost
}