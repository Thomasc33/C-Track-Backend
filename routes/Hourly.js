const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')
const notifications = require('../lib/notifications')

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
    let { date, job_code, startTime, endTime, notes, in_progress } = data
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
    if (!job_code || (typeof (job_code) == 'string' && job_code.replace(/\d/gi, '') !== '')) {
        errored = true
        issues.push('Invalid Job Code or Job Code not type Int')
    }

    // Get total hours
    let total_hours = getTotalHours(`${date} ${startTime}`, `${date} ${endTime}`)

    // Return if there was an error
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })

    // Send to DB
    let result = await pool.request().query(`INSERT INTO hourly_tracking (job_code, user_id, start_time, end_time, notes, hours, date, in_progress) VALUES ('${job_code}', '${uid}', '${startTime}', '${endTime}', ${notes ? `'${notes}'` : 'null'}, '${total_hours}', '${date}', '${in_progress ? '1' : '0'}')`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(500).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    res.status(200).json({ message: 'Success' })

    if (getDate(date) !== new Date().toISOString().split('T')[0]) {
        let jc_name = await pool.request().query(`SELECT job_name FROM jobs WHERE id = '${job_code}'`).then(r => r.recordset[0].job_name).catch(er => 'Unknown')
        notifications.historicChangeNotify(`New hourly tracking record for: ''${jc_name}''`, uid, date)
    }
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

    // validate total hours
    let hq = await pool.request().query(`SELECT hours,start_time,end_time FROM hourly_tracking WHERE id = '${id}' AND user_id = '${uid}'`)
        .catch(er => console.log(er)).then(r => r.recordset[0])
    let calc_hours = getTotalHours(hq.start_time, hq.end_time)
    if (calc_hours !== hq.hours) await pool.request().query(`UPDATE hourly_tracking SET hours = '${calc_hours}' WHERE id = '${id}' AND user_id = '${uid}'`).catch(er => console.log(er))


    // Return
    res.status(200).json({ message: 'Success' })

    let old_data = await pool.request().query(`SELECT * FROM hourly_tracking WHERE id = '${id}'`).then(r => r.recordset[0]).catch(er => { return { errored: true, er } })

    if (getDate(old_data.date) != new Date().toISOString().split('T')[0]) {
        notifications.historicChangeNotify(`Hourly Tracking Record Edited, Change: ''${change}'' | Changed To: ''${value}''`, uid, getDate(old_data.date))
    }
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
    if (hourly_tracking.isErrored) return res.status(400).json({ message: 'Invalid UID or not found, Asset Tracking Query Error' })


    // Return Data
    res.status(200).json({ message: 'Success' })

    if (date !== getDate(Date.now())) notifications.historicChangeNotify(`Hourly Tracking Record Deleted`, uid, date)
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

function getTotalHours(start, end) {
    let start_date = new Date(start)
    let end_date = new Date(end)
    let total_hours = end_date - start_date
    total_hours = total_hours / 1000 / 60 / 60
    return total_hours
}