const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const tokenParsing = require('../lib/tokenParsing')
const config = require('../settings.json').SQLConfig

const changeToColumn = {
    isHourly: 'is_hourly',
    price: 'price',
    job_name: 'job_name',
    job_code: 'job_code'
}

Router.get('/all', async (req, res) => {
    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Combining these into a single query is out of my knowledge level, so I'm breaking it up into multiple
    let asset_tracking = await pool.request().query(`SELECT * FROM jobs WHERE status_only IS NULL OR status_only = 0`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Unable to get job codes' })
    }

    // Organize Data
    let data = {
        job_codes: asset_tracking.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

Router.get('/full', async (req, res) => {
    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Combining these into a single query is out of my knowledge level, so I'm breaking it up into multiple
    let asset_tracking = await pool.request().query(`SELECT * FROM jobs`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Unable to get job codes' })
    }

    // Organize Data
    let data = {
        job_codes: asset_tracking.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/new', async (req, res) => {
    // Get UID from token header and check for admin
    const { uid, isAdmin } = await tokenParsing.checkForAdmin(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })
    if (!isAdmin) return res.status(403).json({ error: 'User is not an administrator' })

    // Get Data
    const { job_code, job_name, price, isHourly } = req.body

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
    if (!price || (typeof (price) == 'string' && price.replace(/\d/gi, '') !== '')) {
        errored = true
        issues.push('Invalid Price or Price not type Int')
    }
    if (errored) return res.status(400).json({ message: 'Unsuccessful', issues: issues })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    let query = await pool.request().query(`INSERT INTO jobs (job_code, job_name, price, is_hourly, status_only) VALUES ('${job_code}','${job_name}','${price}','${isHourly ? '1' : '0'}','0')`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Unable to get job codes' })
    }
    return res.status(200).json({ message: 'success' })
})

Router.post('/edit', async (req, res) => {
    // Get UID from token header and check for admin
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(401).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_jobcodes) return res.status(403).json({ error: 'User is not an administrator' })

    // Get Data
    const { id, change, value } = req.body

    // Data Validation
    let errors = []
    if (!id || isNaN(parseInt(id))) errors.push('Invalid Job ID')
    if (!value) errors.push('No value provided')
    else switch (change) {
        case 'isHourly':
            if (!['true', 'false'].includes(value.toLowerCase()))
                errors.push('isHourly value invalid')
            break;
        case 'price':
            if (isNaN(parseInt(value))) errors.push('Price value was NaN')
            break;
        case 'job_name':
            //no further validation needed
            break;
        case 'job_code':
            //no further validation needed
            break;
        default:
            errors.push('Unknown change type')
            break;
    }
    if (errors.length > 0) return res.status(400).json({ errors })


    // Establish SQL Connection
    let pool = await sql.connect(config)

    let query = await pool.request().query(`UPDATE jobs SET ${changeToColumn[change]} = '${change == 'isHourly' ? value.toLowerCase() == 'true' ? '1' : '0' : value}' WHERE id = ${id}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ code: 400, message: 'Unable to get job codes' })
    }
    return res.status(200).json({ message: 'success' })
})

module.exports = Router