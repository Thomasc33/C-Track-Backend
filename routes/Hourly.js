const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')

const typeOfToColumn = {
    notes: 'notes',
    job: 'job_code',
    start: 'start_time',
    end: 'end_time',
    in_progress: 'in_progress'
}

Router.get('/user', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    //Get date from header
    let date = req.query.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data

    // Query the DB
    let hourly_tracking = await pool.request().query(`SELECT * FROM hourly_tracking WHERE user_id = '${uid}' AND date = '${getDate(date)}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (hourly_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let data = {
        records: hourly_tracking.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/user/new', async (req, res) => {
    // Get UID from header
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    let t_uid = uid
    uid = req.body.uid

    // Get Params
    const data = req.body;
    let { date, job_code, startTime, endTime, total_hours, notes, in_progress } = data
    if (uid && !isAdmin && !permissions.edit_others_worksheets) return res.status(401).json({ message: 'missing permission' })
    if (!uid) uid = t_uid

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Validate Data
    let errored = false
    let issues = []
    if (!date || date.replace(/\d{4}-\d{2}-\d{2}/g, '') !== '') {
        errored = true
        issues.push('Issue with Date format/ Invalid Date')
    }
    if (!startTime || startTime.replace(/\d+:\d{2}/g, '') !== '' || parseInt(startTime.split(':')[0] > 24) || parseInt(startTime.split(':')[1] > 45) || parseInt(startTime.split(':')[1]) % 15 !== 0) {
        errored = true
        issues.push('Issue with Start Time')
    }
    if (!endTime || endTime.replace(/\d+:\d{2}/g, '') !== '' || parseInt(endTime.split(':')[0] > 24) || parseInt(endTime.split(':')[1] > 45) || parseInt(endTime.split(':')[1]) % 15 !== 0) {
        if (!in_progress) {
            errored = true
            issues.push('Issue with End Time')
        }
    }
    if (!total_hours || `${total_hours}`.replace(/[\d.]/g, '') !== '') {
        errored = true
        issues.push('Issue with Total Hours')
    }
    if (!job_code || (typeof (job_code) == 'string' && job_code.replace(/\d/gi, '') !== '')) {
        errored = true
        issues.push('Invalid Job Code or Job Code not type Int')
    }
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })

    // Send to DB
    let result = await pool.request().query(`INSERT INTO hourly_tracking (job_code, user_id, start_time, end_time, notes, hours, date, in_progress) VALUES ('${job_code}', '${uid}', '${startTime}', '${endTime}', ${notes ? `'${notes}'` : 'null'}, '${total_hours}', '${date}', '${in_progress ? '1' : '0'}')`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(500).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    return res.status(200).json({ message: 'Success' })
})

Router.post('/user/edit', async (req, res) => {
    // Get UID from header
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    let t_uid = uid
    uid = req.body.uid

    // Get Params
    const data = req.body;
    let { id, change, value, total_hours } = data
    if (uid && !isAdmin && !permissions.edit_others_worksheets) return res.status(401).json({ message: 'missing permission' })
    if (!uid) uid = t_uid

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Validate Data
    let errored = false
    let issues = []
    if (!id || (typeof (id) == 'string' && id.replace(/\d/gi, '') !== '')) {
        errored = true
        issues.push(`Invalid History ID`)
    }
    switch (change) {
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
    let result = await pool.request().query(`UPDATE hourly_tracking SET ${typeOfToColumn[change]} = '${value}'${total_hours ? `, hours = ${total_hours}` : ''} WHERE id = '${id}' AND user_id = '${uid}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(400).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    return res.status(200).json({ message: 'Success' })
})

Router.delete('/user/del', async (req, res) => {
    // Get UID from header
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    let t_uid = uid

    // Get Params
    const id = req.query.id
    const date = req.query.date
    uid = req.query.uid
    if (uid && !isAdmin && !permissions.edit_others_worksheets) return res.status(401).json({ message: 'missing permission' })
    if (!uid) uid = t_uid

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Data validation for UID. Check for UID, and Check if UID exists
    if (!uid || uid == '') return res.status(400).json({ message: 'No UID given' })
    let resu = await pool.request().query(`SELECT id FROM users WHERE id = ${uid}`).catch(er => { return `Invalid UID` })
    if (resu == 'Invalid UID') return res.status(400).json({ message: 'Invalid UID or not found' })

    if (!id || id == '') return res.status(400).json({ message: 'No ID given' })
    resu = await pool.request().query(`SELECT id FROM hourly_tracking WHERE id = ${id}`).catch(er => { return `Invalid ID` })
    if (resu == 'Invalid ID') return res.status(400).json({ message: 'Invalid ID or not found' })

    let hourly_tracking = await pool.request().query(`DELETE FROM hourly_tracking WHERE id = '${id}' AND user_id = '${uid}' AND date = '${getDate(date)}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (hourly_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Return Data
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