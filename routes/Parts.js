const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const tokenParsing = require('../lib/tokenParsing')
const config = require('../settings.json').SQLConfig
const LogEmitter = require('../lib/partStockNotifications').LogEmitter

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

    // Get unique part counts
    let parts = await pool.request().query(`SELECT model_number,alt_models FROM part_list`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (parts.isErrored) return res.status(500).json({ message: 'Error', error: parts.error })
    for (let i = 0; i < q.recordset.length; i++) {
        q.recordset[i].part_count = parts.recordset.filter(p => p.model_number === q.recordset[i].model_number || (p.alt_models && p.alt_models.split(',').includes(q.recordset[i].model_number))).length
    }

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

Router.get('/mgmt/model', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.view_parts) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get model number
    const model = req.query.model

    // Text check model number
    if (!model || typeof model != 'string') return res.status(400).json({ message: 'Invalid model number' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let q = await pool.request().query(`SELECT * FROM part_list`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(400).json({ message: 'Invalid Model' })
    q.recordset = q.recordset.filter(m => m.model_number == model || (m.alt_models && m.alt_models.split(',').includes(model)))

    let manufacturer = await pool.request().query(`SELECT manufacturer FROM models WHERE model_number = '${model}'`)
        .then(m => m.recordset && m.recordset.length && m.recordset[0].manufacturer ? m.recordset[0].manufacturer : null)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (manufacturer.isErrored || !manufacturer) return res.status(400).json({ message: 'Invalid Model (Q2)' })

    let cq = await pool.request().query(`SELECT * FROM common_parts`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (cq.isErrored) return res.status(400).json({ message: 'Invalid Model (Q3)' })
    let common = []
    for (let i of cq.recordset) if (i.manufacturer.toLowerCase().split(',').includes(manufacturer.toLowerCase())) common.push(i)

    // Watching
    for (let i of q.recordset) {
        if (i.watchers && i.watchers.split(',').includes(`${uid}`)) i.watching = true
        else i.watching = false
    }

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
    let q = await pool.request().query(`INSERT INTO part_list (part_number,part_type,model_number,image,minimum_stock) VALUES ('${part}','${type}','${model}',${image ? `${image}` : 'NULL'},${m_stock})`)
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
    if (!value && change !== 'image') issues.push('Missing value')
    if (!id) issues.push('Missing id')

    const changeToDB = { 'type': 'part_type', 'part': 'part_number', 'image': 'image', 'alt_models': 'alt_models', 'm_stock': 'minimum_stock' }
    if (!changeToDB[change]) issues.push('Unknown change type')

    if (issues.length) return res.status(400).json({ message: issues.join('\n') })

    // Query the DB
    let q = await pool.request().query(`UPDATE part_list SET ${changeToDB[change]} = ${value ? `'${value}'` : 'NULL'} WHERE id = ${id}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'Error', error: q.error })

    // Return Data
    return res.status(200).json(q.recordset)
})

Router.delete('/mgmt/part', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_parts) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Data Validation
    const { id } = req.query

    let issues = []
    if (!id) issues.push('Missing id')

    if (issues.length) return res.status(400).json({ message: issues.join('\n') })

    // Query the DB
    let q = await pool.request().query(`DELETE FROM part_list WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'Error', error: q.error })

    // Return Data
    return res.status(200).json(q.recordset)
})

Router.get('/mgmt/part/watch', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_parts) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Data Validation
    const { id } = req.query

    let issues = []
    let watchers = []
    if (!id) issues.push('Missing id')
    else {
        let q = await pool.request().query(`SELECT * FROM part_list WHERE id = '${id}'`)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (q.isErrored || q.rowsAffected == 0) issues.push('Invalid id')
        else watchers = q.recordset[0].watchers ? q.recordset[0].watchers.split(',') : []
    }

    if (issues.length) return res.status(400).json({ message: issues.join('\n') })

    // Query the DB
    if (!watchers.includes(`${uid}`)) {
        watchers.push(`${uid}`)
        let q = await pool.request().query(`UPDATE part_list SET watchers = '${watchers.join(',')}' WHERE id = '${id}'`)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (q.isErrored) return res.status(500).json({ message: 'Error', error: q.error })
        return res.status(200).json({ message: 'Subscribed' })
    } else return res.status(200).json({ message: 'Already subscribed' })
})

Router.delete('/mgmt/part/watch', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_parts) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Data Validation
    const { id } = req.query

    let issues = []
    let watchers = []
    if (!id) issues.push('Missing id')
    else {
        let q = await pool.request().query(`SELECT * FROM part_list WHERE id = '${id}'`)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (q.isErrored || q.rowsAffected == 0) issues.push('Invalid id')
        else watchers = q.recordset[0].watchers ? q.recordset[0].watchers.split(',') : []
    }
    if (!watchers.includes(`${uid}`)) issues.push('Not subscribed')

    if (issues.length) return res.status(400).json({ message: issues.join('\n') })

    // Query the DB
    watchers = watchers.filter(watcher => watcher != `${uid}`)
    let q = await pool.request().query(`UPDATE part_list SET watchers = '${watchers.join(',')}' WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'Error', error: q.error })

    // Return Data
    return res.status(200).json({ message: 'Unsubscribed' })
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
    let models = new Set()
    let mq = await pool.request().query(`SELECT * FROM models WHERE parts_enabled = 1`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (mq.isErrored) return res.status(500).json({ message: 'Error', error: mq.error })
    mq.forEach(m => models.add(m.model_number))

    let ap_q = await pool.request().query(`SELECT * FROM part_list WHERE alt_models IS NOT NULL`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (ap_q.isErrored) return res.status(500).json({ message: 'Error', error: ap_q.error })
    ap_q.forEach(m => m.alt_models.split(',').forEach(z => models.add(z)))

    let u_q = await pool.request().query(`SELECT id,name FROM users`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (u_q.isErrored) return res.status(500).json({ message: 'Error', error: u_q.error })

    let usernames = {}
    for (let i of u_q) usernames[i.id] = i.name

    // Data Organization and additional queries
    let parts = await pool.request().query(`SELECT * FROM part_list`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (parts.isErrored) return res.status(500).json({ message: 'Error', error: parts.error })
    let data = []
    for (let m of models) {
        let d = {}

        // Get Model
        let mod_q = await pool.request().query(`SELECT * FROM models WHERE model_number = '${m}'`)
            .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (mod_q.isErrored) return res.status(500).json({ message: 'Error', error: mod_q.error })
        if (!mod_q.length) console.error(`No model under ${m}`)
        d.model = mod_q[0]

        // Get models parts
        let p = parts.filter(a => a.model_number == m || (a.alt_models && a.alt_models.split(',').includes(m)))
        d.parts = p

        // Get inventory for model
        if (p.length) {
            let inv = await pool.request().query(`SELECT * FROM parts WHERE ${p.map(m => `part_id = ${m.id}`).join(' OR ')}`)
                .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
            if (inv.isErrored) return res.status(500).json({ message: 'Error', error: inv.error })

            d.inventory = inv
            d.total_parts = inv.length
            d.total_stock = inv.filter(a => !a.location).length
        } else { d.total_parts = 0; d.total_stock = 0, d.inventory = [] }

        // Convert UID to name
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
                d.parts[ind].low_stock = true
                d.low_stock = true
            }
        }

        data.push(d)
    }

    // Return [{model, total parts, total stock, parts: [type, part number, stock]}]
    return res.status(200).json(data)

})

// Repair Log

Router.get('/log/asset', async (req, res) => {
    // Make sure user can use this route
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_repair_log) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get asset from route
    const asset = req.query.asset

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let model = await pool.request().query(`SELECT model_number FROM assets WHERE id = '${asset}'`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (model.isErrored) return res.status(500).json({ message: 'Unable to get job codes', error: model.error })

    if (!model.length) return res.status(400).json({ message: `Asset '${asset}' not found` })
    model = model[0].model_number

    let q = await pool.request().query(`SELECT * FROM part_list`)
        .then(m => m.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ message: 'Failed to get part list' })
    q = q.filter(m => m.model_number == model || (m.alt_models && m.alt_models.split(',').includes(model)))

    // Return Data
    return res.status(200).json(q)
})

Router.post('/log', async (req, res) => {
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

    let p_ids = await pool.request().query(`SELECT * FROM part_list WHERE part_type = '${part}'`)
        .then(m => m.recordset).catch(er => { return { isErrored: true, er } })
    if (!p_ids.length || p_ids.isErrored) return res.status(400).json({ er: p_ids.er, message: `Failed to find parts under: ${model}` })
    p_ids = p_ids.filter(m => m.model_number == model || (m.alt_models && m.alt_models.split(',').includes(model)))

    let o_q = await pool.request().query(`SELECT * FROM parts WHERE location IS NULL AND (${p_ids.map(m => `part_id = '${m.id}'`).join(' OR ')})`)
        .then(m => m.recordset).catch(er => { return { isErrored: true, er } })
    if (!o_q.length || o_q.isErrored) return res.status(400).json({ er: o_q.er, message: `Failed to find inventory under:${p_ids.map(m => `\n${m.part_number}, ${m.id}, ${m.part_type}`)}` })

    // If only one option, force select it
    let submitted = o_q.length == 1
    if (submitted) {
        let sub_q = await pool.request().query(`UPDATE parts SET used_by = '${uid}', location = '${asset}', used_on = ${date ? `'${date}'` : 'GETDATE()'} WHERE id = '${o_q[0].id}'`)
            .catch(er => { return { isErrored: true, er } })
        if (sub_q.isErrored) return res.status(500).json({ er: sub_q.er })
        LogEmitter.emit('log', o_q[0].part_id)
    }

    // Supplemental Data
    let part_id_to_part_num = {}
    for (let i of p_ids) part_id_to_part_num[i.id] = i.part_number

    // Return { options:[], submitted:bool, part_id_to_part_num: {} }
    return res.status(200).json({ options: o_q, submitted, part_id_to_part_num })
})

Router.put('/log', async (req, res) => {
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
    res.status(200).json({ message: 'ok' })

    // Get part's parent id
    let q = await pool.request().query(`SELECT part_id FROM parts WHERE id = '${part.id}'`)
        .catch(er => { return { isErrored: true, er } })
    if (q.isErrored) return console.log(q.er)
    console.log(q.recordset)
    LogEmitter.emit('log', q.recordset[0].part_id)
})

Router.get('/log', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_repair_log) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get date from query
    const date = req.query.date

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

Router.delete('/log', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.use_repair_log) return res.status(401).json({ error: 'Not authtorized to use this route' })

    // Get date from params
    const id = req.query.id
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
