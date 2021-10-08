const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')

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

    // Send to DB
    let result = await pool.request().query(`INSERT INTO asset_tracking (user_id, asset_id, job_code, date, notes) VALUES ('${uid}', '${asset_id}', '${job_code}', '${date}', ${notes ? `'${notes}'` : 'null'})`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(401).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    return res.status(200).json({ message: 'Success' })
})

Router.post('/user/edit', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })

    // Get Params
    const data = req.body;
    let { id, change, value } = data

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

    // Send to DB
    let result = await pool.request().query(`UPDATE asset_tracking SET ${typeOfToColumn[change]} = '${value}' WHERE id = '${id}' AND user_id = '${uid}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(401).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    return res.status(200).json({ message: 'Success' })
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

    let asset_query = await pool.request().query(`SELECT * FROM assets WHERE id = '${search}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let resu
    if (asset_query.recordset.length === 1) resu = { ...asset_query.recordset[0] }
    else resu = { notFound: true }

    // Return Data
    return res.status(200).json(resu)
})

Router.post('/edit', async (req, res) => {
    // Get UID from header
    const { uid, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })
    if (!permissions.edit_assets) return res.status(403).json({ error: 'Permission denied' })

    //Get date from header
    const { id, change, value } = req.body

    // Data validation
    let issues = []
    if (!id) issues.push('no asset id')
    if (!change) issues.push('no change type')
    if (!value) issues.push('no change value')
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