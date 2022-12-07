const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const jwt_decode = require('jwt-decode')
const settings = require('../settings.json')
const axios = require('axios')
const cachedUsersId = {}

module.exports = {
    toUID(token) {
        return new Promise(async (res, rej) => {
            // Return if the bearer is null
            if (token == 'Bearer null') return rej({ isErrored: true, error: 'Bad token' })

            if (cachedUsersId[token]) return res(cachedUsersId[token])

            // Validate token
            let id = await module.exports.validateToken(token).catch(er => false)
            if (!id) return rej('Invalid token')

            // Decode token
            try {
                const decoded = jwt_decode(token)

                //interpret parsing
                const email = decoded.unique_name
                const tenant = decoded.tid
                const appid = decoded.appid
                const oid = decoded.oid

                // Validate oid == id
                if (oid !== id) return rej({ isErrored: true, error: 'Bad oid' })

                //validate tenant and appid
                if (tenant !== require('../settings.json').tenantId) return rej({ isErrored: true, error: 'Bad domain' })
                if (appid !== require('../settings.json').appid) return rej({ isErrored: true, error: 'bad appid' })

                // Establish SQL Connection
                let pool = await sql.connect(config)

                //query
                let resu = await pool.request().query(`SELECT id, is_archived FROM users WHERE oid = '${oid}'`)
                    .catch(er => { return { isErrored: true, error: er } })
                if (resu.rowsAffected == 0) return rej({ isErrored: true, error: 'User Not Found' })
                if (resu.recordset[0].is_archived) return rej({ isErrored: true, error: 'archived' })

                // Add to cache
                cachedUsersId[token] = resu.recordset[0].id

                // Return UID
                return res(resu.recordset[0].id)
            } catch (er) {
                return rej({ isErrored: true, err: er })
            }
        })
    },
    checkForAdmin(token) {
        return new Promise(async (res, rej) => {
            // Return if the bearer is null
            if (token == 'Bearer null') return rej({ isErrored: true, error: 'Bad token' })

            // Check if token is cached
            if (cachedUsersId[token]) {
                let pool = await sql.connect(config)
                let resu = await pool.request().query(`SELECT id, is_admin, is_archived FROM users WHERE id = '${cachedUsersId[token]}'`)
                if (resu.rowsAffected == 0) return rej('User not found')
                if (resu.recordset[0].is_archived) return rej({ isErrored: true, error: 'archived' })
                return res({ uid: resu.recordset[0].id, isAdmin: resu.recordset[0].is_admin })
            }

            // Validate token
            let id = await module.exports.validateToken(token).catch(er => false)
            if (!id) return rej('Invalid token')

            try {
                // Decode token
                const decoded = jwt_decode(token)

                //interpret parsing
                const email = decoded.unique_name
                const tenant = decoded.tid
                const appid = decoded.appid
                const oid = decoded.oid

                // Validate oid == id
                if (oid !== id) return rej({ isErrored: true, error: 'Bad oid' })

                //validate tenant and appid
                if (tenant !== require('../settings.json').tenantId) return rej('Bad domain')
                if (appid !== require('../settings.json').appid) return rej('bad appid')

                // Establish SQL Connection
                let pool = await sql.connect(config)

                //query
                let resu = await pool.request().query(`SELECT id, is_admin, is_archived FROM users WHERE oid = '${oid}'`)
                    .catch(er => { return { isErrored: true, error: er } })
                if (resu.rowsAffected == 0) return rej('User not found')
                if (resu.recordset[0].is_archived) return rej({ isErrored: true, error: 'archived' })

                cachedUsersId[token] = resu.recordset[0].id
                return res({ uid: resu.recordset[0].id, isAdmin: resu.recordset[0].is_admin })
            } catch (er) {
                return rej(er)
            }
        })
    },
    checkPermissions(token) {
        return new Promise(async (res, rej) => {
            try {
                // Get Token
                const { uid, isAdmin } = await this.checkForAdmin(token)
                    .catch(er => { return { uid: 'errored', isAdmin: er } })
                if (uid == 'errored') return rej(isAdmin)

                // Establish SQL Connection
                let pool = await sql.connect(config)

                //query
                let resu = await pool.request().query(`SELECT * FROM user_permissions WHERE id = '${uid}'`)
                return res({ uid, isAdmin, permissions: resu.recordset[0] })
            } catch (er) {
                return rej({ isErrored: true, err: er })
            }
        })
    },
    getTSheetsToken(token) {
        return new Promise(async (res, rej) => {
            let { uid } = await this.toUID(token)
                .catch(er => { return { uid: null } })
            if (!uid) return rej({ isErrored: true, err: 'Missing UID' })

            // Establish SQL Connection
            let pool = await sql.connect(config)

            //query
            let resu = await pool.request().query(`SELECT ts_authorization,ts_refresh,ts_expires,ts_uid FROM users WHERE id = '${uid}'`)
                .then(d => d.recordset)
                .catch(er => { return { isErrored: true, err: er } })

            if (resu.length !== 1) return rej(`${resu.length} results from uid ${uid}`)

            if (!resu[0].ts_authorization || !resu[0].ts_refresh || !resu[0].ts_expires || !resu[0].ts_uid) return rej('no token info')

            if (resu[0].ts_expires < Date.now()) {
                // renew
                let q = await axios.post('https://rest.tsheets.com/api/v1/grant',
                    {
                        grant_type: 'refresh_token',
                        client_id: settings.tsheets.clientId,
                        client_secret: settings.tsheets.clientSecret,
                        refresh_token: resu[0].ts_refresh
                    }, {
                    headers: {
                        Authorization: resu[0].ts_authorization,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                })

                const { access_token, expires_in, token_type, refresh_token, user_id, company_id, client_url } = q.data
                const expire = Date.now() + (parseInt(expires_in) * 1000)
                pool.request().query(`UPDATE users SET ts_authorization = '${token_type} ${access_token}', ts_expires = '${expire.toISOString().slice(0, 19).replace('T', ' ')}', ts_refresh = '${refresh_token}', ts_uid = ${user_id} WHERE id = '${uid}'`)
                return res({ token: access_token })

            } else return res({ token: resu[0].ts_authorization })
        })
    },
    validateToken(token) {
        return new Promise(async (res, rej) => {
            // Call microsoft api to validate token
            let q = await axios.get('https://graph.microsoft.com/v1.0/me', {
                headers: { Authorization: token }
            }).catch(er => {
                console.log(er.response.data, token)
            })
            if (!q.data || !q.data.id) return rej('Invalid token')
            res(q.data.id)
        })
    }
}