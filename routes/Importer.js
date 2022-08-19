const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')
const newAssetStatusCode = require('../settings.json').newAssetStatusCode
const deviceTypes = require('../settings.json').deviceTypes

Router.post('/asset', async (req, res) => {
    // Check for importer permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin && !permissions.use_importer) return res.status(403).json({ error: 'Forbidden' })

    // Get json data
    const data = req.body

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get all models
    let failedAssets = []
    const model_query = await pool.request().query(`SELECT model_number,name FROM models`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (model_query.isErrored) return res.status(500).json({ error: model_query.error })
    const models = {}
    for (let i of model_query.recordset) models[i.model_number.toLowerCase()] = i.name.toLowerCase()

    const assets_query = await pool.request().query(`SELECT id FROM assets`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (assets_query.isErrored) return res.status(500).json({ error: assets_query.error })
    const assets = new Set(Array.from(assets_query.recordset, (v, k) => { return v.id.toUpperCase() }))

    // Data validation
    let validInserts = []
    for (let i of data) {
        // Check to see if data was provided
        if (!i.id || !i.model_number) continue

        // Ensure model exists
        if (!models[i.model_number]) {
            let found = false
            for (let j in models) {
                if (j === i.model_number.toLowerCase()) {
                    i.model_number = j
                    found = true
                    break;
                }
            }
            if (!found) { failedAssets.push({ id: `${i.id}`, reason: `Model Number ${i.model_number} doesnt exist` }); continue; }
        }

        // Ensure asset doesnt already exist
        if (assets.has(i.id.toUpperCase())) { failedAssets.push({ id: `${i.id}`, reason: `Asset already exists` }); continue; }

        // Add to valid inserts
        validInserts.push(i)
        assets.add(i.id.toUpperCase())
    }

    if (validInserts.length < 1) return res.status(400).json({ error: 'No valid options found to import', failed: failedAssets })

    // Query
    const query = await pool.request().query(`INSERT INTO assets (id, model_number, status) VALUES ${validInserts.map(m => `('${m.id.trim()}', '${m.model_number.trim()}', '${newAssetStatusCode}')`).join(', ')}`)
        .catch(er => { return { isErrored: true, error: er } })
    if (query.isErrored) {
        console.log(query.error)
        return res.status(500).json({ error: query.error, failed: failedAssets })
    }

    // Return
    return res.status(200).json({ message: 'Success', failed: failedAssets })
})

Router.post('/model', async (req, res) => {
    // Check for importer permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin && !permissions.use_importer) return res.status(403).json({ error: 'Forbidden' })

    // Get json data
    const data = req.body

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Current Models to avoid duplicates
    const models = new Set()
    let failedModels = []
    const modelQuery = await pool.request().query(`SELECT model_number FROM models`)
        .catch(er => { return { isErrored: true, error: er } })
    if (modelQuery.isErrored) return res.status(500).json(er)
    for (let i of modelQuery.recordset) {
        models.add(i.model_number)
    }

    // Data validation
    let validInserts = []
    for (let i of data) {
        if (!i.id || !i.name || !i.manufacturer) { failedModels.push({ id: i.id || i.name || i.manufacturer, reason: 'Missing Information' }); continue; }
        if (!deviceTypes.includes(i.device_type)) { failedModels.push({ id: `${i.id}`, reason: 'Device type not recognized' }); continue; }
        if (models.has(i.id)) { failedModels.push({ id: `${i.id}`, reason: 'Model number already exists' }); continue; }
        validInserts.push(i)
        models.add(i.id)
    }

    if (validInserts.length < 1) return res.status(400).json({ error: 'No valid options found to import', failed: failedModels })
    // Query
    const query = await pool.request().query(`INSERT INTO models (model_number, name, category, manufacturer) VALUES ${validInserts.map(m => `('${m.id.trim()}', '${m.name.trim()}', '${m.device_type.trim()}', '${m.manufacturer.trim()}')`).join(',')}`)
        .catch(er => { return { isErrored: true, error: er } })
    if (query.isErrored) {
        console.log(query.error)
        return res.status(500).json({ error: query.error, failed: failedModels })
    }

    // Return
    return res.status(200).json({ message: 'Success', failed: failedModels })
})

Router.post('/legal', async (req, res) => {
    // Check for importer permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin && !permissions.use_importer) return res.status(403).json({ error: 'Forbidden' })

    // Get json data
    const data = req.body

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get all models
    let failedAssets = []
    const assets_query = await pool.request().query(`SELECT id FROM assets`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (assets_query.isErrored) return res.status(500).json({ error: model_query.error })
    const assets = new Set(Array.from(assets_query.recordset, (v, k) => { return v.id.toLowerCase() }))

    // Data validation
    let validInserts = []
    for (let i of data) {
        // Check to see if data was provided
        if (!i.id) continue

        // Ensure asset exists
        if (!assets.has(i.id.toLowerCase())) {
            failedAssets.push({ id: `${i.id}`, reason: `Asset doesnt exist` }); continue;
        }

        // Add to valid inserts
        validInserts.push(i)
    }

    if (validInserts.length < 1) return res.status(400).json({ error: 'No valid options found to import', failed: failedAssets })

    // Query
    const query = await pool.request().query(`UPDATE assets SET hold_type = 'Legal' WHERE ${validInserts.map(m => `id = '${m.id}'`).join(' OR ')}`)
        .catch(er => { return { isErrored: true, error: er } })
    if (query.isErrored) {
        console.log(query.error)
        return res.status(500).json({ error: query.error, failed: failedAssets })
    }

    // Return
    return res.status(200).json({ message: 'Success', failed: failedAssets })
})

Router.post('/parts', async (req, res) => {
    // Check for importer permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin && !permissions.use_importer) return res.status(403).json({ error: 'Forbidden' })

    // Get json data
    const data = req.body

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get all models
    let failedParts = []
    const pl_query = await pool.request().query(`SELECT part_number,id FROM part_list`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (pl_query.isErrored) return res.status(500).json({ error: model_query.error })
    const part_ids = new Set(Array.from(pl_query.recordset, (v, k) => { return v.part_number.toLowerCase() }))
    const part_num_to_id = {}
    for (let i of pl_query.recordset) part_num_to_id[i.part_number] = i.id

    // Data validation
    let validInserts = []
    for (let i of data) {
        // Check to see if data was provided
        if (!i.id) continue

        // Ensure asset exists
        if (!part_ids.has(i.id.toLowerCase())) {
            failedParts.push({ id: `${i.id}`, reason: `Part doesnt exist` }); continue;
        }

        // Add to valid inserts
        validInserts.push(i)
    }

    if (!validInserts.length) return res.status(400).json({ error: 'No valid options found to import', failed: failedParts })

    // Query
    const query = await pool.request().query(`INSERT INTO parts (part_id, added_by, added_on) VALUES ${validInserts.map(m => `('${part_num_to_id[m.id]}', '${uid}', GETDATE())`).join(', ')}`)
        .catch(er => { return { isErrored: true, error: er } })
    if (query.isErrored) {
        console.log(query.error)
        return res.status(500).json({ error: query.error, failed: failedParts })
    }

    // Return
    return res.status(200).json({ message: 'Success', failed: failedParts })
})

Router.post('/part_types', async (req, res) => {
    // Check for importer permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin && !permissions.use_importer) return res.status(403).json({ error: 'Forbidden' })

    // Get json data
    const data = req.body
    console.log(data)

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get all parts
    const pt_query = await pool.request().query(`SELECT part_type FROM common_parts`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (pt_query.isErrored) return res.status(500).json({ error: pt_query.error })
    const part_types = new Set(Array.from(pt_query.recordset, (v, k) => { return v.part_type.toLowerCase() }))

    // Get all models
    const model_query = await pool.request().query(`SELECT model_number FROM models`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (model_query.isErrored) return res.status(500).json({ error: model_query.error })
    const models = new Set(Array.from(model_query.recordset, (v, k) => { return v.model_number.toLowerCase() }))

    // Data validation
    let failedInserts = []
    let validInserts = []
    for (let i of data) {
        // Check to see if data was provided
        let failed = []

        if (!i.id) continue
        if (!i.part_type) failed.push(`Part type not provided`)
        if (!part_types.has(i.part_type.toLowerCase())) failed.push(`Part type not found`);
        if (!i.minimum_stock) failed.push(`Minimum Stock not provided`);
        if (!i.models) failed.push(`Models not provided`);

        let failed_models = []
        for (let j of i.models.split('/')) if (!models.has(j.toLowerCase())) failed_models.push(j)
        if (failed_models.length) failed.push(`Models not found: ${failed_models.join(', ')}`)

        if (failed.length) failedInserts.push({ id: `${i.id}`, reason: failed.join(', ') })
        else validInserts.push(i)
    }

    if (!validInserts.length) return res.status(400).json({ error: 'No valid options found to import', failed: failedInserts })

    // Query
    console.log((`INSERT INTO part_list (part_number, part_type, minimum_stock, models) VALUES ${validInserts.map(m => `('${m.id}', '${m.part_type}', ${m.minimum_stock}, '${m.models.split('/').join(',')}')`).join(', ')}`))
    const query = await pool.request().query(`INSERT INTO part_list (part_number, part_type, minimum_stock, models) VALUES ${validInserts.map(m => `('${m.id}', '${m.part_type}', ${m.minimum_stock}, '${m.models.split('/').join(',')}')`).join(', ')}`)
        .catch(er => { return { isErrored: true, error: er } })
    if (query.isErrored) {
        console.log(query.error)
        return res.status(500).json({ error: query.error, failed: failedInserts })
    }

    // Return
    return res.status(200).json({ message: 'Success', failed: failedInserts })
})


module.exports = Router