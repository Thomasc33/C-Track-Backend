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
        .catch(er => { return { errored: true, er } })
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
    if (model_query.isErrored) return res.status(500).json({ error: model_query.error })
    const assets = new Set(Array.from(assets_query.recordset, (v, k) => { return v.id }))

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
        if (assets.has(i.id)) { failedAssets.push({ id: `${i.id}`, reason: `Asset already exists` }); continue; }

        // Add to valid inserts
        validInserts.push(i)
        assets.add(i.id)
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
        .catch(er => { return { errored: true, er } })
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

module.exports = Router