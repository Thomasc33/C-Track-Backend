const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig

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

module.exports = Router