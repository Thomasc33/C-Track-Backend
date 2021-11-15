const { toUID } = require("./tokenParsing");
const jwt_decode = require('jwt-decode')
const axios = require('axios')
const settings = require('../settings.json')



async function notify(token, asset, status) {
    // Get UID
    // const { uid } = await toUID(token)
    // if(!uid) return

    const decoded = jwt_decode(token)
    const image = ''
    const id = decoded.oid
    axios.post(`${settings.webhookURL}`, {
        '@type': 'OpenUri',
        '@context': `${settings.siteURL}/search?q=${asset}`,
        themeColor: '8730d9',
        "summary": `${asset} has been updated`,
        "sections": [{
            "activityTitle": `${asset} has been changed status`,
            "activitySubtitle": `New Status: ${status}`,
            "activityImage": image,
            "facts": [{
                "name": "Assigned to",
                "value": "Unassigned"
            }, {
                "name": "Due date",
                "value": "Mon May 01 2017 17:07:18 GMT-0700 (Pacific Daylight Time)"
            }, {
                "name": "Status",
                "value": "Not started"
            }],
            "markdown": true
        }],
        "potentialAction": [{
            "@type": "OpenUri",
            "name": "View on Site",
            "target": `${settings.siteURL}/search?q=${asset}`
        }]
    })


    // Establish DB Connection


    // Query for notification list

    // JSON parse notifications
}

module.exports = {
    notify
}