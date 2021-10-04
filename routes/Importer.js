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
    const model_query = await pool.request().query(`SELECT model_number FROM models`)
        .catch(er => { return { isErrored: true, error: er } })
    if (model_query.isErrored) return res.status(500).json({ error: model_query.error })
    const models = []
    for (let i in model_query.recordset) models.push(i.model_number)


    // Data validation
    let validInserts = []
    for (let i of data) {
        if (!i.id || !i.model_number) continue;
        if (!models.includes(i.model_number)) continue;
        validInserts.push(i)
    }

    if (validInserts.length < 1) return res.status(400).json({ error: 'No valid options found to import' })

    // Query
    const query = await pool.request().query(`INSERT INTO assets (id, model_number, status) VALUES ${validInserts.map(m => `(${m.id.trim()}, ${m.model_number.trim()}, ${newAssetStatusCode.trim()})`).join(', ')}`)
        .catch(er => { return { isErrored: true, error: er } })
    if (query.isErrored) {
        console.log(query.error)
        res.status(500).json({ error: query.error })
    }

    // Return
    return res.status(200).json({ message: 'Success' })
})

Router.post('/model', async (req, res) => {
    // Check for importer permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (!isAdmin && !permissions.use_importer) return res.status(403).json({ error: 'Forbidden' })

    // Get json data
    const data = req.body
    console.log(data)

    // Establish SQL Connection
    let pool = await sql.connect(config)


    // Data validation
    let validInserts = []
    for (let i of data) {
        if (!i.id || !i.name || !i.manufacturer) continue;
        if (!deviceTypes.includes(i.device_type)) continue
        validInserts.push(i)
    }
    console.log(validInserts)

    if (validInserts.length < 1) return res.status(400).json({ error: 'No valid options found to import' })

    // Query
    const query = await pool.request().query(`INSERT INTO models (model_number, name, category, manufacturer) VALUES ${validInserts.map(m => `(${m.id.trim()}, ${m.name.trim()}, ${m.device_type.trim()}, ${m.manufacturer.trim()})`).join(', ')}`)
        .catch(er => { return { isErrored: true, error: er } })
    if (query.isErrored) {
        console.log(query.error)
        return res.status(500).json({ error: query.error })
    }

    // Return
    return res.status(200).json({ message: 'Success' })
})

module.exports = Router