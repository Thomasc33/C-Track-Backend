const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig

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

Router.get('/user/:uid/:date', async (req, res) => {
    // Get UID parameter from URL
    let uid = req.params.uid
    let date = req.params.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Data validation for UID. Check for UID, and Check if UID exists
    if (!uid || uid == '') return res.status(400).json({ code: 400, message: 'No UID given' })
    let resu = await pool.request().query(`SELECT id FROM users WHERE id = ${uid}`).catch(er => { return `Invalid UID` })
    if (resu == 'Invalid UID') return res.status(400).json({ code: 400, message: 'Invalid UID or not found' })

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
    // Get Params
    const data = req.body;
    let { date, user, job_code, asset_id, notes } = data

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Validate Data
    let errored = false
    let issues = []
    if (!date || date.replace(/\d{4}-\d{2}-\d{2}/g, '') !== '') {
        errored = true
        issues.push('Issue with Date format/ Invalid Date')
    }
    if (!user || (typeof (user) == 'string' && user.replace(/\d/gi, '') !== '')) {
        errored = true
        issues.push('Invalid User ID or User ID not type Int')
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
    let result = await pool.request().query(`INSERT INTO asset_tracking (user_id, asset_id, job_code, date, notes) VALUES ('${user}', '${asset_id}', '${job_code}', '${date}', ${notes ? `'${notes}'` : 'null'})`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        console.log(result.error)
        return res.status(401).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    return res.status(200).json({ message: 'Success' })
})

Router.post('/user/edit', async (req, res) => {
    // Get Params
    const data = req.body;
    let { id, change, value, user } = data

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Validate Data
    let errored = false
    let issues = []
    if (!user || (typeof (user) == 'string' && user.replace(/\d/gi, '') !== '')) {
        errored = true
        issues.push('Invalid User ID or User ID not type Int')
    }
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
        case 'int':
            if (!user || (typeof (user) == 'string' && user.replace(/\d/gi, '') !== '')) {
                errored = true
                issues.push(`Invalid ${change}`)
            }
            break
        case 'asset': //no data validation yet
            break;
        case 'null': //no data validation
            break;
    }
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })
    if (!typeOfToColumn[change]) return res.status(500).json({ message: 'Unsuccessful', issues: 'Unknown column name to change' })

    // Send to DB
    let result = await pool.request().query(`UPDATE asset_tracking SET ${typeOfToColumn[change]} = '${value}' WHERE id = '${id}' AND user_id = '${user}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        console.log(result.error)
        return res.status(401).json({ message: 'Unsuccessful', error: result.error })
    }

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