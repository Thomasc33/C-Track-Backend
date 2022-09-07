const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')

Router.post('/inventory', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_inventory_scan) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get the data from the request
    let { data } = req.body
    if (!data) return res.status(400).json({ error: 'No data provided' })
    data = data.toLowerCase().split('\n')

    // Connect to the database
    const pool = await sql.connect(config)

    // Get the data from the database
    const before = await pool.request().query(`SELECT * FROM assets WHERE ${data.map(m => `id = '${m}'`).join(' OR ')}`)
        .catch(er => { return { errored: true, er } }).then(r => r.recordset)
    if (before.errored) return res.status(500).json({ error: before.er })

    let iBefore = {}
    for (let i of before) iBefore[i.id.toLowerCase()] = i

    // Organize Data
    const missingAssets = []
    const wrongLocationAssets = []
    const upToDateAssets = []

    for (let i of data) {
        if (!iBefore[i]) missingAssets.push(i)
        else if (iBefore[i].location.toLowerCase() !== 'mdcentric') wrongLocationAssets.push(i)
        else upToDateAssets.push(i)
    }

    const locationUpdateString = wrongLocationAssets.map(m => `${m},${iBefore[m].location}`).join('/')

    // Get inhousenotscanned
    const inHouseQuery = await pool.request().query(`SELECT * FROM assets WHERE location = 'mdcentric' AND id NOT IN (${data.map(m => `'${m}'`).join(',')})`).then(r => r.recordset)
    const inHouseNotScanned = inHouseQuery.map(m => m.id.toLowerCase())

    // Update Locations
    if (wrongLocationAssets.length > 0) {
        let locationQuery = await pool.request().query(`UPDATE assets SET location = 'MDCentric' WHERE ${wrongLocationAssets.map(m => `id = '${m}'`).join(' OR ')}`)
            .catch(er => { return { errored: true, er } })
        if (locationQuery.errored) return res.status(500).json({ error: locationQuery.er })
    }

    // Add to inventory history query
    const q = await pool.request().query(`INSERT INTO inventory_history (user_id,timestamp,missing_assets,wrong_location_assets,up_to_date_assets,in_house_not_scanned,location_changes) OUTPUT Inserted.id VALUES ('${uid}',GETDATE(),'${missingAssets.join(',')}','${wrongLocationAssets.join(',')}','${upToDateAssets.join(',')}','${inHouseNotScanned.join(',')}','${locationUpdateString}')`)
        .catch(er => { return { errored: true, er } })
    if (q.errored) return res.status(500).json({ error: q.er })
    let id = q.recordset[0].id

    return res.status(200).json({ id })
})

Router.get('/inventory', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_inventory_scan) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Connect to the database
    const pool = await sql.connect(config)

    // Get the data from the database
    const history = await pool.request().query(`SELECT * FROM inventory_history ORDER BY timestamp DESC`)
        .catch(er => { return { errored: true, er } }).then(r => r.recordset)
    if (history.errored) return res.status(500).json({ error: history.er })

    // Get Names
    const users = await pool.request().query(`SELECT name, id FROM USERS`)
        .catch(er => { return { errored: true, er } }).then(r => r.recordset)
    if (users.errored) return res.status(500).json({ error: users.er })

    let iUsers = {}
    for (let i of users) iUsers[i.id] = i.name

    for(let i of history) {
        i.user = iUsers[i.user_id]
    }

    return res.status(200).json({ history })
})

Router.get('/inventory/:id', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_inventory_scan) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Connect to the database
    const pool = await sql.connect(config)

    // Get the data from the database
    const history = await pool.request().query(`SELECT * FROM inventory_history WHERE id = '${req.params.id}'`)
        .catch(er => { return { errored: true, er } }).then(r => r.recordset)
    if (history.errored) return res.status(500).json({ error: history.er })
    if (!history || !history.length) return res.status(404).json({ error: 'No history found' })

    // Get Names
    let name_query = await pool.request().query(`SELECT name FROM users WHERE id = '${history[0].user_id}'`)
        .catch(er => { return { errored: true, er } }).then(r => r.recordset)
    if (name_query.errored) return res.status(500).json({ error: name_query.er })
    if (!name_query || !name_query.length) return res.status(404).json({ error: 'No user found' })

    // Reverse formatting
    history[0].in_house_not_scanned = history[0].in_house_not_scanned.split(',')
    history[0].missing_assets = history[0].missing_assets.split(',')
    history[0].up_to_date_assets = history[0].up_to_date_assets.split(',')
    history[0].wrong_location_assets = history[0].wrong_location_assets.split(',')
    history[0].location_changes = history[0].location_changes.split('/').map(m => m.split(','))
    history[0].user = name_query[0].name

    if (history[0].missing_assets.length === 1 && history[0].missing_assets[0] === '') history[0].missing_assets = []
    if (history[0].up_to_date_assets.length === 1 && history[0].up_to_date_assets[0] === '') history[0].up_to_date_assets = []
    if (history[0].wrong_location_assets.length === 1 && history[0].wrong_location_assets[0] === '') history[0].wrong_location_assets = []
    if (history[0].in_house_not_scanned.length === 1 && history[0].in_house_not_scanned[0] === '') history[0].in_house_not_scanned = []
    if (history[0].location_changes.length === 1 && history[0].location_changes[0][0] === '') history[0].location_changes = []

    return res.status(200).json({ data: history[0] })
})

module.exports = Router