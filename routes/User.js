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
    return res.status(200).json({ message: `Success` })
})

module.exports = Router

/**
 * 
 * @param {Date} date 
 * @returns 
 */
function getDate(date) {
    date = new Date(date)
    return date.toISOString().split('T')[0]
}