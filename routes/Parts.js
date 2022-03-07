const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const tokenParsing = require('../lib/tokenParsing')
const config = require('../settings.json').SQLConfig

// Common Parts

Router.get('/common', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_part_types) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let q = await pool.request().query(`SELECT * FROM common_parts`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'Unable to get job codes', error: q.error })

    // Return Data
    return res.status(200).json(q.recordset)
})

Router.post('/common/new', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_part_types) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Sanitize Data
    const data = req.body

    let issues = []
    if (data.previous !== 'new') issues.push('Not new')
    if (!data.value) issues.push('missing the type')
    if (issues.length > 0) return res.status(400).json({ error: issues.join(', ') })

    // Query the DB
    let q = await pool.request().query(`INSERT INTO [common_parts] VALUES ('${data.value}', ${data.selection ? `'${data.selection.join(',')}'` : 'null'})`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(400).json({ message: 'Error Inserting', error: q.error })

    // Return Data
    return res.status(200).json({ message: 'success' })
})

Router.put('/common/edit', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_part_types) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Sanitize Data
    const data = req.body

    let issues = []
    if (!data.change) issues.push('missing change')
    if (!data.part) issues.push('missing the part type')
    if (!data.value) issues.push('missing the value')
    if (!['manufacturer', 'part_type'].includes(data.change)) issues.push('unrecognized change')
    if (issues.length > 0) return res.status(400).json({ error: issues.join(', ') })

    // Query the DB
    let q = await pool.request().query(`UPDATE [common_parts] SET [${data.change}] = '${data.value || 'null'}' WHERE part_type = '${data.part}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(400).json({ message: 'Error editing, most likely unknown part_type', error: q.error })

    // Return Data
    return res.status(200).json({ message: 'success' })
})

// Parts Management

Router.get('/mgmt', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_parts) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let q = await pool.request().query(`SELECT * FROM models WHERE parts_enabled = 1`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'Error', error: q.error })

    // Return Data
    return res.status(200).json(q.recordset)
})

Router.post('/mgmt/models/create', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_parts) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Sanitize Data
    const data = req.body

    let issues = []
    if (!data.model) issues.push('missing model')
    if (issues.length > 0) return res.status(400).json({ error: issues.join(', ') })

    // Query the DB
    let q = await pool.request().query(`UPDATE models SET parts_enabled = 1 WHERE model_number = '${data.model}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(400).json({ message: 'Error editing, most likely unknown model', error: q.error })

    // Return Data
    return res.status(200).json({ message: 'success' })
})

Router.post('/mgmt/part/create', async (req, res) => { })

Router.put('/mgmt/part/edit', async (req, res) => { })

// Parts Inventory

Router.get('/inventory/home', async (req, res) => {
    // Return [{model, total parts, total stock, parts: [type, part number, stock]}]
})

Router.get('/inventory/:model', async (req, res) => { })

// Repair Log




module.exports = Router