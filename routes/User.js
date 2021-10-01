const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const jwt_decode = require('jwt-decode')
const tokenParsing = require('../lib/tokenParsing')

/**
 * 
 */
Router.get('/verify', async (req, res) => {
    // Check token using toUid function
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (!uid.errored) return res.status(200).json({ message: `Success`, uid })

    //get and parse token
    const decoded = jwt_decode(req.headers.authorization)

    //interpret parsing
    const name = decoded.name
    const email = decoded.unique_name
    const tenant = decoded.tid
    const appid = decoded.appid

    //validate tenant and appid
    if (tenant !== require('../settings.json').tenantId) return res.status(401).json({ error: 'Bad domain' })
    if (appid !== require('../settings.json').appid) return res.status(401).json({ error: 'bad appid' })

    //grab username
    const username = email.substr(0, email.indexOf('@'))

    // Establish SQL Connection
    let pool = await sql.connect(config)

    //query
    let resu = await pool.request().query(`INSERT INTO users (username, is_dark_theme, is_admin, email, title, name) VALUES ('${username}','1','0','${email}','Employee', '${name}')`)
        .catch(er => { return { isErrored: true, error: er } })
    if (resu.isErrored) return res.status(500).json({ error: resu.error })
    res.status(200).json({ message: `Success` })

    // Create user permission table
    uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { console.log(`Unable to create user_permissions for: ${name}`); return })
    pool.request().query(`INSERT INTO user_permissions (id) VALUES ('${uid}')`)
    return
})

Router.get('/permissions', async (req, res) => {
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (errored) return res.status(401).json({ error: er })
    res.status(200).json({ uid, isAdmin, permissions })
})

Router.get('/all', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (!isAdmin && !permissions.view_users) return res.status(403).json({ error: 'Forbidden' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    //query
    let users = await pool.request().query(`SELECT id, name, email, title FROM users`)
        .catch(er => { return { isErrored: true, error: er } })
    if (users.isErrored) return res.status(500).json({ error: users.error })

    let perms = await pool.request().query(`SELECT * FROM user_permissions`)
        .catch(er => { return { isErrored: true, error: er } })
    if (perms.isErrored) return res.status(500).json({ error: perms.error })

    const data = []

    for (let i of users.recordset) for (let j of perms.recordset) if (j.id == i.id)
        data.push({ ...i, ...j })

    return res.status(200).json({ users: data })
})

Router.get('/names', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (!isAdmin && !permissions.view_users) return res.status(403).json({ error: 'Forbidden' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    //query
    let users = await pool.request().query(`SELECT id, name FROM users`)
        .catch(er => { return { isErrored: true, error: er } })
    if (users.isErrored) return res.status(500).json({ error: users.error })


    return res.status(200).json({ users: users.recordset })
})

Router.post('/perm/edit', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (!isAdmin && !permissions.edit_users) return res.status(403).json({ error: 'Forbidden' })

    // Data validation
    console.log(req.body)
    const { id, perms } = req.body
    if (!id || isNaN(parseInt(id))) return res.status(400).json({ error: 'Invalid UID provided' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get current permissions
    let resu = await pool.request().query(`SELECT * FROM user_permissions WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (resu.isErrored) return res.status(500).json({ error: resu.error })
    if (resu.recordset.length < 1) return res.status(500).json({ error: 'User not found' })
    delete resu.recordset[0].id
    let changeString = Object.keys(resu.recordset[0]).map(m => `${m} = ${perms.includes(m) ? '1' : '0'}`).join(', ')
    console.log(`UPDATE user_permissions SET ${changeString} WHERE id = '${id}'`)
    let res2 = await pool.request().query(`UPDATE user_permissions SET ${changeString} WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (res2.isErrored) return res.status(500).json({ error: resu.error })

    if (!changeString || changeString == '') return res.status(200).json({ message: 'No Changes Made' })
})

module.exports = Router
