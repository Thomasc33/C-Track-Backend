const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const jwt_decode = require('jwt-decode')
const tokenParsing = require('../lib/tokenParsing')
const discrepencyChecks = require('../lib/discrepencyChecks')

/**
 * 
 */
Router.get('/verify', async (req, res) => {
    // Check token using toUid function
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!uid.errored) return res.status(200).json({ message: `Success`, uid })

    if (uid.error == 'archived') return res.status(400).json({ message: 'archived' })


    //get and parse token
    const decoded = jwt_decode(req.headers.authorization)

    //interpret parsing
    const name = decoded.name
    const email = decoded.unique_name
    const tenant = decoded.tid
    const appid = decoded.appid

    //validate tenant and appid
    if (tenant !== require('../settings.json').tenantId) return res.status(400).json({ error: 'Bad domain' })
    if (appid !== require('../settings.json').appid) return res.status(400).json({ error: 'bad appid' })

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
        .catch(er => { return { uid: { errored: true, er } } })
    if (errored) return res.status(400).json({ error: er })
    res.status(200).json({ uid, isAdmin, permissions })
})

Router.get('/all', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin && !permissions.view_users) return res.status(401).json({ error: 'Forbidden' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    //query
    let users = await pool.request().query(`SELECT id, name, email, title FROM users WHERE is_archived = 0`)
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

Router.get('/all/admin', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin } = await tokenParsing.checkForAdmin(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin) return res.status(401).json({ error: 'Forbidden' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    //query
    let users = await pool.request().query(`SELECT id, name, is_admin, is_archived FROM users`)
        .catch(er => { return { isErrored: true, error: er } })
    if (users.isErrored) return res.status(500).json({ error: users.error })

    return res.status(200).json({ users: users.recordset })
})

Router.get('/names', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin && !permissions.view_users) return res.status(401).json({ error: 'Forbidden' })

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
        .catch(er => { return { uid: { errored: true, er } } })
    if (errored) return res.status(500).json({ er })
    if (!isAdmin && !permissions.edit_users) return res.status(401).json({ error: 'Forbidden' })

    // Data validation
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
    let res2 = await pool.request().query(`UPDATE user_permissions SET ${changeString} WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (res2.isErrored) return res.status(500).json({ error: resu.error })

    if (!changeString || changeString == '') return res.status(200).json({ message: 'No Changes Made' })
    return res.status(200).json({ message: 'success' })
})

Router.post('/perm/edit/admin', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin } = await tokenParsing.checkForAdmin(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin) return res.status(401).json({ error: 'Forbidden' })

    // Data validation
    const { id } = req.body
    const setAdminTo = req.body.val
    if (!id || isNaN(parseInt(id))) return res.status(400).json({ error: 'Invalid UID provided' })
    if (![0, 1].includes(setAdminTo)) return res.status(400).json({ error: 'setAdminTo is not binary' })

    // Block user from removing admin from themselves
    if (uid == id) return res.status(403).json({ message: 'Unable to remove admin from yourself' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query
    let resu = await pool.request().query(`UPDATE users SET is_admin = ${setAdminTo} WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (resu.isErrored) return res.status(500).json({ error: resu.error })

    return res.status(200).json({ message: 'Success' })
})

Router.post('/management/edit/archive', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin } = await tokenParsing.checkForAdmin(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin) return res.status(401).json({ error: 'Forbidden' })

    // Data validation
    const { id } = req.body
    const setArchiveTo = req.body.val
    if (!id || isNaN(parseInt(id))) return res.status(400).json({ error: 'Invalid UID provided' })
    if (![0, 1].includes(setArchiveTo)) return res.status(400).json({ error: 'setArchiveTo is not binary' })

    // Block user from removing admin from themselves
    if (uid == id) return res.status(403).json({ message: 'Unable to archive yourself' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query
    let resu = await pool.request().query(`UPDATE users SET is_archived = ${setArchiveTo} WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (resu.isErrored) return res.status(500).json({ error: resu.error })

    return res.status(200).json({ message: 'Success' })
})

Router.post('/management/edit/title', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (errored) return res.status(500).json({ er })
    if (!isAdmin && (!permissions || !permissions.edit_users)) return res.status(401).json({ error: 'Forbidden' })

    // Data validation
    const { id, title } = req.body
    if (!id || isNaN(parseInt(id))) return res.status(400).json({ error: 'Invalid UID provided' })
    if (!title || title.length >= 50) return res.status(400).json({ error: 'Invalid Title' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query
    let resu = await pool.request().query(`UPDATE users SET title = '${title.replace("'", '')}' WHERE id = '${id}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (resu.isErrored) return res.status(500).json({ error: resu.error })

    return res.status(200).json({ message: 'Success' })
})

Router.post('/pref/jobs/favorites', async (req, res) => {
    // Get UID
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
    if (!uid) return res.status(400).json({ er: 'No UID' })

    // Get hrly/asset type
    const { type, isRemove, job_id } = req.body
    if (!['hrly', 'asset'].includes(type)) return res.status(400).json({ er: 'Missing type (hrly/asset)' })
    if (![0, 1].includes(isRemove)) return res.status(400).json({ error: 'isRemove is not binary' })
    if (!job_id) return res.status(400).json({})

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Query the DB for baseline
    let que = await pool.request().query(`SELECT ${type == 'hrly' ? 'hrly_favorites' : 'asset_favorites'} FROM users WHERE id = ${uid}`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (que.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Unable to get job codes' })
    }

    // Organize Data
    let r = que.recordset[0]
    let d
    if (type == 'hrly') { if (r.hrly_favorites) d = r.hrly_favorites.split(',') }
    else if (r.asset_favorites) d = r.asset_favorites.split(',')

    if (isRemove) {
        if (!d) return res.status(400).json({ message: 'No favorites found to remove' })
        let ind = d.indexOf(job_id)
        if (ind === -1) return res.status(400).json({ message: `${job_id} not found in favorites list, cant remove` })
        d.splice(ind, 1)
    } else {
        if (!d) d = [job_id]
        else {
            if (d.includes(job_id)) return res.status(400).json({ message: `${job_id} already found in favorites` })
            d.push(job_id)
        }
    }

    let q = await pool.request().query(`UPDATE users SET ${type == 'hrly' ? 'hrly_favorites' : 'asset_favorites'} = '${d.map(m => m).join(',')}' WHERE id = ${uid}`)
        .catch(er => { return { isErrored: true, er: er } })

    if (q.isErrored) return res.status(500).json({ er })

    // Return Data
    return res.status(200).json({ message: 'ok' })
})

Router.get('/notifications', async (req, res) => {
    // Check token and permissions
    const uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { console.log(er); return { uid: { errored: true, er } } })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    //Query
    let q = await pool.request().query(`SELECT * FROM notifications WHERE user_id = '${uid}' AND archived = '0'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ error: q.error })

    // Organize Data
    let read = [], unread = []
    for (let i of q.recordset) if (i.read) read.push(i); else unread.push(i)

    return res.status(200).json({ unread, read })
})

Router.post('/notification/archive', async (req, res) => {
    // Check token and permissions
    const uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { console.log(er); return { uid: { errored: true, er } } })

    // Get ID from header
    const { id } = req.body

    // Validate header
    if (!id || isNaN(parseInt(id))) return res.status(400).json({ message: 'missing/invalid notification id:'.concat(id) })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    //Query
    let q = await pool.request().query(`UPDATE notifications SET archived = 1 WHERE id = '${id}' AND user_id = '${uid}'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ error: q.error })

    return res.status(200).json({ message: 'ok' })
})

Router.post('/notification/important', async (req, res) => {
    // Check token and permissions
    const uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { console.log(er); return { uid: { errored: true, er } } })

    // Get ID from header
    const { id } = req.body

    // Validate header
    if (!id || isNaN(parseInt(id))) return res.status(400).json({ message: 'missing/invalid notification id:'.concat(id) })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    console.log('at query')

    //Query
    let q = await pool.request().query(`UPDATE notifications SET important = 1 ^ important WHERE id = '${id}' AND user_id = '${uid}'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ error: q.error })

    return res.status(200).json({ message: 'ok' })
})

Router.post('/notification/read', async (req, res) => {
    // Check token and permissions
    const uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { console.log(er); return { uid: { errored: true, er } } })

    // Get ID from header
    const { ids } = req.body

    // Validate header
    if (!ids || !ids.length) return res.status(400).json({ message: 'missing/invalid notification ids:'.concat(ids.join(', ')) })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    //Query
    let q = await pool.request().query(`UPDATE notifications SET [read] = '1' WHERE ${ids.map(id => `id = '${id}'`).join(' OR ')} AND user_id = '${uid}'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (q.isErrored) return res.status(500).json({ error: q.error })

    return res.status(200).json({ message: 'ok' })
})

Router.get('/discrepancy', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin && !permissions.use_discrepancy_check) return res.status(401).json({ error: 'Forbidden' })

    // Call discrepancycheck
    let count = await discrepencyChecks.check(uid)

    // Return
    return res.status(200).json({ message: `Complete`, count })
})

Router.get('/discrepancy/all', async (req, res) => {
    // Check token and permissions
    const { uid, isAdmin, permissions, errored, er } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (!isAdmin && !permissions.use_all_discrepancy_check) return res.status(401).json({ error: 'Forbidden' })

    // Call discrepancycheck
    await discrepencyChecks.check()

    // Return
    return res.status(200).json({ message: `Complete` })
})

module.exports = Router
