const jwt_decode = require('jwt-decode')
const axios = require('axios')
const settings = require('../settings.json')
const sql = require('mssql')


async function notify(token, asset, status) {
    // Check to see if asset is being watched
    let pool = await sql.connect(settings.SQLConfig)
    let watchedBy = []
    // let watchedByString = ''
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
    // let name_query = await pool.request().query(`SELECT name FROM users WHERE ${watchedBy.map(m => `id = '${m}'`).join(' OR ')}`)
    //     .catch(er => { return { isErrored: true, er: er } })
    // if (name_query.isErrored) return console.log(name_query.er)
    // watchedByString = name_query.recordset.map(m => m.name).join(', ')

    // Decode the bearer token
    const decoded = jwt_decode(token)

    // Get Image
    let image_query = await pool.request().query(`SELECT image FROM models WHERE model_number = '${asset_query.recordset[0].model_number}'`)
        .catch(er => { return { isErrored: true, er: er } })
    const image = image_query && image_query.recordset[0] ? image_query.recordset[0].image : ''

    // Add to Notifications Table
    await pool.request().query(`INSERT INTO notifications (user_id,image,url,title,message) VALUES ${watchedBy.map(wb => `('${wb}','${image}','${`${settings.siteURL}/search?q=${asset}`}','${asset} has been updated','${`${asset} has been updated to ${status} by ${decoded.name || 'Unknown'}`}')`)}`)
}

async function hold_notify(asset, status) {
    // Check to see if asset is being watched
    let pool = await sql.connect(settings.SQLConfig)

    let asset_query = await pool.request().query(`SELECT model_number,hold_type FROM assets WHERE id = '${asset}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (asset_query.isErrored) return console.log(asset_query.er)

    if (!asset_query.recordset || !asset_query.recordset[0] || !asset_query.recordset[0].hold_type) return (asset_query.recordset[0])


    // Get Image
    let image_query = await pool.request().query(`SELECT image FROM models WHERE model_number = '${asset_query.recordset[0].model_number}'`)
        .catch(er => { return { isErrored: true, er: er } })
    const image = image_query && image_query.recordset[0] ? image_query.recordset[0].image : ''

    // Send to teams channel
    axios.post(`${settings.holdWebhookURL}`, {
        '@type': 'OpenUri',
        '@context': `${settings.siteURL}/search?q=${asset}`,
        themeColor: '8730d9',
        "summary": `${asset} has been updated`,
        "sections": [{
            "activityTitle": `${asset} has been updated`,
            "activityImage": image,
            "facts": [{
                "name": "Hold Type",
                "value": `${asset_query.recordset[0].hold_type}`
            }, {
                "name": "Status Set",
                "value": `${status}`
            }, {
                "name": "Date Updated",
                "value": new Date().toISOString().replace(/[tdz]/gi, ' ').substr(0, 16)
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
        }]
    })
}

async function historicChangeNotify(record, user, originDate) {
    // Establish SQL Connection
    let pool = await sql.connect(settings.SQLConfig)

    // Get all users with receive_historical_change_notifications set to true
    let user_query = await pool.request().query(`SELECT id FROM user_permissions WHERE receive_historical_change_notifications = 1`)
        .catch(er => { console.log(er); return null })
        .then(r => r.recordset)
    if (!user_query) return

    // Get name if user is numeric
    if (!isNaN(+user)) user = await pool.request().query(`SELECT name FROM users WHERE id = '${user}'`).then(r => r.recordset[0].name)
    if (!user) user = 'Unknown'

    // Add to notifications table
    await pool.request().query(`INSERT INTO notifications (user_id,title,message) VALUES ${user_query.map(u => `('${u.id}','Historical Data Changed','${`${record} from ${originDate} has been changed by ${user || 'Unknown'}`}')`).join(', ')}`)
}

module.exports = {
    notify,
    hold_notify,
    historicChangeNotify
}