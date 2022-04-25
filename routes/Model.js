const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')

Router.get('/fetch/:id', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    //Get date from header
    let id = req.params.id

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data

    // Query the DB
    let asset_tracking = await pool.request().query(`SELECT * FROM assets WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let data = {
        records: asset_tracking.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/catalog', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    // Establish SQL Connection
    let pool = await sql.connect(config)
    const { offset, limit, orderBy } = req.body

    // Data Validation
    let errors = []
    if (isNaN(parseInt(offset))) errors.push('Invalid Offset')
    if (isNaN(parseInt(limit))) errors.push('Invalid Limit')
    if (!orderBy) errors.push('Invalid orderBy')
    if (errors.length > 0) return res.status(400).json({ error: errors })

    // Get Data
    let rq = await pool.request().query(`SELECT * FROM models ORDER BY ${orderBy} DESC OFFSET ${offset} ROWS FETCH ${offset == 0 ? 'FIRST' : 'NEXT'} ${limit} ROWS ONLY`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (rq.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let data = {
        records: rq.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/edit', async (req, res) => {
    // Get UID from token header and check for admin
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_models) return res.status(401).json({ error: 'User is not an administrator and doesnt have edit models perms' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data
    const { id, change, value } = req.body

    // Data Validation
    let errors = []
    if (!id) errors.push('Model_number not provided')
    if (!value) errors.push('No value provided')
    else switch (change) {
        case 'model_number':
            let resu = pool.request().query(`SELECT model_number FROM models WHERE model_number = '${value}'`)
                .catch(er => { console.log(er); return { isErrored: true, error: er } })
            if (resu.isErrored) return res.status(501).json({ error: resu.error })
            if (resu.recordset) errors.push('Model number already exists')
            break;
        case 'name':
            //no further validation needed
            break;
        case 'manufacturer':
            //no further validation needed
            break;
        case 'image':
            //no further validation needed
            break;
        case 'category':
            if (!require('../settings.json').deviceTypes.includes(value)) errors.push("Category not recognized")
            break;
        default:
            errors.push('Unknown change type')
            break;
    }
    if (errors.length > 0) return res.status(400).json({ errors })

    // Query
    let query = await pool.request().query(`UPDATE models SET ${change} = '${value}' WHERE model_number = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(500).json({ message: 'Query Error' })
    }
    return res.status(200).json({ message: 'success' })
})

Router.post('/new', async (req, res) => {
    // Get UID from token header and check for admin
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    if (!isAdmin && !permissions.edit_models) return res.status(401).json({ error: 'User is not an administrator and doesnt have edit models perms' })

    // Get Data
    const { model_number, model_name, manufacturer, category, image } = req.body

    // Data Validation
    let issues = []

    if (!model_number) issues.push('Model Number Not Provided')
    if (!model_name) issues.push('Model Name Not Provided')
    if (!manufacturer) issues.push('Manufacturer Not Provided')
    if (!category || !require('../settings.json').deviceTypes.includes(category)) issues.push('Category not provided, or was invalid')

    if (issues.length > 0) return res.status(400).json({ message: 'Unsuccessful', issues: issues })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    let query = await pool.request().query(`INSERT INTO models (model_number, name, category, manufacturer, image) VALUES ('${model_number}','${model_name}','${category}','${manufacturer}', '${image || null}')`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Unable to insert' })
    }
    return res.status(200).json({ message: 'success' })
})

Router.get('/get/:search', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    //Get date from header
    const search = req.params.search

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data

    let model_query = await pool.request().query(`SELECT * FROM models WHERE model_number = '${search}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (model_query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let resu
    if (model_query.recordset.length === 1) resu = { ...model_query.recordset[0] }
    else resu = { notFound: true }

    // Return Data
    return res.status(200).json(resu)
})

Router.get('/all', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let model_query = await pool.request().query(`SELECT * FROM models`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (model_query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Unable to get models' })
    }

    // Organize Data
    let models = [...model_query.recordset]

    // Return Data
    return res.status(200).json({ models })
})

Router.get('/all/numbers', async (req, res) => {
    // Get UID from header
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB
    let model_query = await pool.request().query(`SELECT model_number FROM models`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (model_query.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Unable to get models' })
    }

    // Organize Data
    let models = [...model_query.recordset]

    // Return Data
    return res.status(200).json({ models })
})

module.exports = Router