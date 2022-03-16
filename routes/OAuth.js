const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const axios = require('axios').default
const config = require('../settings.json').SQLConfig

const settings = require('../settings.json')
const tokenParsing = require('../lib/tokenParsing')

Router.post('/ts/login', async (req, res) => {
    const { accessToken } = req.body

    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })
    let d = await axios.post('https://rest.tsheets.com/api/v1/grant', {
        grant_type: 'authorization_code',
        client_id: settings.tsheets.clientId,
        client_secret: settings.tsheets.clientSecret,
        code: accessToken,
        redirect_uri: settings.tsheets.redirectURI
    }).then(d => d.data)

    const { access_token, expires_in, token_type, refresh_token, user_id, company_id, client_url } = d

    const expire = Date.now() + (parseInt(expires_in) * 1000)

    // Establish SQL Connection
    let pool = await sql.connect(config)

    let q = pool.request().query(`UPDATE users SET ts_authorization = '${token_type} ${access_token}', ts_expires = '${expire.toISOString().slice(0, 19).replace('T', ' ')}', ts_refresh = '${refresh_token}', ts_uid = ${user_id} WHERE id = '${uid}'`)
})

Router.get('/ts/verify', async (req, res) => {
    let uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(400).json({ error: uid.er })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    let eq = await pool.request().query(`SELECT * FROM users WHERE id = '${uid}'`)
        .then(d => d.recordset)
        .catch(er => { return { uid: { errored: true, er } } })
    if (eq.errored) return res.status(400).json({ error: eq.er })
    if (eq.length !== 1) return res.status(500).json({ error: `${eq.length} users found with uid of ${uid}` })

    if (!eq[0].ts_authorization) return res.status(200).json({ token: null })

    let d = new Date(eq[0].ts_expires)
    if (d <= Date.now()) {
        // renew
        let q = await axios.post('https://rest.tsheets.com/api/v1/grant',
            {
                grant_type: 'refresh_token',
                client_id: settings.tsheets.clientId,
                client_secret: settings.tsheets.clientSecret,
                refresh_token: eq[0].ts_refresh
            }, {
            headers: {
                Authorization: eq[0].ts_authorization,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
            .catch(er => { return { isErrored: true, er } })
        if (q.isErrored) return res.status(500).json({ error: q.er })

        const { access_token, expires_in, token_type, refresh_token, user_id, company_id, client_url } = q.data
        const expire = Date.now() + (parseInt(expires_in) * 1000)
        pool.request().query(`UPDATE users SET ts_authorization = '${token_type} ${access_token}', ts_expires = '${expire.toISOString().slice(0, 19).replace('T', ' ')}', ts_refresh = '${refresh_token}', ts_uid = ${user_id} WHERE id = '${uid}'`)
        return res.status(200).json({ token: access_token })
    } else {
        return res.status(200).json({ token: eq[0].ts_authorization })
    }
})

module.exports = Router