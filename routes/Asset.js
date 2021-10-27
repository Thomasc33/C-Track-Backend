const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')
const newAssetStatusCode = require('../settings.json').newAssetStatusCode

const typeOfs = {
    asset: 'asset',
    notes: 'null',
    job: 'int',
}
const typeOfToColumn = {
    asset: 'asset_id',
    notes: 'notes',
    job: 'job_code',
}

Router.get('/user/:date', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })

    //Get date from header
    let date = req.params.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data

    // Combining these into a single query is out of my knowledge level, so I'm breaking it up into multiple
    let asset_tracking = await pool.request().query(`SELECT * FROM asset_tracking WHERE user_id = '${uid}' AND date = '${getDate(date)}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let data = {
        records: asset_tracking.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/user/new', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })
    // Get Params
    const data = req.body;
    let { date, job_code, asset_id, notes } = data

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Validate Data
    let errored = false
    let issues = []
    if (!date || date.replace(/\d{4}-\d{2}-\d{2}/g, '') !== '') {
        errored = true
        issues.push('Issue with Date format/ Invalid Date')
    }
    if (!job_code || (typeof (job_code) == 'string' && job_code.replace(/\d/gi, '') !== '')) {
        errored = true
        issues.push('Invalid Job Code or Job Code not type Int')
    }
    if (!asset_id) {
        errored = true
        issues.push('Asset ID not provided')
    }
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })

    // Valdiate Job Code
    let job_code_query = await pool.request().query(`SELECT * FROM jobs WHERE id = ${job_code}`)
        .catch(er => { return { isErrored: true, er: er } })
    if (job_code_query.isErrored) return res.status(500).json(job_code_query.er)
    if (!job_code_query.recordset || !job_code_query.recordset[0]) return res.status(400).json({ message: `Invalid job code '${job_code}'` })

    let asset_query = await pool.request().query(`SELECT * FROM assets WHERE id = '${asset_id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (asset_query.isErrored) return res.status(500).json(asset_query.er)
    if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(405).json({ message: `Asset id not found '${asset_id}'` })

    let model_query = await pool.request().query(`SELECT * FROM models WHERE model_number = '${asset_query.recordset[0].model_number}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (model_query.isErrored) return res.status(500).json(model_query.er)
    if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(400).json({ message: `Invlaid model_number in asset id '${asset_id}'` })
    if (job_code_query.recordset[0].applies && !job_code_query.recordset[0].applies.split(',').includes(model_query.recordset[0].category)) return res.status(406).json({ message: 'Job code doesnt apply to model type' })

    // Send to DB
    let result = await pool.request().query(`INSERT INTO asset_tracking (user_id, asset_id, job_code, date, notes) VALUES ('${uid}', '${asset_id}', '${job_code}', '${date}', ${notes ? `'${notes}'` : 'null'})`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(401).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    res.status(200).json({ message: 'Success' })

    // Edit asset and set status
    pool.request().query(`UPDATE assets SET status = '${job_code}' WHERE id = '${asset_id}'`)
})

Router.post('/user/edit', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })

    // Get Params
    const { id, change, value } = req.body;

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Validate Data
    let errored = false
    let issues = []
    if (!id || (typeof (id) == 'string' && id.replace(/\d/gi, '') !== '')) {
        errored = true
        issues.push(`Invalid History ID`)
    }
    switch (typeOfs[change]) {
        case 'date':
            if (!value || value.replace(/\d{4}-\d{2}-\d{2}/g, '') !== '') {
                errored = true
                issues.push('Issue with Date format/ Invalid Date')
            }
            break;
        case 'asset': //no data validation yet
            break;
        case 'null': //no data validation
            break;
    }
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })
    if (!typeOfToColumn[change]) return res.status(500).json({ message: 'Unsuccessful', issues: 'Unknown column name to change' })

    // Valdiate Job Code
    if (change == 'job') {
        let job_code_query = await pool.request().query(`SELECT * FROM jobs WHERE id = ${value}`)
            .catch(er => { return { isErrored: true, er: er } })
        if (job_code_query.isErrored) return res.status(500).json(job_code_query.er)
        if (!job_code_query.recordset || !job_code_query.recordset[0]) return res.status(400).json({ message: `Invalid job code '${value}'` })

        let asset_tracker_to_id_query = await pool.request().query(`SELECT asset_id FROM asset_tracking WHERE id = '${id}'`)
            .catch(er => { return { isErrored: true, er: er } })
        if (asset_tracker_to_id_query.isErrored) return res.status(500).json(asset_tracker_to_id_query.er)
        if (!asset_tracker_to_id_query.recordset || !asset_tracker_to_id_query.recordset[0]) return res.status(405).json({ message: `Asset id not found in history of '${id}'` })

        let asset_query = await pool.request().query(`SELECT * FROM assets WHERE id = '${asset_tracker_to_id_query.recordset[0].asset_id}'`)
            .catch(er => { return { isErrored: true, er: er } })
        if (asset_query.isErrored) return res.status(500).json(asset_query.er)
        if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(405).json({ message: `Asset id not found '${asset_tracker_to_id_query.recordset[0].asset_id}'` })

        let model_query = await pool.request().query(`SELECT * FROM models WHERE model_number = '${asset_query.recordset[0].model_number}'`)
            .catch(er => { return { isErrored: true, er: er } })
        if (model_query.isErrored) return res.status(500).json(model_query.er)
        if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(400).json({ message: `Invlaid model_number in asset id '${id}'` })
        if (job_code_query.recordset[0].applies && !job_code_query.recordset[0].applies.split(',').includes(model_query.recordset[0].category)) return res.status(406).json({ message: 'Job code doesnt apply to model type' })
    }

    // Send to DB
    let result = await pool.request().query(`UPDATE asset_tracking SET ${typeOfToColumn[change]} = '${value}' WHERE id = '${id}' AND user_id = '${uid}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(401).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    res.status(200).json({ message: 'Success' })

    // Edit asset and set status
    if (change == 'job') pool.request().query(`UPDATE assets SET status = '${value}' WHERE id = '${id}'`)
})

Router.delete('/user/del/:id/:date', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })

    // Get Params
    const id = req.params.id
    const date = req.params.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Data validation for UID. Check for UID, and Check if UID exists
    if (!uid || uid == '') return res.status(400).json({ code: 400, message: 'No UID given' })
    let resu = await pool.request().query(`SELECT id FROM users WHERE id = ${uid}`).catch(er => { return `Invalid UID` })
    if (resu == 'Invalid UID') return res.status(400).json({ code: 400, message: 'Invalid UID or not found' })

    if (!id || id == '') return res.status(400).json({ code: 400, message: 'No ID given' })
    resu = await pool.request().query(`SELECT id FROM asset_tracking WHERE id = ${id}`).catch(er => { return `Invalid ID` })
    if (resu == 'Invalid ID') return res.status(400).json({ code: 400, message: 'Invalid ID or not found' })

    let asset_tracking = await pool.request().query(`DELETE FROM asset_tracking WHERE id = '${id}' AND user_id = '${uid}' AND date = '${getDate(date)}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Return Data
    return res.status(200).json({ message: 'Success' })
})

Router.get('/fetch/:id', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })

    //Get date from header
    let id = req.params.id

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data

    // Combining these into a single query is out of my knowledge level, so I'm breaking it up into multiple
    let asset_tracking = await pool.request().query(`SELECT * FROM assets WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let data = {
        records: asset_tracking.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/catalog', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })

    // Establish SQL Connection
    let pool = await sql.connect(config)
    const { offset, limit, orderBy } = req.body

    // Data Validation
    let errors = []
    if (isNaN(parseInt(offset))) errors.push('Invalid Offset')
    if (!orderBy) errors.push('Invalid orderBy')
    if (errors.length > 0) return res.status(400).json({ error: errors })

    // Get Data
    let rq = await pool.request().query(`SELECT * FROM assets ORDER BY ${orderBy} DESC ${limit ? `OFFSET ${offset} ROWS FETCH ${offset == 0 ? 'FIRST' : 'NEXT'} ${limit} ROWS ONLY` : ''}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (rq.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let data = {
        records: rq.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

Router.get('/get/:search', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })

    //Get date from header
    const search = req.params.search

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data

    let asset_query = await pool.request().query(`SELECT * FROM assets WHERE id = '${search}' OR notes LIKE '%${search}%'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let resu = []
    for (let i of asset_query.recordset) {
        let r
        r = { type: 'asset', info: i }

        // Asset Status History Query
        let history_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE asset_id = '${r.info.id}' ORDER BY date DESC`).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (history_query.isErrored) { return res.status(500).json({ message: 'Asset History Query Error' }) }

        if (!history_query.isErrored && history_query.recordset.length > 0) {
            let his = []
            for (let i of history_query.recordset) {
                let name = await pool.request().query(`SELECT name FROM users WHERE id = '${i.user_id}'`).catch(er => { console.log(er); return { isErrored: true, error: er } })
                if (name.isErrored) return res.status(500).json({ message: `Failed user name query for (${i.user_id})` })
                if (name.recordset[0] && name.recordset[0].name) name = name.recordset[0].name
                else name = `uid: ${i.user_id}`
                his.push({ name, job_code: i.job_code, date: i.date, id: i.id, notes: i.notes })
            }
            r.history = his
        }
        resu.push(r)
    }

    let tracker_comment_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE notes LIKE '%${search}%'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (tracker_comment_query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    for (let i of tracker_comment_query.recordset) {
        let id = i.asset_id

        let aq = await pool.request().query(`SELECT * FROM assets WHERE id = '${id}'`)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (aq.isErrored) {
            // Check for specific errors

            // If no errors above, return generic Invalid UID Error
            return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
        }
        if (aq.recordset.length == 0) continue;
        let r = { type: 'tracker', info: aq.recordset[0] }

        let hq = await pool.request().query(`SELECT * FROM asset_tracking WHERE asset_id = '${r.info.id}' ORDER BY date DESC`).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (hq.isErrored) { return res.status(500).json({ message: 'Asset History Query Error' }) }

        if (!hq.isErrored && hq.recordset.length > 0) {
            let his = []
            for (let i of hq.recordset) {
                let name = await pool.request().query(`SELECT name FROM users WHERE id = '${i.user_id}'`).catch(er => { console.log(er); return { isErrored: true, error: er } })
                if (name.isErrored) return res.status(500).json({ message: `Failed user name query for (${i.user_id})` })
                if (name.recordset[0] && name.recordset[0].name) name = name.recordset[0].name
                else name = `uid: ${i.user_id}`
                his.unshift({ name, job_code: i.job_code, date: i.date, id: i.id, notes: i.notes })
            }
            r.history = his
        }

        resu.push(r)
    }

    if (resu.length === 0) resu = { notFound: true }

    // Return Data
    return res.status(200).json(resu)
})

Router.post('/edit', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_assets) return res.status(403).json({ error: 'Permission denied' })

    //Get date from header
    const { id, change, value } = req.body

    // Data validation
    let issues = []
    if (!id) issues.push('no asset id')
    if (!change) issues.push('no change type')

    // if change == model_number, validate the model number
    if (change == 'model_number') {
        let q = await pool.request().query(`SELECT model_number from models`)
            .catch(er => { return { isErrored: true, error: er } })
        if (q.isErrored) return res.status(500).json({ message: 'failed to query model numbers', er: q.error })
        let found = false
        for (let i of q.recordset)
            if (i.model_number == value) found = true
        if (!found) issues.push('Model number doesnt exist')
    }

    if (issues.length > 0) return res.status(400).json(issues)

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data
    let asset_query = await pool.request().query(`UPDATE assets SET ${change} = '${value}' WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })

    if (asset_query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Return Data
    return res.status(200).json({ message: 'success' })
})

Router.put('/create', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_assets) return res.status(403).json({ error: 'Permission denied' })

    // Get req body
    const { asset_id, model_id } = req.body
    console.log(asset_id, model_id)

    // Data Validation
    let issues = []
    if (!asset_id) issues.push('Missing Asset ID')
    if (!model_id) issues.push('Missing Model ID')

    if (issues.length > 0) return res.status(400).json({ message: issues })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Check to see if model exists
    let model_query = await pool.request().query(`SELECT model_number FROM models WHERE model_number = '${model_id}'`).catch(er => { return { isErrored: true, error: er } })
    if (model_query.isErrored) return res.status(500).json({ message: `Error in model validation query\n${model_query.error}` })
    console.log(model_query)
    if (!model_query.recordset) return res.status(400).json({ message: 'Model Does not exist' })

    // Check to see if asset exists
    let asset_dupe_query = await pool.request().query(`SELECT id FROM assets WHERE id = '${asset_id}'`).catch(er => { return { isErrored: true, error: er } })
    if (asset_dupe_query.isErrored) return res.status(500).json({ message: 'Error in asset duplicate validation query' })
    if (asset_dupe_query.recordset && asset_dupe_query.recordset.length != 0) return res.status(400).json({ message: 'Asset already exists' })

    // Insert
    let asset_query = await pool.request().query(`INSERT INTO assets (id, model_number, status) VALUES ('${asset_id}','${model_id}','${newAssetStatusCode}')`).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_query.isErrored) return res.status(500).json({ message: asset_query.error })

    // Return
    return res.status(200).json({ message: 'Success' })
})

module.exports = Router

/**
 * 
 * @param {Date} date 
 * @returns 
 */
function getDate(date) {
    date = new Date(date)
    return date.toISOString().split('T')[0]
}