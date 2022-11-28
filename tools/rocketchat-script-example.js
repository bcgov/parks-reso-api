// Copy the script class below into the script box of your RC Integration and change as necessary.
class Script {
  // request = {
  //   content: {
  //     postTitle: Title of post.
  //     postText: Body text of post
  //     alias: RocketChat poster name
  //     avatar: RocketChat poster profile picture
  //     author_name: Author
  //     author_icon: "https://bcparks.ca/_shared/images/logos/logo-bcparks-v-200.png",
  //     author_link: url to webpage when author is clicked on
  //     color: "#2D834F" (Hex colour),
  //     fields: [
  //       {
  //         title: Field 1 title
  //         value: Field 1 value
  //         short: true/false
  //       },
  //       {
  //         title: Field 2 title
  //         value: field 2 value
  //         short: true/false
  //       }
  //     ]
  //   }
  // }
  process_incoming_request({ request }) {
    let fields = [];
    for (const field of request.content.fields) {
      fields.push({
        title: field.title,
        value: field.value,
        short: field.short
      });
    }
    let attachments = {
      author_name: request.content.author_name,
      author_icon: request.content.author_icon,
      author_link: request.content.author_link,
      text: request.content.postText,
      color: request.content.color,
      fields: fields
    };

    return {
      content: {
        alias: request.content.alias || "sPARKy",
        avatar: request.content.avatar || "https://chat.developer.gov.bc.ca/avatar/room/7LDi27DsXy2N2XMEa",
        text: request.content.postTitle || '',
        attachments: [attachments]
      }
    };
  }
}
