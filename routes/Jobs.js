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
    restricted_comments: 'restricted_comments'
}

Router.get('/all', async (req, res) => {
    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let asset_tracking = await pool.request().query(`SELECT * FROM jobs WHERE status_only IS NULL OR status_only = 0`)
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
    let asset_tracking = await pool.request().query(`SELECT * FROM jobs WHERE (status_only IS NULL OR status_only = 0) AND is_hourly = ${type == 'hrly' ? '1' : '0'}`)
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
    let asset_tracking = await pool.request().query(`SELECT * FROM jobs`)
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
    const { job_code, job_name, price, isHourly, isAsset, applies, hourly_goal, statusOnly, restricted_comments } = req.body

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
    if (!price || (typeof (price) == 'string' && price.replace(/.\d/gi, '') !== '')) {
        errored = true
        issues.push('Invalid Price or Price not type Int')
    }
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })

    // Establish SQL Connection
    let pool = await sql.connect(config)
    let query = await pool.request().query(`INSERT INTO jobs (job_code, job_name, price, is_hourly, status_only, applies, requires_asset${hourly_goal ? ', hourly_goal' : ''}, restricted_comments) VALUES ('${job_code}','${job_name}','${price}','${isHourly ? '1' : '0'}',${statusOnly ? '1' : '0'}, '${applies || 'null'}','${isAsset ? '1' : '0'}'${hourly_goal ? ', \'0\'' : ''}, '${restricted_comments}')`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(500).json({ message: 'Failed to insert' })
    }
    return res.status(200).json({ message: 'success' })
})

Router.post('/edit', async (req, res) => {
    // Get UID from token header and check for admin
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_jobcodes) return res.status(401).json({ error: 'User is not an administrator and doesnt have edit job codes perms' })

    // Get Data
    const { id, change, value } = req.body

    // Data Validation
    let errors = []
    if (!id || isNaN(parseInt(id))) errors.push('Invalid Job ID')
    if (!value && change !== 'applies') errors.push('No value provided')
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
        case 'price':
            if (isNaN(parseFloat(value))) errors.push('Price value was NaN')
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

    let query = await pool.request().query(`UPDATE jobs SET ${changeToColumn[change]} = '${change == 'isHourly' || change == 'isAsset' || change == 'statusOnly' ? value.toLowerCase() == 'true' ? '1' : '0' : value}' WHERE id = ${id}`) //changes true/false to 1/0 if change type = isHourly or isAsset or statusOnly
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Failed to edit' })
    }
    return res.status(200).json({ message: 'success' })
})

module.exports = Router