const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')
const newAssetStatusCode = require('../settings.json').newAssetStatusCode
const notifications = require('../lib/notifications')
const moment = require('moment')

const typeOfs = {
    asset: 'asset',
    notes: 'null',
    job: 'int',
    branch: 'null',
    time: 'time'
}
const typeOfToColumn = {
    asset: 'asset_id',
    notes: 'notes',
    job: 'job_code',
    branch: 'branch',
    time: 'time'
}

const allUserNonEditableFields = ['asset_id', 'status', 'model_number', 'watching', 'locked', 'hold_type']

Router.get('/user', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    // Get date from header
    let date = req.query.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data
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

    for (let ind in data.records) {
        let i = data.records[ind]
        let q = await pool.request().query(`SELECT model_number FROM assets WHERE id = '${i.asset_id}'`)
        if (!q.recordset[0]) continue
        let q2 = await pool.request().query(`SELECT image FROM models WHERE model_number = '${q.recordset[0].model_number}'`)
        data.records[ind].image = q2.recordset[0].image
    }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/user/new', async (req, res) => {
    // Get UID from header
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })

    // Get Params
    const data = req.body;
    let { date, job_code, asset_id, notes, multiple, branch } = data

    // Check if editing others
    if (data.uid) {
        if (!isAdmin && !permissions.edit_others_worksheets) return res.status(401).json({ message: 'missing permission' })
        uid = data.uid
    }

    const commentArray = multiple && multiple.count ? Array(multiple.count).fill('') : [notes]
    let ti = 0
    if (multiple && multiple.count && multiple.split) for (let key in multiple.split) for (let _ in Array(multiple.split[key]).fill(0)) { commentArray[ti] = key; ti++ }

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
    if (branch) {
        if (branch.length > 15) {
            errored = true
            issues.push('Branch name too long')
        }
        branch = branch.toUpperCase()
    }

    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })

    // Valdiate Job Code
    let job_code_query = await pool.request().query(`SELECT * FROM jobs WHERE id = ${job_code}`)
        .catch(er => { return { isErrored: true, er: er } })
    if (job_code_query.isErrored) return res.status(500).json(job_code_query.er)
    if (!job_code_query.recordset || !job_code_query.recordset[0]) return res.status(400).json({ message: `Invalid job code '${job_code}'` })

    // Get Asset Info
    let asset_query = await pool.request().query(`SELECT id,locked,hold_type,model_number,status FROM assets WHERE id = '${asset_id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (asset_query.isErrored) return res.status(500).json(asset_query.er)
    if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(400).json({ message: `Asset id not found '${asset_id}'` })
    if (asset_query.recordset[0].locked) return res.status(403).json({ message: 'Asset is Locked' })

    // Check job code rules
    let ruleGroup = job_code_query.recordset[0].usage_rule_group
    if (ruleGroup && !data.ruleOverride) {
        let currentJobCode = await pool.request().query(`SELECT usage_rule_group FROM jobs WHERE id = '${asset_query.recordset[0].status}'`)
            .catch(er => { return { isErrored: true, er: er } })
        if (currentJobCode.isErrored) return res.status(500).json(currentJobCode.er)
        let currentJobType = currentJobCode.recordset[0].usage_rule_group
        let error = checkRuleGroup(ruleGroup, currentJobType, asset_id)

        if (error) {
            let previousRecord = await pool.request().query(`SELECT TOP 1 * FROM asset_tracking WHERE asset_id = '${asset_id}' ORDER BY CAST(date AS DATETIME) + CAST(time AS DATETIME) DESC`)
                .catch(er => { return { isErrored: true, er: er } })
            if (previousRecord.isErrored) return res.status(500).json(previousRecord.er)

            if (previousRecord.recordset.length) {
                let status
                previousRecord.recordset[0].job = await pool.request().query(`SELECT job_name,id FROM jobs WHERE id = '${previousRecord.recordset[0].job_code}'`).then(m => { status = m.recordset[0].id; return m.recordset[0].job_name })
                previousRecord.recordset[0].user = await pool.request().query(`SELECT name FROM users WHERE id = '${previousRecord.recordset[0].user_id}'`).then(m => m.recordset[0].name)

                currentJobCode = await pool.request().query(`SELECT usage_rule_group FROM jobs WHERE id = '${status}'`)
                currentJobType = currentJobCode.recordset[0].usage_rule_group
                error = checkRuleGroup(ruleGroup, currentJobType, asset_id)
                if (error) return res.status(400).json({ message: error, previousRecord: previousRecord.recordset.length ? previousRecord.recordset[0] : undefined, ruleViolation: true })
            } else return res.status(400).json({ message: error, previousRecord: previousRecord.recordset.length ? previousRecord.recordset[0] : undefined, ruleViolation: true })
        }
    }


    let model_query = await pool.request().query(`SELECT * FROM models WHERE model_number = '${asset_query.recordset[0].model_number}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (model_query.isErrored) return res.status(500).json(model_query.er)
    if (!model_query.recordset || !model_query.recordset[0]) return res.status(400).json({ message: `Invlaid model_number in asset id '${asset_id}'` })
    if (job_code_query.recordset[0].applies) {
        let compatable = false
        for (let i of job_code_query.recordset[0].applies.split(','))
            if (model_query.recordset[0].category.split(',').includes(i)) compatable = true
        if (!compatable) return res.status(400).json({ message: `Job code '${job_code}' does not apply to model '${asset_query.recordset[0].model_number}'` })
    }

    // Send to DB
    let result = await pool.request().query(`INSERT INTO asset_tracking ([user_id], [asset_id], [job_code], [date], [notes], [time]${branch ? ', [branch]' : ''}) VALUES ${commentArray.map(m => `('${uid}', '${asset_id}', '${job_code}', '${date}', ${m ? `'${m}'` : 'null'}, CONVERT(TIME, CURRENT_TIMESTAMP)${branch ? `, '${branch}'` : ''})`).join(', ')}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(401).json({ message: 'Unsuccessful', error: result.error })
    }

    // Check to see if asset is being watched
    let watching = ruleGroup == 'chkn' ? await pool.request().query(`SELECT watching FROM assets WHERE id = '${asset_id}'`).then(r => r.recordset[0].watching) : undefined
    if (watching) watching = await pool.request().query(`SELECT name FROM users WHERE id IN (${watching})`).then(r => r.recordset.map(m => m.name))

    // Ack Success
    res.status(200).json({ message: 'Success', watching: watching || undefined })

    // If branch, update asset location
    if (branch && ruleGroup == 'ship') {
        let update = await pool.request().query(`UPDATE assets SET location = '${branch}' WHERE id = '${asset_id}'`)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (update.isErrored) {
            console.log(update.error)
        }
    }

    // If checkin job code, set location to In-House
    if (ruleGroup == 'chkn') pool.request().query(`UPDATE assets SET location = 'In-House' WHERE id = '${asset_id}'`)

    // If decom job code, set location to In-House
    if (ruleGroup == 'decom') pool.request().query(`UPDATE assets SET location = 'DECOMMISSIONED', locked = 1 WHERE id = '${asset_id}'`)

    // Edit asset and set status
    pool.request().query(`UPDATE assets SET status = '${job_code}' WHERE id = '${asset_id}'`)

    // If date !== today, send notification
    if (date && date !== new Date().toISOString().split('T')[0]) notifications.historicChangeNotify(`New asset tracking record for asset: ''${asset_id}'' to status ''${job_code_query.recordset[0].job_name}''`, uid, date)

    // Mark as returned in rff list
    pool.request().query(`UPDATE rff SET returned = 1 WHERE asset_id = '${asset_id}' AND returned = 0`)

    // Send notification if asset is being watched
    notifications.notify(req.headers.authorization, asset_id, job_code_query.recordset[0].job_name || job_code)
    if (asset_query.recordset[0].hold_type) notifications.hold_notify(asset_id, job_code_query.recordset[0].job_name || job_code)

    // Send notification if a checkin and the last update was less than 7 days ago
    if (ruleGroup == 'chkn') {
        let lastUpdate = await pool.request().query(`SELECT TOP 2 date FROM asset_tracking WHERE asset_id = '${asset_id}' ORDER BY date DESC`)
        if (lastUpdate.recordset.length == 2) {
            let lastUpdateDate = new Date(lastUpdate.recordset[1].date)
            let today = new Date()
            if (today - lastUpdateDate < 604800000) notifications.checkinNotify(asset_id, job_code_query.recordset[0].job_name || job_code, uid, lastUpdateDate)
        }
    }

    // Notify if this was overriden
    if (data.ruleOverride) {
        let user = await pool.request().query(`SELECT name FROM users WHERE id = '${uid}'`)
        notifications.notifyOverride(user.recordset[0].name, asset_id, job_code_query.recordset[0].job_name || job_code)
    }
})

Router.post('/user/edit', async (req, res) => {
    // Get UID from header
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })

    // Get Params
    const { id, change, value } = req.body;
    let asset_id

    // Check if editing others
    if (req.body.uid) {
        if (!isAdmin && !permissions.edit_others_worksheets) return res.status(401).json({ message: 'missing permission' })
        uid = req.body.uid
    }

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
        case 'time':
            if (!value || value.replace(/\d{2}:\d{2}/g, '') !== '') {
                errored = true;
                issues.push('Invalid Time format')
            }
            break
    }
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })
    if (!typeOfToColumn[change]) return res.status(500).json({ message: 'Unsuccessful', issues: 'Unknown column name to change' })

    // Get asset ID
    let asset_tracker_to_id_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (asset_tracker_to_id_query.isErrored) return res.status(500).json(asset_tracker_to_id_query.er)
    if (!asset_tracker_to_id_query.recordset || !asset_tracker_to_id_query.recordset[0]) return res.status(500).json({ message: `Asset id not found in history of '${id}'` })

    let branch = asset_tracker_to_id_query.recordset[0].branch
    let jc = asset_tracker_to_id_query.recordset[0].job_code

    asset_id = asset_tracker_to_id_query.recordset[0].asset_id
    let usageRuleGroup
    // Valdiate Job Code
    if (change == 'job') {
        // Get Job code Info
        let job_code_query = await pool.request().query(`SELECT * FROM jobs WHERE id = ${value}`)
            .catch(er => { return { isErrored: true, er: er } })
        if (job_code_query.isErrored) return res.status(500).json(job_code_query.er)
        if (!job_code_query.recordset || !job_code_query.recordset[0]) return res.status(400).json({ message: `Invalid job code '${value}'` })

        // Get Asset Info
        let asset_query = await pool.request().query(`SELECT id,locked,model_number,status FROM assets WHERE id = '${asset_id}'`)
            .catch(er => { return { isErrored: true, er: er } })
        if (asset_query.isErrored) return res.status(500).json(asset_query.er)
        if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(400).json({ message: `Asset id not found '${asset_id}'` })
        if (asset_query.recordset[0].locked) return res.status(403).json({ message: 'Asset is Locked' })

        // Check job code rules
        let ruleGroup = job_code_query.recordset[0].usage_rule_group
        usageRuleGroup = ruleGroup
        if (ruleGroup && !req.body.ruleOverride) {
            let currentJobCode = await pool.request().query(`SELECT usage_rule_group FROM jobs WHERE id = '${asset_query.recordset[0].status}'`)
                .catch(er => { return { isErrored: true, er: er } })
            if (currentJobCode.isErrored) return res.status(500).json(currentJobCode.er)
            let currentJobType = currentJobCode.recordset[0].usage_rule_group
            let error = checkRuleGroup(ruleGroup, currentJobType, asset_id)

            if (error) {
                let previousRecord = await pool.request().query(`SELECT TOP 1 * FROM asset_tracking WHERE asset_id = '${asset_id}' ORDER BY CAST(date AS DATETIME) + CAST(time AS DATETIME) DESC`)
                    .catch(er => { return { isErrored: true, er: er } })
                if (previousRecord.isErrored) return res.status(500).json(previousRecord.er)

                if (previousRecord.recordset.length) {
                    let status
                    previousRecord.recordset[0].job = await pool.request().query(`SELECT job_name,id FROM jobs WHERE id = '${previousRecord.recordset[0].job_code}'`).then(m => { status = m.recordset[0].id; return m.recordset[0].job_name })
                    previousRecord.recordset[0].user = await pool.request().query(`SELECT name FROM users WHERE id = '${previousRecord.recordset[0].user_id}'`).then(m => m.recordset[0].name)

                    currentJobCode = await pool.request().query(`SELECT usage_rule_group FROM jobs WHERE id = '${status}'`)
                    currentJobType = currentJobCode.recordset[0].usage_rule_group
                    error = checkRuleGroup(ruleGroup, currentJobType, asset_id)
                    console.log(error)
                    if (error) return res.status(400).json({ message: error, previousRecord: previousRecord.recordset.length ? previousRecord.recordset[0] : undefined, ruleViolation: true })
                } else return res.status(400).json({ message: error, previousRecord: previousRecord.recordset.length ? previousRecord.recordset[0] : undefined, ruleViolation: true })
            }
        }

        let model_query = await pool.request().query(`SELECT * FROM models WHERE model_number = '${asset_query.recordset[0].model_number}'`)
            .catch(er => { return { isErrored: true, er: er } })

        if (model_query.isErrored) return res.status(500).json(model_query.er)
        if (!model_query.recordset || !model_query.recordset[0]) return res.status(400).json({ message: `Invlaid model_number in asset id '${id}'` })
        if (job_code_query.recordset[0].applied) {
            let compatable = false
            for (let i of job_code_query[0].applies.split(','))
                if (model_query.recordset[0].category.split(',').includes(i)) compatable = true
            if (!compatable) return res.status(400).json({ message: `Job code '${value}' is not compatable with model '${asset_query.recordset[0].model_number}'` })
        }

        // if usage rule group is ship and branch is set, update asset location
        if (ruleGroup == 'ship' && branch) {
            let asset_update = await pool.request().query(`UPDATE assets SET location = '${branch}' WHERE id = '${asset_id}'`)
                .catch(er => { return { isErrored: true, er: er } })
            if (asset_update.isErrored) return res.status(500).json(asset_update.er)
        }
    }
    else if (change == 'asset') {
        // Validate asset exists and isnt locked
        let asset_query = await pool.request().query(`SELECT id,locked,status FROM assets WHERE id = '${value}'`)
            .catch(er => { return { isErrored: true, er: er } })
        if (asset_query.isErrored) return res.status(500).json(asset_query.er)
        if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(400).json({ message: `Asset id not found '${value}'` })
        if (asset_query.recordset[0].locked) return res.status(403).json({ message: 'Asset is Locked' })

        // Get current jobcode
        let currentJobCode = await pool.request().query(`SELECT job_code FROM asset_tracking WHERE id = '${id}'`).then(m => m.recordset[0].job_code)
        let job_code_query = await pool.request().query(`SELECT usage_rule_group FROM jobs WHERE id = ${currentJobCode}`)

        // Check job code rules
        let ruleGroup = job_code_query.recordset[0].usage_rule_group
        if (ruleGroup && !req.body.ruleOverride) {
            let currentJobCode = await pool.request().query(`SELECT usage_rule_group FROM jobs WHERE id = '${asset_query.recordset[0].status}'`)
                .catch(er => { return { isErrored: true, er: er } })
            if (currentJobCode.isErrored) return res.status(500).json(currentJobCode.er)
            let currentJobType = currentJobCode.recordset[0].usage_rule_group
            let error = checkRuleGroup(ruleGroup, currentJobType, asset_id)

            if (error) {
                let previousRecord = await pool.request().query(`SELECT TOP 1 * FROM asset_tracking WHERE asset_id = '${value}' ORDER BY CAST(date AS DATETIME) + CAST(time AS DATETIME) DESC`)
                    .catch(er => { return { isErrored: true, er: er } })

                if (previousRecord.isErrored) return res.status(500).json(previousRecord.er)

                if (previousRecord.recordset.length) {
                    previousRecord.recordset[0].job = await pool.request().query(`SELECT job_name FROM jobs WHERE id = '${previousRecord.recordset[0].job_code}'`).then(m => m.recordset[0].job_name)
                    previousRecord.recordset[0].user = await pool.request().query(`SELECT name FROM users WHERE id = '${previousRecord.recordset[0].user_id}'`).then(m => m.recordset[0].name)
                }

                return res.status(400).json({ message: error, previousRecord: previousRecord.recordset.length ? previousRecord.recordset[0] : undefined, ruleViolation: true })
            }
        }
    }
    else if (change == 'branch') {
        // If usage rule group is ship, update asset location to change
        let jc_usage = await pool.request().query(`SELECT usage_rule_group FROM jobs WHERE id = '${jc}'`).then(r => r.recordset[0]).catch(er => { console.log(er); return undefined })
        if (jc_usage && jc_usage == 'ship') {
            let asset_update = await pool.request().query(`UPDATE assets SET location = '${value.toUpperCase()}' WHERE id = '${asset_id}'`)
                .catch(er => { return { isErrored: true, er: er } })
            if (asset_update.isErrored) console.log(asset_update.er)
        }
    }

    // Send to DB
    let result = await pool.request().query(`UPDATE asset_tracking SET ${typeOfToColumn[change]} = '${change == 'branch' ? value.toUpperCase() : value}' WHERE id = '${id}' AND user_id = '${uid}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(400).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    res.status(200).json({ message: 'Success' })

    // Edit asset and set status
    if (change == 'job') {
        let previousRecord = await pool.request().query(`SELECT TOP 1 * FROM asset_tracking WHERE asset_id = '${asset_id}' ORDER BY CAST(date AS DATETIME) + CAST(time AS DATETIME) DESC`).then(m => m.recordset[0]).catch(er => { return undefined })
        if (previousRecord && previousRecord.job_code) pool.request().query(`UPDATE assets SET status = '${previousRecord.job_code}' WHERE id = '${asset_id}'`)
        if (previousRecord.id == id) {
            if (usageRuleGroup == 'chkn') pool.request().query(`UPDATE assets SET location = 'In-House' WHERE id = '${asset_id}'`)

            let status_name_query = await pool.request().query(`SELECT job_name FROM jobs WHERE id = ${value}`)
                .catch(er => { return { isErrored: true, er: er } })
            if (status_name_query.isErrored) return

            notifications.notify(req.headers.authorization, asset_id, status_name_query && status_name_query.recordset[0] ? status_name_query.recordset[0].job_name : job_code)
        }
    }
    if (change == 'asset') {
        // Update old assets status to previous
        let previousRecord = await pool.request().query(`SELECT TOP 1 * FROM asset_tracking WHERE asset_id = '${asset_id}' ORDER BY CAST(date AS DATETIME) + CAST(time AS DATETIME) DESC`).then(m => m.recordset[0].job_code).catch(er => { return undefined })
        if (previousRecord) pool.request().query(`UPDATE assets SET status = '${previousRecord}' WHERE id = '${asset_id}'`)

        // Update new assets status to new
        let currentJobCode = await pool.request().query(`SELECT TOP 1 * FROM asset_tracking WHERE id = '${id}' ORDER BY CAST(date AS DATETIME) + CAST(time AS DATETIME) DESC`).then(m => m.recordset[0].job_code).catch(er => { return undefined })
        if (currentJobCode) pool.request().query(`UPDATE assets SET status = '${currentJobCode}' WHERE id = '${value}'`)
        let jobName = await pool.request().query(`SELECT TOP 1 job_name FROM jobs WHERE id = '${currentJobCode}'`).then(m => m.recordset[0].job_name).catch(er => undefined)
        notifications.notify(req.headers.authorization, value, jobName || currentJobCode)

        // If this has a branch, and the new asset has a ship rule, update the branch
        if (branch) {
            let jc_usage = await pool.request().query(`SELECT usage_rule_group FROM jobs WHERE id = '${jc}'`).then(r => r.recordset[0]).catch(er => { console.log(er); return undefined })
            if (jc_usage && jc_usage == 'ship') {
                let asset_update = await pool.request().query(`UPDATE assets SET location = '${branch}' WHERE id = '${value}'`)
                    .catch(er => { return { isErrored: true, er: er } })
                if (asset_update.isErrored) console.log(asset_update.er)
            }
        }
    }

    // Mark as returned in rff list
    pool.request().query(`UPDATE rff SET returned = 1 WHERE asset_id = '${change == 'asset' ? value : asset_id}' AND returned = 0`)

    // If historical change, send notification
    if (getDate(asset_tracker_to_id_query.recordset[0].date) != new Date().toISOString().split('T')[0])
        notifications.historicChangeNotify(`Asset Tracking Record Edited, Change: ''${change}'' | Changed To: ''${value}''`, uid, getDate(asset_tracker_to_id_query.recordset[0].date))

})

Router.delete('/user/del', async (req, res) => {
    // Get UID from header
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })

    // Get Params
    const id = req.query.id
    const date = req.query.date
    if (req.query.uid) {
        if (!isAdmin && !permissions.edit_others_worksheets) return res.status(401).json({ message: 'missing permission' })
        uid = req.query.uid
    }

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Data validation for UID. Check for UID, and Check if UID exists
    if (!uid || uid == '') return res.status(400).json({ code: 400, message: 'No UID given' })
    let resu = await pool.request().query(`SELECT id FROM users WHERE id = ${uid}`).catch(er => { return `Invalid UID` })
    if (resu == 'Invalid UID') return res.status(400).json({ code: 400, message: 'Invalid UID or not found' })

    if (!id || id == '') return res.status(400).json({ code: 400, message: 'No ID given' })
    resu = await pool.request().query(`SELECT id FROM asset_tracking WHERE id = ${id}`).catch(er => { return `Invalid ID` })
    if (resu == 'Invalid ID') return res.status(400).json({ code: 400, message: 'Invalid ID or not found' })

    let info = await pool.request().query(`SELECT * from asset_tracking WHERE id = ${id}`).then(m => m.recordset[0])

    let asset_tracking = await pool.request().query(`DELETE FROM asset_tracking WHERE id = '${id}' AND user_id = '${uid}' AND date = '${getDate(date)}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Return Data
    res.status(200).json({ message: 'Success' })

    // Update old assets status to previous
    let previousRecord = await pool.request().query(`SELECT TOP 1 * FROM asset_tracking WHERE asset_id = '${info.asset_id}' ORDER BY CAST(date AS DATETIME) + CAST(time AS DATETIME) DESC`).then(m => m.recordset[0].job_code)
        .catch(er => { return undefined })
    if (previousRecord) pool.request().query(`UPDATE assets SET status = '${previousRecord}' WHERE id = '${info.asset_id}'`)

    // If historical data, send notificaiton
    if (date !== new Date().toISOString().split('T')[0]) notifications.historicChangeNotify(`Asset Tracking Record Deleted`, uid, date)

})

Router.get('/fetch', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    //Get date from header
    let id = req.query.id

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data


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
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

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

Router.get('/get', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    //Get date from header
    const search = req.query.q

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data
    let asset_query = await pool.request().query(`SELECT * FROM assets WHERE id = '${search}' OR notes LIKE '%${search}%' or mobile_number LIKE '%${search}%' or icc_id LIKE '%${search}%' or return_reason LIKE '%${search}%'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    let u_q = await pool.request().query(`SELECT id,name FROM users`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (u_q.isErrored) return res.status(500).json({ message: 'Error', error: u_q.error })

    let usernames = {}
    for (let i of u_q) usernames[i.id] = i.name

    // Organize Data
    let resu = []
    for (let i of asset_query.recordset) {
        let r
        r = { type: 'asset', info: i }

        // Asset Status History Query
        let history_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE asset_id = '${r.info.id}' ORDER BY CAST(date AS DATETIME) + CAST(time AS DATETIME) DESC`).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (history_query.isErrored) { return res.status(500).json({ message: 'Asset History Query Error' }) }

        if (!history_query.isErrored && history_query.recordset.length > 0) {
            let his = []
            for (let i of history_query.recordset) {
                let name = usernames[i.user_id] || `UID: ${i.user_id}`
                his.push({ name, job_code: i.job_code, date: i.date, time: i.time, id: i.id, notes: i.notes, branch: i.branch })
            }
            r.history = his
        }

        // Repair History Query
        let repair_query = await pool.request().query(`SELECT * FROM parts WHERE location = '${r.info.id}' ORDER BY used_on DESC`)
            .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, er } })
        if (!repair_query.isErrored && repair_query.length) {
            let his = []
            for (let i of repair_query) {
                let name = usernames[i.used_by]
                let part_info_query = await pool.request().query(`SELECT * FROM part_list WHERE id = '${i.part_id}'`)
                    .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
                if (part_info_query.isErrored) continue
                his.push({ tech: name, ...i, part_type: part_info_query[0].part_type, part_number: part_info_query[0].part_number })
            }
            r.repairs = his
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

        if (id == '.') continue

        let aq = await pool.request().query(`SELECT * FROM assets WHERE id = '${id}'`)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (aq.isErrored) {
            // Check for specific errors

            // If no errors above, return generic Invalid UID Error
            return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })
        }
        if (aq.recordset.length == 0) continue;
        let r = { type: 'tracker', info: aq.recordset[0] }

        let hq = await pool.request().query(`SELECT * FROM asset_tracking WHERE asset_id = '${r.info.id}' ORDER BY CAST(date AS DATETIME) + CAST(time AS DATETIME) DESC`).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (hq.isErrored) { return res.status(500).json({ message: 'Asset History Query Error' }) }
        if (!hq.isErrored && hq.recordset.length > 0) {
            let his = []
            for (let i of hq.recordset) {
                let name = usernames[i.user_id] || `UID: ${i.user_id}`
                his.unshift({ name, job_code: i.job_code, date: i.date, id: i.id, time: i.time, notes: i.notes })
            }
            r.history = his

            let repair_query = await pool.request().query(`SELECT * FROM parts WHERE location = '${r.info.id}' ORDER BY used_on DESC`)
                .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, er } })
            if (!repair_query.isErrored && repair_query.length) {
                let rhis = []
                for (let i of repair_query) {
                    let name = usernames[i.used_by]
                    let part_info_query = await pool.request().query(`SELECT * FROM part_list WHERE id = '${i.part_id}'`)
                        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
                    if (part_info_query.isErrored) continue
                    rhis.push({ tech: name, ...i, part_type: part_info_query[0].part_type, part_number: part_info_query[0].part_number })
                }
                r.repairs = rhis
            }
        }

        resu.push(r)
    }

    let model_query = await pool.request().query(`SELECT * FROM models WHERE model_number = '${search}' OR name = '${search}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (model_query.isErrored) return res.status(400).json({ code: 400, message: 'Invalid UID or not found, Asset Tracking Query Error' })

    for (let i of model_query.recordset) {
        let r = { type: 'model', info: i, assets: [] }
        r.info.isModel = true

        let aq = await pool.request().query(`SELECT * FROM assets WHERE model_number = '${i.model_number}'`).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (aq.isErrored) { return res.status(500).json({ message: 'Asset History Query Error' }) }

        if (!aq.isErrored && aq.recordset.length > 0) for (let i of aq.recordset) r.assets.push(i)

        resu.push(r)
    }

    if (resu.length === 0) resu = { notFound: true }

    // Return Data
    return res.status(200).json({ resu, uid })
})

Router.post('/edit', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    //Get date from header
    const { id, change, value } = req.body
    let val = value.replace("'", '')
    if (allUserNonEditableFields.includes(change.toLowerCase()) && !(permissions.edit_assets || isAdmin)) return res.status(400).json({ error: 'Cannot edit this field' })

    // Data validation
    let issues = []
    if (!id) issues.push('no asset id')
    if (!change) issues.push('no change type')

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // if change == model_number, validate the model number
    if (change == 'model_number') {
        let q = await pool.request().query(`SELECT model_number from models WHERE model_number = '${val}'`)
            .catch(er => { return { isErrored: true, error: er } })
        if (q.isErrored) return res.status(500).json({ message: 'failed to query model numbers', er: q.error })
        let found = false
        for (let i of q.recordset)
            if (i.model_number == val) found = true
        if (!found) issues.push('Model number doesnt exist')
    }

    // if change == company, verify it meets the companies array in settings
    if (change == 'company') {
        if (!require('../settings.json').deviceCompanies.includes(val)) return res.status(400).json({ message: 'Company Type invalid' })
    }

    if (issues.length > 0) return res.status(400).json(issues)

    // Get Data
    let asset_query = await sql.query(`UPDATE assets SET ${change} = '${val}' WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })

    if (asset_query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(500).json({ message: '' })
    }

    // Return Data
    return res.status(200).json({ message: 'success' })
})

Router.put('/create', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_assets) return res.status(403).json({ error: 'Permission denied' })

    // Get req body
    const { asset_id, model_id } = req.body

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

Router.patch('/rename', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_assets) return res.status(401).json({ error: 'Permission denied' })

    // Get req body
    const { oldName, newName } = req.body

    // Data validation
    if (!oldName || !newName) return res.status(400).json({ message: 'Missing Information' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Check to see if asset exists
    let asset_validation_query = await pool.request().query(`SELECT id FROM assets WHERE id = '${oldName}'`).catch(er => { return { isErrored: true, error: er } })
    if (asset_validation_query.isErrored) return res.status(500).json({ message: 'Error in asset validation query' })
    if (!asset_validation_query.recordset || asset_validation_query.recordset.length == 0) return res.status(400).json({ message: 'Asset does not exist' })

    // Check to see if new asset exists
    let asset_dupe_query = await pool.request().query(`SELECT id FROM assets WHERE id = '${newName}'`).catch(er => { return { isErrored: true, error: er } })
    if (asset_dupe_query.isErrored) return res.status(500).json({ message: 'Error in asset duplicate validation query' })
    if (asset_dupe_query.recordset && asset_dupe_query.recordset.length != 0) return res.status(400).json({ message: 'Asset already exists' })

    // Rename
    let rename_query = await pool.request().query(`UPDATE assets SET id = '${newName}' WHERE id = '${oldName}'`).catch(er => { return { isErrored: true, error: er } })
    if (rename_query.isErrored) return res.status(500).json(rename_query.error)
    return res.status(200).json({ message: 'Success' })
})

Router.post('/watch', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.watch_assets) return res.status(401).json({ error: 'Permission denied' })

    // Get data from header
    const { id } = req.body

    // Get current list of watching people on the asset
    let pool = await sql.connect(config)
    const current_list_query = await pool.request().query(`SELECT watching FROM assets WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (current_list_query.isErrored) return res.status(500).json({ er: current_list_query.er })
    if (!current_list_query.recordset || !current_list_query.recordset[0]) return res.status(400).json({ er: 'Asset not found' })

    // Add to list
    let newString = ''
    if (current_list_query.recordset[0].watching) newString = `${current_list_query.recordset[0].watching},${uid}`
    else newString = `${uid}`

    // Removes duplicates
    let s = new Set(newString.split(','))
    newString = [...s].map(m => m).join(',')

    // Send back
    const update_query = await pool.request().query(`UPDATE assets SET watching = '${newString}' WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (update_query.isErrored) return res.status(500).json({ er: update_query.er })

    return res.status(200).json({ message: 'success' })
})

Router.post('/unwatch', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.watch_assets) return res.status(401).json({ error: 'Permission denied' })

    // Get data from header
    const { id } = req.body

    // Get current list of watching people on the asset
    let pool = await sql.connect(config)
    const current_list_query = await pool.request().query(`SELECT watching FROM assets WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (current_list_query.isErrored) return res.status(500).json({ er: current_list_query.er })
    if (!current_list_query.recordset || !current_list_query.recordset[0]) return res.status(400).json({ er: 'Asset not found' })

    // Remove From List
    let newString = ''
    if (!current_list_query.recordset[0].watching || current_list_query.recordset[0].watching == uid) newString = ''
    else if (current_list_query.recordset[0].watching.includes(',')) {
        for (let i of current_list_query.recordset[0].watching.split(',')) {
            if (newString !== '') newstring += ','
            newString += i
        }
    }

    // Send back
    const update_query = await pool.request().query(`UPDATE assets SET watching = '${newString}' WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (update_query.isErrored) return res.status(500).json({ er: update_query.er })

    return res.status(200).json({ message: 'success' })
})

Router.post('/lock', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_assets) return res.status(401).json({ error: 'Permission denied' })

    // Get data from header
    const { id } = req.body

    // Get current list of watching people on the asset
    let pool = await sql.connect(config)

    // Ensure ID exists
    const validation_query = await pool.request().query(`SELECT id FROM assets WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (validation_query.isErrored) return res.status(500).json({ message: validation_query.er })
    if (validation_query.recordset.length > 1) return res.status(400).json({ message: 'Asset not found' })

    // Query
    const update_query = await pool.request().query(`UPDATE assets SET locked = '1' WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (update_query.isErrored) return res.status(500).json({ message: update_query.er })

    return res.status(200).json({ message: 'success' })
})

Router.post('/unlock', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_assets) return res.status(401).json({ error: 'Permission denied' })

    // Get data from header
    const { id } = req.body

    // Get current list of watching people on the asset
    let pool = await sql.connect(config)

    // Ensure ID exists
    const validation_query = await pool.request().query(`SELECT id FROM assets WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (validation_query.isErrored) return res.status(500).json({ message: validation_query.er })
    if (validation_query.recordset.length > 1) return res.status(400).json({ message: 'Asset not found' })

    // Query
    const update_query = await pool.request().query(`UPDATE assets SET locked = '0' WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (update_query.isErrored) return res.status(500).json({ message: update_query.er })

    return res.status(200).json({ message: 'success' })
})

Router.post('/unhold', async (req, res) => {
    // Get UID from header
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_assets) return res.status(401).json({ error: 'Permission denied' })

    // Get data from header
    const { id } = req.body

    // Get current list of watching people on the asset
    let pool = await sql.connect(config)

    // Ensure ID exists
    const validation_query = await pool.request().query(`SELECT id FROM assets WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (validation_query.isErrored) return res.status(500).json({ message: validation_query.er })
    if (validation_query.recordset.length > 1) return res.status(400).json({ message: 'Asset not found' })

    // Query
    console.log('q')
    const update_query = await pool.request().query(`UPDATE assets SET hold_type = null WHERE id = '${id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (update_query.isErrored) return res.status(500).json({ message: update_query.er })

    return res.status(200).json({ message: 'success' })
})

Router.get('/types', async (req, res) => {
    const { uid, isAdmin } = await tokenParsing.checkForAdmin(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin) return res.status(401).json({ error: 'Forbidden' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data


    let q = await pool.request().query(`SELECT TABLE_NAME,COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'assets'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(500).json({ code: 400, message: 'how' })
    }

    return res.status(200).json({ data: q.recordset })
})

Router.post('/alter', async (req, res) => {
    const { uid, isAdmin } = await tokenParsing.checkForAdmin(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin) return res.status(401).json({ error: 'Forbidden' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get column data
    const { COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE } = req.body

    let q = await pool.request().query(`ALTER TABLE assets ALTER COLUMN ${COLUMN_NAME} ${DATA_TYPE}${CHARACTER_MAXIMUM_LENGTH ? `(${CHARACTER_MAXIMUM_LENGTH})` : ''}${IS_NULLABLE ? ' NULL' : ''}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(500).json({ code: 400, message: `Bad query, ${`ALTER TABLE assets ALTER COLUMN ${COLUMN_NAME} ${DATA_TYPE}${CHARACTER_MAXIMUM_LENGTH ? `(${CHARACTER_MAXIMUM_LENGTH})` : ''}${IS_NULLABLE ? ' NULL' : ''}`}` })
    }

    return res.status(200).json({ data: 'Success' })
})

Router.delete('/alter', async (req, res) => {
    const { uid, isAdmin } = await tokenParsing.checkForAdmin(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin) return res.status(401).json({ error: 'Forbidden' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get column to delete from params
    const column = req.query.column

    let q = await pool.request().query(`ALTER TABLE assets DROP COLUMN ${column}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(500).json({ code: 400, message: `Bad query, ${`ALTER TABLE assets DROP COLUMN ${column}`}` })
    }

    return res.status(200).json({ data: 'Success' })
})

Router.put('/alter', async (req, res) => {
    const { uid, isAdmin } = await tokenParsing.checkForAdmin(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin) return res.status(401).json({ error: 'Forbidden' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get column data
    const { COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE } = req.body

    let q = await pool.request().query(`ALTER TABLE assets ADD ${COLUMN_NAME} ${DATA_TYPE}${CHARACTER_MAXIMUM_LENGTH ? `(${CHARACTER_MAXIMUM_LENGTH})` : ''}${IS_NULLABLE ? ' NULL' : ''}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(500).json({ code: 400, message: `Bad query, ${`ALTER TABLE assets ALTER COLUMN ${COLUMN_NAME} ${DATA_TYPE}${CHARACTER_MAXIMUM_LENGTH ? `(${CHARACTER_MAXIMUM_LENGTH})` : ''}${IS_NULLABLE ? ' NULL' : ''}`}` })
    }

    return res.status(200).json({ data: 'Success' })
})

Router.get('/locations', async (req, res) => {
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_branches) return res.status(403).json({ error: 'Permission denied' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data
    let q = await pool.request().query(`SELECT location FROM assets`).then(r => r.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'how' })
    q = q.map(r => r.location.toUpperCase())

    let locations = {}

    for (let i of q) if (!locations[i]) locations[i] = 1; else locations[i]++

    return res.status(200).json({ data: locations })
})

Router.post('/locations', async (req, res) => {
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_branches) return res.status(403).json({ error: 'Permission denied' })

    // Get Location from body
    const { location } = req.body

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data
    let q = await pool.request().query(`SELECT id,status,model_number FROM assets WHERE location = '${location}'`).then(r => r.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'how' })

    let jc = await pool.request().query(`SELECT job_name,id FROM jobs`).then(r => r.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (jc.isErrored) return res.status(500).json({ message: 'how' })

    let jobs = {}
    for (let i of jc) jobs[i.id] = i.job_name
    for (let i of q) i.status = jobs[i.status]

    return res.status(200).json({ data: q })
})

Router.get('/overview', async (req, res) => {
    // Check to see if user can use route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_reports) return res.status(403).json({ error: 'Permission denied' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Assets
    let assets = await pool.request().query(`SELECT * FROM assets`).then(r => r.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (assets.isErrored) return res.status(500).json({ message: 'how' })

    let deployCodes = new Set([45, 46, 49, 92, 94, 95, 109, 113, 114, 119, 120])
    let overview = []
    overview.push({ name: 'Total Assets', value: assets.length })
    overview.push({ name: 'Estimated In-House', value: assets.filter(a => a.location.toLowerCase() == 'in-house').length })
    overview.push({ name: 'Deployed', value: assets.filter(a => deployCodes.has(a.status)).length })
    overview.push({ name: 'Decommisioned', value: assets.filter(a => a.location.toUpperCase() == 'DECOMMISSIONED').length })

    // Get customReportOptions
    let customReportOptions = { attributes: [], status: [], type: [], last_updated: ['All Time', 'Today', 'Since Yesterday', 'Past Week', 'Past 2 Weeks', 'Past Month', 'Past 2 Months', 'Past 3 Months', 'Past 6 Months', 'Past Year', 'Past 2 Years'], location: [], locked: ['Yes', 'No'], user: [] }
    customReportOptions.attributes = Object.keys(assets[0])

    // Get Statuses
    let jobs = await pool.request().query(`SELECT id,job_name FROM jobs`).then(r => r.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (jobs.isErrored) return res.status(500).json({ message: 'how' })
    customReportOptions.status = jobs.map(i => `${i.job_name} \ (${i.id})`)

    // Get Types
    customReportOptions.type = require('../settings.json').deviceTypes

    // Get Locations
    let locations = await pool.request().query(`SELECT id FROM branches`).then(r => r.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (locations.isErrored) return res.status(500).json({ message: 'how' })
    locations = locations.map(i => i.id)
    locations.sort()
    locations = new Set(locations)
    locations.delete('In-House')
    locations.delete('Unknown')
    locations.delete('COR')
    locations.delete('Decommissioned')
    customReportOptions.location = ['In-House', 'Unknown', 'Decommissioned', 'COR', ...locations]

    // Get Users
    let users = await pool.request().query(`SELECT name,id FROM users`).then(r => r.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (users.isErrored) return res.status(500).json({ message: 'how' })
    customReportOptions.user = users.map(i => `${i.name} \ (${i.id})`)

    return res.status(200).json({ overview, customReportOptions })
})

Router.post('/report', async (req, res) => {
    // Check to see if user can use route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_reports) return res.status(403).json({ error: 'Permission denied' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Report Options from body
    const { attributes, status, type, last_updated, location, locked, user } = req.body

    // Get Assets
    let filters = [status && status.length ? { val: status, name: 'status' } : undefined, location && location.length ? { val: location, name: 'location' } : undefined, locked && locked.length == 1 ? { val: [locked.map(m => m == 'Yes' ? 1 : 0)], name: 'locked' } : undefined].filter(i => i)
    let assets = await pool.request().query(`SELECT ${attributes && attributes.length ? [...new Set([...attributes, 'model_number'])].join(', ') : '*'} FROM assets${filters.length ? ` WHERE ${filters.map(f => `(${f.val.map(m => `${f.name} = '${m}'`).join(' OR ')})`).join(' AND ')}` : ''}`).then(r => r.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (assets.isErrored) return res.status(500).json({ message: 'how' })

    // Filter by type
    if (type && type.length) {
        let models = await pool.request().query(`SELECT model_number,category FROM models WHERE model_number != 'Misc'`).then(r => r.recordset)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (models.isErrored) return res.status(500).json({ message: 'how' })
        let modelMap = {}
        for (let i of models) modelMap[i.model_number.toLowerCase().trim()] = new Set(i.category.split(',').map(m => m.toLowerCase().trim()))
        console.log(assets.length)
        assets = assets.filter(i => type.some(t => modelMap[i.model_number.toLowerCase().trim()].has(t.toLowerCase().trim())))
        console.log(assets.length)
    }

    // Filter by last_updated
    if (last_updated && last_updated.length) {
        let days
        let lastUpdated = new Set(last_updated)
        if (lastUpdated.has('Today')) days = 0
        else if (lastUpdated.has('Since Yesterday')) days = 1
        else if (lastUpdated.has('Past Week')) days = 7
        else if (lastUpdated.has('Past 2 Weeks')) days = 14
        else if (lastUpdated.has('Past Month')) days = 30
        else if (lastUpdated.has('Past 2 Months')) days = 60
        else if (lastUpdated.has('Past 3 Months')) days = 90
        else if (lastUpdated.has('Past 6 Months')) days = 180
        else if (lastUpdated.has('Past Year')) days = 365
        else if (lastUpdated.has('Past 2 Years')) days = 730
        else if (lastUpdated.has('All Time')) days = -1
        let asset_tracking = await pool.request().query(`SELECT asset_id,updated = CAST(date AS DATETIME) + CAST(time AS DATETIME) FROM asset_tracking${days >= 0 ? ` WHERE date >= '${moment().subtract(days, 'days').format('YYYY-MM-DD')}'` : ''}`).then(r => r.recordset)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (asset_tracking.isErrored) return res.status(500).json({ message: 'how' })
        let updatedAssets = new Set(asset_tracking.map(i => i.asset_id.toLowerCase().trim()))
        assets = assets.filter(i => updatedAssets.has(i.id.toLowerCase().trim()))

        // Add latest update to assets
        let latestUpdates = {}
        for (let i of asset_tracking) {
            if (!latestUpdates[i.asset_id.toLowerCase().trim()]) latestUpdates[i.asset_id.toLowerCase().trim()] = i
            else if (moment(i.updated).isAfter(moment(latestUpdates[i.asset_id.toLowerCase().trim()].updated))) latestUpdates[i.asset_id.toLowerCase().trim()] = i
        }
        for (let i of assets) i.latest_update = latestUpdates[i.id.toLowerCase().trim()].updated
    }

    if (user && user.length) {
        let asset_tracking = await pool.request().query(`SELECT asset_id,id,user_id FROM asset_tracking WHERE ${user.map(m => `user_id = '${m}'`).join(' OR ')}`).then(r => r.recordset)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (asset_tracking.isErrored) return res.status(500).json({ message: 'how' })

        let assetTrackingAssets = new Set(asset_tracking.map(i => i.asset_id.toLowerCase().trim()))
        assets = assets.filter(i => assetTrackingAssets.has(i.id.toLowerCase().trim()))

        // Add list of users who updated asset
        let names = await pool.request().query(`SELECT id,name FROM users`).then(r => r.recordset)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (names.isErrored) return res.status(500).json({ message: 'how' })
        let nameMap = {}
        for (let i of names) nameMap[i.id] = i.name
        let assetsUpdatedBy = {}
        for (let i of asset_tracking) {
            if (!assetsUpdatedBy[i.id]) assetsUpdatedBy[i.asset_id.toLowerCase().trim()] = new Set()
            assetsUpdatedBy[i.asset_id.toLowerCase().trim()].add(nameMap[i.user_id])
        }
        for (let i of assets) i.users = [...assetsUpdatedBy[i.id.toLowerCase().trim()]].join(', ')

    }

    return res.status(200).json({ assets })
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

function checkRuleGroup(ruleGroup, currentJobType, asset_id) {
    switch (ruleGroup) {
        case 'chkn':
            if (currentJobType !== 'ship' && currentJobType !== 'new') return `Asset ${asset_id} is not at shipped/new status and can't be checked in`
            if (currentJobType == 'chkn') return `Asset ${asset_id} is already at a check-in status and can't be checked in again`
            break
        case 'ship':
            if (currentJobType == 'ckhn') return `Asset ${asset_id} is at ckhn status and can't be shipped until deployed`
            if (currentJobType == 'ship') return `Asset ${asset_id} is at shipped status and can't be shipped again`
            break
        case 'deploy':
            if (currentJobType == 'ship') return `Asset ${asset_id} is in a ship status and can't be deployed until checked in`
            if (currentJobType == 'deploy') return `Asset ${asset_id} is already at a deploy status and can't be deployed again`
            break
        case 'work':
            if (currentJobType == 'ship') return `Asset ${asset_id} is in a ship status and can't be worked on until checked in`
            if (currentJobType == 'new') return `Asset ${asset_id} is in a new status and can't be worked on until checked in`
            break;
        default:
            console.log(`Default case hit for ${ruleGroup} rulegroup`)
    }
    return undefined
}