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
    const { part, type, model, image, m_stock } = req.body

    let issues = []
    if (!part) issues.push('Missing Part Number')
    if (!type) issues.push('Missing part type')
    if (!model) issues.push('Missing Model')

    if (issues.length) return res.status(400).json({ message: issues.join('\n') })

    // Query the DB
    let q = await pool.request().query(`INSERT INTO part_list (part_number,part_type,model_number,image,minimum_stock) VALUES ('${part}','${type}','${model}','${image ? image : 'null'}',${m_stock})`)
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

    let u_q = await pool.request().query(`SELECT id,name FROM users`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (u_q.isErrored) return res.status(500).json({ message: 'Error', error: u_q.error })

    let usernames = {}
    for (let i of u_q) usernames[i.id] = i.name

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
            d.total_stock = inv.length ? inv.filter(a => a.location).length : 0
        } else { d.total_parts = 0; d.total_stock = 0, d.inventory = [] }

        for (let i in d.inventory) {
            if (d.inventory[i].used_by && usernames[d.inventory[i].used_by]) d.inventory[i].used_by = usernames[d.inventory[i].used_by]
            if (d.inventory[i].added_by && usernames[d.inventory[i].added_by]) d.inventory[i].added_by = usernames[d.inventory[i].added_by]
        }

        // Check for low stock
        for (let ind in d.parts) if (d.parts[ind].minimum_stock) {
            let i = d.parts[ind]
            let stock = await pool.request().query(`SELECT * FROM parts WHERE part_id = ${i.id} AND location IS NULL`)
                .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
            if (stock.isErrored) return res.status(500).json({ message: 'Error', error: stock.error })

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

// Repair Log

Router.get('/log/asset/:asset', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_repair_log) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get asset from route
    const asset = req.params.asset

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let model = await pool.request().query(`SELECT model_number FROM assets WHERE id = '${asset}'`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (model.isErrored) return res.status(500).json({ message: 'Unable to get job codes', error: model.error })

    if (!model.length) return res.status(400).json({ message: `Asset '${asset}' not found` })
    model = model[0].model_number

    let q = await pool.request().query(`SELECT * FROM part_list WHERE model_number = '${model}'`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'Unable to get job codes', error: q.error })

    // Return Data
    return res.status(200).json(q)
})

Router.post('/log', async (req, res) => {
    //TODO: Implement this
    // Either add the change to db if only one option exists for the provided asset and repair type, or all potential parts

    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_repair_log) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get information from body
    const { part, asset } = req.body
    const date = req.body.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Validate data
    let issues = []
    if (!part) issues.push('No part')
    if (!asset) issues.push('No asset')
    if (issues.length) return res.status(400).json({ issues })

    // Query DB
    let model_q = await pool.request().query(`SELECT * FROM assets WHERE id = '${asset}'`)
        .then(m => m.recordset).catch(er => { return { isErrored: true, er } })
    if (!model_q.length || model_q.isErrored) return res.status(400).json({ er: model_q.er, message: `Failed to find asset: ${asset}` })
    let model = model_q[0].model_number

    let p_ids = await pool.request().query(`SELECT * FROM part_list WHERE model_number = '${model}' AND part_type = '${part}'`)
        .then(m => m.recordset).catch(er => { return { isErrored: true, er } })
    if (!p_ids.length || p_ids.isErrored) return res.status(400).json({ er: p_ids.er, message: `Failed to find parts under: ${model}` })

    let o_q = await pool.request().query(`SELECT * FROM parts WHERE location IS NULL AND (${p_ids.map(m => `part_id = '${m.id}'`).join(' OR ')})`)
        .then(m => m.recordset).catch(er => { return { isErrored: true, er } })
    if (!o_q.length || o_q.isErrored) return res.status(400).json({ er: o_q.er, message: `Failed to find inventory under:${p_ids.map(m => `\n${m.part_number}, ${m.id}, ${m.part_type}`)}` })

    // If only one option, force select it
    let submitted = o_q.length == 1
    if (submitted) {
        let sub_q = await pool.request().query(`UPDATE parts SET used_by = '${uid}', location = '${asset}', used_on = ${date ? `'${date}'` : 'GETDATE()'} WHERE id = '${o_q[0].id}'`)
            .catch(er => { return { isErrored: true, er } })
        if (sub_q.isErrored) return res.status(500).json({ er: sub_q.er })
    }

    // Supplemental Data
    let part_id_to_part_num = {}
    for (let i of p_ids) part_id_to_part_num[i.id] = i.part_number

    // Return { options:[], submitted:bool, part_id_to_part_num: {} }
    return res.status(200).json({ options: o_q, submitted, part_id_to_part_num })
})

Router.put('/log', async (req, res) => {
    //TODO: Implement this
    // this one will have a part id with it, add it to db

    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_repair_log) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get information from body
    const { part, asset } = req.body
    const date = req.body.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Update part
    let sub_q = await pool.request().query(`UPDATE parts SET used_by = '${uid}', location = '${asset}', used_on = ${date ? `'${date}'` : 'GETDATE()'} WHERE id = '${part.id}'`)
        .catch(er => { return { isErrored: true, er } })
    if (sub_q.isErrored) return res.status(400).json({ er: sub_q.er })

    // return 200
    return res.status(200).json({ message: 'ok' })
})

Router.get('/log/:date', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_repair_log) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get date from params
    const date = req.params.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get data
    let q = await pool.request().query(`SELECT * FROM parts WHERE used_by = '${uid}' AND used_on BETWEEN '${getDate(date)}' AND '${getDatePlusOneDay(date)}'`)
        .then(m => m.recordset).catch(er => { return { isErrored: true, er } })
    if (q.isErrored) return res.status(500).json({ message: q.er })

    let parts = new Set(), part_id_info = {}
    for (let i of q) parts.add(i.part_id)
    parts = [...parts]
    if (parts.length) {
        let sup_q = await pool.request().query(`SELECT * FROM part_list WHERE ${parts.map(m => `id = '${m}'`).join(' OR ')}`)
            .then(m => m.recordset).catch(er => { return { isErrored: true, er } })
        if (sup_q.isErrored) return res.status(200).json({ data: q })
        for (let i of sup_q) part_id_info[i.id] = { type: i.part_type, model: i.model_number, part_number: i.part_number }
    }
    return res.status(200).json({ data: q, part_id_info })
})

Router.delete('/log/:id', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_repair_log) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get date from params
    const id = req.params.id
    if (!id) return res.status(400).json({ message: 'Missing ID' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Delete query
    let q = await pool.request().query(`UPDATE parts SET used_by = NULL, location = NULL, used_on = NULL WHERE id = '${id}'${isAdmin ? '' : ` AND used_by = '${uid}'`}`)
        .catch(er => { return { isErrored: true, er } })
    if (q.isErrored) return res.status(500).json({ message: q.er })

    if (!q.rowsAffected || !q.rowsAffected.length || !q.rowsAffected[0]) return res.status(400).json({ message: 'No changes available' })

    return res.status(200).json({ message: 'ok' })
})

module.exports = Router

function getDate(date) {
    let d = new Date(date)
    return d.toISOString().split('T')[0]
}

function getDatePlusOneDay(date) {
    let d = new Date(date)
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
}
