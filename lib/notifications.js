const { toUID } = require("./tokenParsing");
const jwt_decode = require('jwt-decode')
const axios = require('axios')
const settings = require('../settings.json')
const sql = require('mssql')


async function notify(token, asset, status) {
    // Check to see if asset is being watched
    let pool = await sql.connect(settings.SQLConfig)
    let watchedBy = []
    let watchedByString = ''
    let asset_query = await pool.request().query(`SELECT watching,model_number FROM assets WHERE id = '${asset}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (asset_query.isErrored) return console.log(asset_query.er)
    if (asset_query && asset_query.recordset && asset_query.recordset[0])
        if (asset_query.recordset[0].watching) {
            let w = asset_query.recordset[0].watching
            if (!w) return
            w.split(',').forEach(m => watchedBy.push(m))
        }
    if (watchedBy.length == 0) return
    let name_query = await pool.request().query(`SELECT name FROM users WHERE ${watchedBy.map(m => `id = '${m}'`).join(' OR ')}`)
        .catch(er => { return { isErrored: true, er: er } })
    if (name_query.isErrored) return console.log(name_query.er)
    watchedByString = name_query.recordset.map(m => m.name).join(', ')

    // Decode the bearer token
    const decoded = jwt_decode(token)

    // Get Image
    let image_query = await pool.request().query(`SELECT image FROM models WHERE model_number = '${asset_query.recordset[0].model_number}'`)
        .catch(er => { return { isErrored: true, er: er } })
    const image = image_query && image_query.recordset[0] ? image_query.recordset[0].image : ''

    // Send to teams channel
    const user = decoded.name
    axios.post(`${settings.webhookURL}`, {
        '@type': 'OpenUri',
        '@context': `${settings.siteURL}/search?q=${asset}`,
        themeColor: '8730d9',
        "summary": `${asset} has been updated`,
        "sections": [{
            "activityTitle": `${asset} has been updated`,
            "activityImage": image,
            "facts": [{
                "name": "Watched By",
                "value": watchedByString
            }, {
                "name": "New Status",
                "value": `${status}`
            }, {
                "name": "Date Updated",
                "value": new Date().toISOString().replace(/[tdz]/gi, ' ').substr(0, 16)
            }, {
                "name": "Updated By",
                "value": user || 'Unknown'
            }],
            "markdown": true
        }],
        "potentialAction": [{
            "@type": "OpenUri",
            "name": "View on Site",
            "targets": [{
                "os": "default",
                "uri": `${settings.siteURL}/search?q=${asset}`
            }]
        }
        ]
    })
}

module.exports = {
    notify
}