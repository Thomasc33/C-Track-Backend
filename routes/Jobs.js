const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const tokenParsing = require('../lib/tokenParsing')
const config = require('../settings.json').SQLConfig

const changeToColumn = {
    isHourly: 'is_hourly',
    price: 'price',
    job_name: 'job_name',
    job_code: 'job_code',
    applies: 'applies',
    isAsset: 'requires_asset',
    hourly_goal: 'hourly_goal',
    statusOnly: 'status_only',
    restricted_comments: 'restricted_comments',
    promptCount: 'prompt_count',
    snipe_id: 'snipe_id',
}

Router.get('/all', async (req, res) => {
    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let asset_tracking = await pool.request().query(`SELECT * FROM jobs WHERE status_only IS NULL OR status_only = 0 ORDER BY is_hourly, requires_asset, job_code DESC`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Unable to get job codes' })
    }

    // Organize Data
    let job_codes = [...asset_tracking.recordset]

    for (let i in job_codes)
        if (job_codes[i].applies) job_codes[i].applies = job_codes[i].applies.split(',')
        else job_codes[i].applies = []

    let data = { job_codes }

    // Return Data
    return res.status(200).json(data)
})

Router.get('/all/:type', async (req, res) => {
    let type = req.params.type
    if (!['hrly', 'asset'].includes(type)) return res.status(400).json(`${type} is not a valid type (hrly, asset)`)

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let asset_tracking = await pool.request().query(`SELECT * FROM jobs WHERE (status_only IS NULL OR status_only = 0) AND is_hourly = ${type == 'hrly' ? '1' : '0'} ORDER BY is_hourly, requires_asset, job_code DESC`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Unable to get job codes' })
    }

    // Organize Data
    let job_codes = [...asset_tracking.recordset]

    for (let i in job_codes)
        if (job_codes[i].applies) job_codes[i].applies = job_codes[i].applies.split(',')
        else job_codes[i].applies = []

    let data = { job_codes }

    // Return Data
    return res.status(200).json(data)
})

Router.get('/favorites/:type', async (req, res) => {
    // Get UID
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
    if (!uid) return res.status(400).json({ er: 'No UID' })

    // Get hrly/asset type
    let type = req.params.type
    if (!['hrly', 'asset'].includes(type)) return res.status(400).json({ er: 'Missing type parameter (hrly/asset)' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let qeu = await pool.request().query(`SELECT ${type == 'hrly' ? 'hrly_favorites' : 'asset_favorites'} FROM users WHERE id = ${uid}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (qeu.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Unable to get job codes' })
    }

    // Organize Data
    let r = qeu.recordset[0]

    d = []
    if (type == 'hrly') { if (r.hrly_favorites) d = r.hrly_favorites.split(',') }
    else if (r.asset_favorites) d = r.asset_favorites.split(',')

    let data = { favorites: d }

    // Return Data
    return res.status(200).json(data)
})

Router.get('/full', async (req, res) => {
    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let asset_tracking = await pool.request().query(`SELECT * FROM jobs ORDER BY is_hourly, requires_asset, job_code DESC`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Unable to get job codes' })
    }

    // Organize Data
    let job_codes = [...asset_tracking.recordset]

    for (let i in job_codes)
        if (job_codes[i].applies) job_codes[i].applies = job_codes[i].applies.split(',')
        else job_codes[i].applies = []

    let data = { job_codes }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/new', async (req, res) => {
    // Get UID from token header and check for admin
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_jobcodes) return res.status(401).json({ error: 'User is not an administrator and doesnt have edit job codes perms' })

    // Get Data
    const { job_code, job_name, price, isHourly, isAsset, applies, hourly_goal, statusOnly, restricted_comments, promptCount, snipe_id } = req.body

    // Data Validation
    let errored = false
    let issues = []
    if (!job_code) {
        errored = true
        issues.push('Job Code Not Provided')
    }
    if (!job_name) {
        errored = true
        issues.push('Job Name Not Provided')
    }
    if (isNaN(parseInt(price)) || (typeof (price) == 'string' && price.replace(/.\d/gi, '') !== '')) {
        errored = true
        issues.push('Invalid Price or Price not type Int')
    }
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })

    // Establish SQL Connection
    let pool = await sql.connect(config)
    let query = await pool.request().query(`INSERT INTO jobs (job_code, job_name, price, is_hourly, status_only, applies, requires_asset${hourly_goal ? ', hourly_goal' : ''}, restricted_comments, prompt_count, snipe_id) VALUES ('${job_code}','${job_name}','${price}','${isHourly ? '1' : '0'}',${statusOnly ? '1' : '0'}, '${applies || ''}','${isAsset ? '1' : '0'}'${hourly_goal ? ', \'0\'' : ''}, '${restricted_comments || ''}', '${promptCount ? '1' : '0'}', ${snipe_id})`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(500).json({ message: 'Failed to insert' })
    }
    res.status(200).json({ message: 'success' })

    // Add to job history
    let id_q = await pool.request().query(`SELECT id FROM jobs WHERE job_code = '${job_code}' AND job_name = '${job_name}' AND price = ${price}`)
        .then(m => m.recordset).catch(er => { return { er, isErrored: true } })
    if (id_q.isErrored || !id_q.length) return console.log(`Error finding id of new job code, ${id_q.er}`)
    let id = id_q[0].id
    let his_q = await pool.request().query(`INSERT INTO job_price_history (job_id, price, [from]) VALUES ('${id}',${price}, GETDATE())`)
        .catch(er => { return { isErrored: true, er } })
    if (his_q.isErrored) return console.log(`Error adding to price history (new job): ${his_q.er}`)
})

Router.post('/edit', async (req, res) => {
    // Get UID from token header and check for admin
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_jobcodes) return res.status(401).json({ error: 'User is not an administrator and doesnt have edit job codes perms' })

    // Get Data
    const { id, change, value } = req.body
    let isPrice = change == 'price'

    // Data Validation
    let errors = []
    if (!id || isNaN(parseInt(id))) errors.push('Invalid Job ID')
    if (!value && ['job_name', 'job_code', 'price'].includes(change)) errors.push('No value provided')
    else switch (change) {
        case 'isHourly':
            if (!['true', 'false'].includes(value.toLowerCase()))
                errors.push('isHourly value invalid')
            break;
        case 'statusOnly':
            if (!['true', 'false'].includes(value.toLowerCase()))
                errors.push('statusOnly value invalid')
            break;
        case 'isAsset':
            if (!['true', 'false'].includes(value.toLowerCase()))
                errors.push('isAsset value invalid')
            break;
        case 'promptCount':
            if (!['true', 'false'].includes(value.toLowerCase()))
                errors.push('promptCount value invalid')
            break;
        case 'price':
            if (isNaN(parseFloat(value))) errors.push('Price value was NaN')
            break;
        case 'snipe_id':
            if (value && isNaN(parseFloat(value))) errors.push('Price value was NaN')
            break;
        case 'job_name':
            //no further validation needed
            break;
        case 'job_code':
            //no further validation needed
            break;
        case 'applies':
            //no further validation needed
            break;
        case 'hourly_goal':
            break;
        case 'restricted_comments':
            break;
        default:
            errors.push('Unknown change type')
            break;
    }
    if (errors.length > 0) return res.status(400).json({ errors })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    let query = await pool.request().query(`UPDATE jobs SET ${changeToColumn[change]} = ${!value ? 'NULL' : `'${change == 'isHourly' || change == 'isAsset' || change == 'statusOnly' || change == 'promptCount' ? value.toLowerCase() == 'true' ? '1' : '0' : value}'`} WHERE id = ${id}`) //changes true/false to 1/0 if change type = isHourly or isAsset or statusOnly
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(500).json({ message: 'Failed to edit', error: query.error })
    }
    res.status(200).json({ message: 'success' })

    if (isPrice) {
        let history_q = await pool.request().query(`UPDATE job_price_history SET [to] = GETDATE() WHERE job_id = '${id}'`)
            .catch(er => { return { isErrored: true, er } })
        if (history_q.isErrored) return console.log(`Error updating price history: ${history_q.er}`)
        history_q = await pool.request().query(`INSERT INTO job_price_history (job_id, price, [from]) VALUES ('${id}',${value}, GETDATE())`)
            .catch(er => { return { isErrored: true, er } })
        if (history_q.isErrored) return console.log(`Error adding to price history: ${history_q.er}`)
    }
})

module.exports = Router