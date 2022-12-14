const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const tokenParsing = require('../lib/tokenParsing')
const config = require('../settings.json').SQLConfig

Router.get('/full', async (req, res) => {
    // Check to see if the user has perms to view full branch list
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_branches) return res.status(401).json({ error: 'User is not an administrator and doesnt have edit job codes perms' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let asset_tracking = await pool.request().query(`SELECT * FROM branches`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) return res.status(400).json({ message: 'Unable to get job codes' })

    // Organize Data
    let branches = [...asset_tracking.recordset]

    let data = { branches }

    // Return Data
    return res.status(200).json(data)
})

Router.get('/simple', async (req, res) => {
    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let asset_tracking = await pool.request().query(`SELECT id,entity_number FROM branches`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) return res.status(400).json({ message: 'Unable to get job codes' })

    // Organize Data
    let branches = [...asset_tracking.recordset]

    let data = { branches }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/new', async (req, res) => {
    // Get UID from token header and check for admin
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_branches) return res.status(401).json({ error: 'User is not an administrator and doesnt have edit job codes perms' })

    // Get Data
    const { branch, entity_number, isClosed, notes, phone, address, address2, city, state } = req.body

    // Data Validation
    if (!branch || branch.length > 15) return res.status(400).json({ error: 'Missing branch' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Check to see if the branch exists
    let branchExists = await pool.request().query(`SELECT * FROM branches WHERE id = '${branch}'`).then(r => !!r.recordset.length)
    if (branchExists) return res.status(400).json({ error: 'Branch already exists' })

    // Insert into DB
    let query = await pool.request().query(`INSERT INTO branches (id, entity_number, is_closed, notes, phone, address, address2, city, state) VALUES ('${branch}', ${entity_number ? `'${entity_number}'` : 'NULL'}, '${isClosed ? 1 : 0}', '${notes}', '${phone}', '${address}', '${address2}', '${city}', '${state}')`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) return res.status(500).json({ message: 'Failed to insert' })

    return res.status(200).json({ message: 'success' })
})

Router.post('/edit', async (req, res) => {
    // Get UID from token header and check for admin
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_branches) return res.status(401).json({ error: 'User is not an administrator and doesnt have edit job codes perms' })

    // Get Data
    const { id, change, value } = req.body

    // Data Validation
    let errors = []
    if (!value && ['id'].includes(change)) errors.push('No value provided')
    else switch (change) {
        case 'is_closed':
            if (!['true', 'false'].includes(value.toLowerCase()))
                errors.push('isHourly value invalid')
            break;
        case 'entity_number':
            if (value && isNaN(parseFloat(value))) errors.push('Price value was NaN')
            break;
        case 'notes': break;
        case 'phone': break;
        case 'address': break;
        case 'address2': break;
        case 'city': break;
        case 'state': break;
        default:
            errors.push('Unknown change type')
            break;
    }
    if (errors.length > 0) return res.status(400).json({ errors })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let query = await pool.request().query(`UPDATE branches SET ${change} = ${!value ? 'NULL' : `'${change == 'is_closed' ? value.toLowerCase() == 'true' ? '1' : '0' : value}'`} WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) return res.status(500).json({ message: 'Failed to edit', error: query.error })

    return res.status(200).json({ message: 'success' })
})

module.exports = Router