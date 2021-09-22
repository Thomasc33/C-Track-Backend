const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const jwt_decode = require('jwt-decode')
const cachedUsersId = {}

module.exports = {
    toUID(token) {
        return new Promise(async (res, rej) => {
            if (cachedUsersId[token]) return res(cachedUsersId[token])
            //decode token
            try {
                const decoded = jwt_decode(token)

                //interpret parsing
                const email = decoded.unique_name
                const tenant = decoded.tid
                const appid = decoded.appid

                //validate tenant and appid
                if (tenant !== require('../settings.json').tenantId) return rej('Bad domain')
                if (appid !== require('../settings.json').appid) return rej('bad appid')

                // Establish SQL Connection
                let pool = await sql.connect(config)

                //query
                let resu = await pool.request().query(`SELECT id FROM users WHERE email = '${email}'`)
                    .catch(er => { return { isErrored: true, error: er } })

                if (resu.rowsAffected == 0) return rej('User not found')
                cachedUsersId[token] = resu.recordset[0].id
                return res(resu.recordset[0].id)
            } catch (er) {
                return rej({ isErrored: true, err: er })
            }
        })
    }
}