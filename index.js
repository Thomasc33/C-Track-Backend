// Packages
const fs = require('fs')
const express = require('express')
const https = require('https')
const http = require('http')
const sql = require('mssql')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const tokenParsing = require('./lib/tokenParsing')
const cron = require('cron')
const discrepancies = require('./lib/discrepencyChecks')

//Globals
const app = express()
const router = express.Router()

// DB connectors
console.log('Starting Database connectors')
const config = require('./settings.json').SQLConfig
async function dbConnect() {
    try {
        let pool = await sql.connect(config)
        await pool.request().query(`SELECT * FROM users WHERE id = 1`)
    }
    catch (err) {
        throw err
    }
}
dbConnect()

// API Setup//
console.log('Starting API')
const credentials = { // Certificates for SSL encryption, required to make everything operate over HTTPS
    key: fs.readFileSync('./certs/key.pem', 'utf-8'),
    cert: fs.readFileSync('./certs/cert.pem', 'utf-8'),
    // ca: fs.readFileSync('./certs/chain.pem', 'utf-8')
}

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS setup (ran into issues with CORS on other projects)
app.use(cors())

// Rate Limit
const apiLimit = rateLimit({
    windowMs: 5 * 1000, //10 seconds
    max: 50 //50 requests
})
app.use('/a/', apiLimit)

// Check Client Version
app.use((req, res, next) => {
    let version = req.headers['x-version']
    if (version == 'ignore') return next()
    if (!version || version !== require('./package.json').version) return res.status(426).json({ message: 'An upgrade is available. Please refresh the page.' })
    next()
})

// Basic SQL Injection escaping
app.use((req, res, next) => {
    if (req.body) for (let i in req.body) try { req.body[i] = req.body[i].replace(/--/g, '-').replace(/'/g, "''") } catch (er) { }
    next()
})

const ignoreLogURLS = new Set([
    '/a/permissions',
    '/a/user/notifications',
    '/notifications',
    '/a/job/favorites?type=asset',
    '/a/job/favorites?type=hrly',
    '/a/job/all/type?type=hrly',
    '/a/job/all/type?type=asset',
    '/all/type?type=hrly',
    '/all/type?type=asset',
    '/favorites?type=asset',
    '/favorites?type=hrly',
])

// Request Logging
app.use((req, res, next) => {
    if (ignoreLogURLS.has(req.url)) return next()
    let d = new Date();
    let formatted_date = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() + " " + d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();
    let log = `[${formatted_date}] ${req.method}:${req.url}`;
    console.log(log);
    next();
})

// Historical Logging
app.use(async (req, res, next) => {
    if (!req.headers.authorization) return res.status(403).json('Missing authorization header')
    next()
    if (ignoreLogURLS.has(req.url)) return

    // Get UID
    const uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return

    // Get Route
    const route = `${req.method}:${req.url}`

    // Get IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress

    // Get Time
    const time = new Date().toISOString().replace(/[a-z]/gi, ' ')

    // Attempt to get body
    const body = req.body
    let bodyString = JSON.stringify(body)

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Return if required data points are missing
    if (!uid || !time) return

    // Return if uid is not a number
    if (isNaN(parseInt(uid))) return

    // Send to DB
    pool.request().query(`INSERT INTO history ([user], time, ip_address, route, body) VALUES ('${uid}','${time}','${ip}','${route}','${bodyString}')`)
        .catch(er => { console.log('error when inserting into log: ', er) })

})

// Directs all trafic going to '/a' to the router
app.use('/a/home', require('./routes/Home'))
app.use('/a/asset', require('./routes/Asset'))
app.use('/a/job', require('./routes/Jobs'))
app.use('/a/user', require('./routes/User'))
app.use('/a/hourly', require('./routes/Hourly'))
app.use('/a/importer', require('./routes/Importer'))
app.use('/a/model', require('./routes/Model'))
app.use('/a/reports', require('./routes/Reports').Router)
// app.use('/a/oauth', require('./routes/OAuth'))
app.use('/a/parts', require('./routes/Parts'))
app.use('/a/misc', require('./routes/Misc'))
app.use('/a/branch', require('./routes/Branch'))


// Starts HTTP Server
// Will switch to HTTPS for prod
const httpServer = https.createServer(credentials, app)
httpServer.listen(require('./settings.json').port)

// Setup CRON Tasks
const discrepency_cron = new cron.CronJob('0 58 16 * * 1-5', () => { discrepancies.check() }, () => { console.log('Discrepency Check Complete for All') }, true, 'America/New_York')