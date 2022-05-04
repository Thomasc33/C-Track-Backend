const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')
const newAssetStatusCode = require('../settings.json').newAssetStatusCode
const notifications = require('../lib/notifications')

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
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    //Get date from header
    let date = req.params.date

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
    let { date, job_code, asset_id, notes, multiple } = data

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
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })

    // Valdiate Job Code
    let job_code_query = await pool.request().query(`SELECT * FROM jobs WHERE id = ${job_code}`)
        .catch(er => { return { isErrored: true, er: er } })
    if (job_code_query.isErrored) return res.status(500).json(job_code_query.er)
    if (!job_code_query.recordset || !job_code_query.recordset[0]) return res.status(400).json({ message: `Invalid job code '${job_code}'` })

    let asset_query = await pool.request().query(`SELECT id,locked,hold_type FROM assets WHERE id = '${asset_id}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (asset_query.isErrored) return res.status(500).json(asset_query.er)
    if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(400).json({ message: `Asset id not found '${asset_id}'` })
    if (asset_query.recordset[0].locked) return res.status(403).json({ message: 'Asset is Locked' })

    let model_query = await pool.request().query(`SELECT * FROM models WHERE model_number = '${asset_query.recordset[0].model_number}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (model_query.isErrored) return res.status(500).json(model_query.er)
    if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(400).json({ message: `Invlaid model_number in asset id '${asset_id}'` })
    // if (job_code_query.recordset[0].applies && !job_code_query.recordset[0].applies.split(',').includes(asset_query.recordset[0].category)) return res.status(403).json({ message: 'Job code doesnt apply to model type' })

    // Send to DB
    let result = await pool.request().query(`INSERT INTO asset_tracking ([user_id], [asset_id], [job_code], [date], [notes], [time]) VALUES ${commentArray.map(m => `('${uid}', '${asset_id}', '${job_code}', '${date}', ${m ? `'${m}'` : 'null'}, CONVERT(TIME, CURRENT_TIMESTAMP))`).join(', ')}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(401).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    res.status(200).json({ message: 'Success' })

    // Edit asset and set status
    pool.request().query(`UPDATE assets SET status = '${job_code}' WHERE id = '${asset_id}'`)

    let status_name_query = await pool.request().query(`SELECT job_name FROM jobs WHERE id = '${job_code}'`)
        .catch(er => { return { isErrored: true, er: er } })
    if (status_name_query.isErrored) return

    notifications.notify(req.headers.authorization, asset_id, status_name_query && status_name_query.recordset[0] ? status_name_query.recordset[0].job_name : job_code)
    if (asset_query.recordset[0].hold_type) notifications.hold_notify(asset_id, status_name_query && status_name_query.recordset[0] ? status_name_query.recordset[0].job_name : job_code)
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
        if (!asset_tracker_to_id_query.recordset || !asset_tracker_to_id_query.recordset[0]) return res.status(500).json({ message: `Asset id not found in history of '${id}'` })

        asset_id = asset_tracker_to_id_query.recordset[0].asset_id

        let asset_query = await pool.request().query(`SELECT id, locked, model_number FROM assets WHERE id = '${asset_tracker_to_id_query.recordset[0].asset_id}'`)
            .catch(er => { return { isErrored: true, er: er } })
        if (asset_query.isErrored) return res.status(500).json(asset_query.er)
        if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(400).json({ message: `Asset id not found '${asset_tracker_to_id_query.recordset[0].asset_id}'` })
        if (asset_query.recordset[0].locked) return res.status(403).json({ message: 'Asset is Locked' })

        let model_query = await pool.request().query(`SELECT * FROM models WHERE model_number = '${asset_query.recordset[0].model_number}'`)
            .catch(er => { return { isErrored: true, er: er } })

        if (model_query.isErrored) return res.status(500).json(model_query.er)
        if (!model_query.recordset || !model_query.recordset[0]) return res.status(400).json({ message: `Invlaid model_number in asset id '${id}'` })
        if (job_code_query.recordset[0].applies && !job_code_query.recordset[0].applies.split(',').includes(model_query.recordset[0].category)) return res.status(403).json({ message: 'Job code doesnt apply to model type' })
    }
    else if (change == 'asset') {
        // Validate asset exists and isnt locked
        let asset_query = await pool.request().query(`SELECT id, locked FROM assets WHERE id = '${value}'`)
            .catch(er => { return { isErrored: true, er: er } })
        if (asset_query.isErrored) return res.status(500).json(asset_query.er)
        if (!asset_query.recordset || !asset_query.recordset[0]) return res.status(400).json({ message: `Asset id not found '${value}'` })
        if (asset_query.recordset[0].locked) return res.status(403).json({ message: 'Asset is Locked' })
    }

    // Send to DB
    let result = await pool.request().query(`UPDATE asset_tracking SET ${typeOfToColumn[change]} = '${value}' WHERE id = '${id}' AND user_id = '${uid}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (result.isErrored) {
        return res.status(400).json({ message: 'Unsuccessful', error: result.error })
    }

    // Return
    res.status(200).json({ message: 'Success' })

    // Edit asset and set status
    if (change == 'job') {
        pool.request().query(`UPDATE assets SET status = '${value}' WHERE id = '${id}'`)

        let status_name_query = await pool.request().query(`SELECT job_name FROM jobs WHERE id = ${value}`)
            .catch(er => { return { isErrored: true, er: er } })
        if (status_name_query.isErrored) return

        notifications.notify(req.headers.authorization, asset_id, status_name_query && status_name_query.recordset[0] ? status_name_query.recordset[0].job_name : job_code)
    }
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
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    //Get date from header
    let id = req.params.id

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

Router.get('/get/:search', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

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
        let history_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE asset_id = '${r.info.id}' ORDER BY date DESC`).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (history_query.isErrored) { return res.status(500).json({ message: 'Asset History Query Error' }) }

        if (!history_query.isErrored && history_query.recordset.length > 0) {
            let his = []
            for (let i of history_query.recordset) {
                let name = usernames[i.user_id] || `UID: ${i.user_id}`
                his.push({ name, job_code: i.job_code, date: i.date, time: i.time, id: i.id, notes: i.notes })
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

        let hq = await pool.request().query(`SELECT * FROM asset_tracking WHERE asset_id = '${r.info.id}' ORDER BY date DESC`).catch(er => { console.log(er); return { isErrored: true, error: er } })
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
    if (!isAdmin && !permissions.edit_assets) return res.status(401).json({ error: 'Permission denied' })

    //Get date from header
    const { id, change, value } = req.body
    let val = value.replace("'", '')

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

Router.delete('/alter/:column', async (req, res) => {
    const { uid, isAdmin } = await tokenParsing.checkForAdmin(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin) return res.status(401).json({ error: 'Forbidden' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    const column = req.params.column

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