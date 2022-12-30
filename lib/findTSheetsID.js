const axios = require('axios');
const sql = require('mssql');
const config = require('../settings.json').SQLConfig
const tsSettings = require('../settings.json').tsheets

// Adding a cache to prevent spamming the TSheets API if we're looking up multiple users
const cache = {}

module.exports = {
    findTSheetsID: (id, cacheID = undefined) => {
        return new Promise(async (res, rej) => {
            // Connect to DB
            const pool = await sql.connect(config)

            // Get users
            let user_data = await pool.request().query(`SELECT id, tsheets_id, name FROM users WHERE id = ${id}`).then(r => r.recordset)
            if (user_data.length == 0) return rej(null)
            user_data = { id: user_data[0].id, tsheets_id: user_data[0].tsheets_id, first_name: user_data[0].name.split(' ')[0], last_name: user_data[0].name.split(' ')[1] }

            // If we already have a TSheets ID, return it
            if (user_data.tsheets_id) return res(user_data.tsheets_id)

            // Get TSheets users from cache or API
            let tsheets_users
            if (cacheID && cache[cacheID]) tsheets_users = cache[cacheID]
            else {
                let tsheets_data = await axios.get(`https://rest.tsheets.com/api/v1/users`, {
                    headers: {
                        Authorization: `Bearer ${tsSettings.token}`
                    }
                })
                tsheets_users = Object.values(tsheets_data.data.results.users)
                cache[cacheID] = tsheets_users
            }

            // Attempt to match first and last name
            for (let i of tsheets_users) {
                if (!i.first_name || !i.last_name) continue
                if (i.first_name.toLowerCase().replace(/\W/gi, '') == user_data.first_name.toLowerCase().replace(/\W/gi, '') && i.last_name.toLowerCase().replace(/\W/gi, '') == user_data.last_name.toLowerCase().replace(/\W/gi, '')) {
                    await pool.request().query(`UPDATE users SET tsheets_id = ${i.id} WHERE id = ${user_data.id}`)
                    return res(i.id)
                }
            }

            return res(null)
        })

    }
}