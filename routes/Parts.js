const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const tokenParsing = require('../lib/tokenParsing')
const config = require('../settings.json').SQLConfig

// Common Parts

Router.get('/common', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
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
        .catch(er => { return { uid: { errored: true, er } } })
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
        .catch(er => { return { uid: { errored: true, er } } })
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
        .catch(er => { return { uid: { errored: true, er } } })
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
        .catch(er => { return { uid: { errored: true, er } } })
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

Router.get('/mgmt/model/:model', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_parts) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get model number
    const model = req.params.model

    // Text check model number
    if (!model || typeof model != 'string') return res.status(400).json({ message: 'Invalid model number' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let q = await pool.request().query(`SELECT * FROM part_list WHERE model_number = '${model}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(400).json({ message: 'Invalid Model' })

    let manufacturer = await pool.request().query(`SELECT manufacturer FROM models WHERE model_number = '${model}'`)
        .then(m => m.recordset && m.recordset.length && m.recordset[0].manufacturer ? m.recordset[0].manufacturer : null)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored || !manufacturer) return res.status(400).json({ message: 'Invalid Model (Q2)' })

    let cq = await pool.request().query(`SELECT * FROM common_parts`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(400).json({ message: 'Invalid Model (Q3)' })
    let common = []
    for (let i of cq.recordset) if (i.manufacturer.toLowerCase().split(',').includes(manufacturer.toLowerCase())) common.push(i)

    // Return Data
    let data = { parts: q.recordset, common: common }
    return res.status(200).json(data)
})

Router.put('/mgmt/part/create', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_parts) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Data Validation
    const { part, type, model, image } = req.body

    let issues = []
    if (!part) issues.push('Missing Part Number')
    if (!type) issues.push('Missing part type')
    if (!model) issues.push('Missing Model')

    if (issues.length) return res.status(400).json({ message: issues.join('\n') })

    // Query the DB
    let q = await pool.request().query(`INSERT INTO part_list (part_number,part_type,model_number,image) VALUES ('${part}','${type}','${model}','${image ? image : 'null'}')`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'Error', error: q.error })

    // Return Data
    return res.status(200).json(q.recordset)
})

Router.post('/mgmt/part/edit', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_parts) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Data Validation
    const { change, model, value, id } = req.body

    let issues = []
    if (!change) issues.push('Missing change')
    if (!model) issues.push('Missing model')
    if (!value) issues.push('Missing value')
    if (!id) issues.push('Missing id')

    const changeToDB = { 'type': 'part_type', 'part': 'part_number', 'image': 'image' }
    if (!changeToDB[change]) issues.push('Unknown change type')

    if (issues.length) return res.status(400).json({ message: issues.join('\n') })

    // Query the DB
    let q = await pool.request().query(`UPDATE part_list SET ${changeToDB[change]} = '${value}' WHERE id = ${id} AND model_number = '${model}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'Error', error: q.error })

    // Return Data
    return res.status(200).json(q.recordset)
})

// Parts Inventory

Router.get('/inventory', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_part_inventory) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let models = await pool.request().query(`SELECT * FROM models WHERE parts_enabled = 1`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (models.isErrored) return res.status(500).json({ message: 'Error', error: models.error })

    // Data Organization and additional queries
    let data = []
    for (let m of models) {
        let d = { model: m }

        // Get models parts
        let parts = await pool.request().query(`SELECT * FROM part_list WHERE model_number = '${m.model_number}'`)
            .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (parts.isErrored) return res.status(500).json({ message: 'Error', error: parts.error })
        d.parts = parts

        // Get inventory for model
        if (parts.length) {
            let inv = await pool.request().query(`SELECT * FROM parts WHERE ${parts.map(m => `part_id = ${m.id}`).join(' OR ')}`)
                .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
            if (inv.isErrored) return res.status(500).json({ message: 'Error', error: inv.error })

            d.inventory = inv
            d.total_parts = inv.length
            d.total_stock = inv.length ? inv.reduce((a, b) => b.location ? a : a++) : 0
        } else { d.total_parts = 0; d.total_stock = 0, d.inventory = [] }

        // Check for low stock
        for (let ind in d.parts) if (d.parts[ind].minimum_stock) {
            let i = d.parts[ind]
            let stock = await pool.request().query(`SELECT * FROM parts WHERE part_id = ${i.id} AND location IS NULL`)
                .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
            if (inv.isErrored) return res.status(500).json({ message: 'Error', error: inv.error })

            if (stock.length < i.minimum_stock) {
                d.parts[i].low_stock = true
                d.low_stock = true
            }
        }

        data.push(d)
    }

    // Return [{model, total parts, total stock, parts: [type, part number, stock]}]
    return res.status(200).json(data)

})

Router.get('/inventory/:model', async (req, res) => { })

// Repair Log




module.exports = Router