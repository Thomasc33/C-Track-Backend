const EventEmitter = require('node:events');
const LogEmitter = new EventEmitter();
const sql = require('mssql')
const config = require('../settings.json').SQLConfig

LogEmitter.on('log', async part => {
    // Connect to DB
    let pool = await sql.connect(config)

    // Get part information
    let q = await pool.request().query(`SELECT * FROM part_list WHERE id = '${part}'`)
        .catch(er => { return { er, isErrored: true } })
        .then(q => q.recordset[0])
    if (q.isErrored) { console.log(q.er) }

    // Check if stock is below threshold
    let thresh = q.minimum_stock
    if (!thresh) return

    // Return if notification would go to no one
    if (!q.watchers) return

    // Get current stock
    let stock = await pool.request().query(`SELECT * FROM parts WHERE location IS NULL AND part_id = '${part}'`)
        .catch(er => { return { er, isErrored: true } })
        .then(q => q.rowsAffected[0])
    if (stock.isErrored) return console.log(stock.er)

    // Check if stock is below threshold
    if (stock < thresh) {
        // Send notification to anyone subscribed
        pool.request().query(`INSERT INTO notifications (user_id, title, message, color ${q.image ? ', image' : ''}) VALUES ${q.watchers.split(',').map(watcher => `('${watcher}', '${q.part_number} is low on stock', '${q.part_number} (${q.part_type} for ${q.model_number}${q.alt_models ? `, ${q.alt_models.split(',').join(', ')}` : ''}) is low on stock ${stock}/${thresh}. Please order more.', '#a84432' ${q.image ? `, '${q.image}'` : ''})`).join(',')}`)
    }
})

module.exports = {
    LogEmitter

}