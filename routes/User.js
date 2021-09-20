const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const jwt_decode = require('jwt-decode')

/**
 * 
 */
Router.post('/verify', async (req, res) => {
    //get and parse token
    const { token } = req.body
    const decoded = jwt_decode(token)

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
    let resu = await pool.request().query(`SELECT id FROM users WHERE username = '${username}' AND email = '${email}'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (resu.isErrored) return res.status(500).json(resu)
    if (resu.rowsAffected[0] == 0) {
        resu = await pool.request().query(`INSERT INTO users (username, is_dark_theme, is_admin, email, title, name) VALUES ('${username}','1','0','${email}','Employee', '${name}')`)
            .catch(er => { return { isErrored: true, error: er } })
    }
    if (resu.isErrored) return res.status(500).json(resu)
    else return res.status(200).json(resu.recordset)
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