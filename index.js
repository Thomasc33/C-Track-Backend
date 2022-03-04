// Packages
const fs = require('fs')
const express = require('express')
const https = require('https')
const http = require('http')
const sql = require('mssql')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const sqlInjection = require('sql-injection')
const tokenParsing = require('./lib/tokenParsing')

//Globals
const app = express()
const router = express.Router()

// DB connectors
console.log('Starting Database connectors')
const config = require('./settings.json').SQLConfig
async function dbConnect() {
    try {
        let pool = await sql.connect(config)
        let res = await pool.request().query(`SELECT * FROM users WHERE id = 1`)
    }
    catch (err) {
        throw err
    }
}
dbConnect()

// API Setup
console.log('Starting API')
const credentials = { // Certificates for SSL encryption, required to make everything operate over HTTPS
    //key: fs.readFileSync('./public/privkey.pem', 'utf-8')
    //cert: fs.readFileSync('./public/cert.pem', 'utf-8')
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

// Basic SQL Injection escaping
app.use((req, res, next) => {
    if (req.body) for (let i in req.body) try { req.body[i] = req.body[i].replace(/--/g, '-').replace(/'/g, '"') } catch (er) { }
    next()
})

// Request Logging
app.use((req, res, next) => {
    let d = new Date();
    let formatted_date = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() + " " + d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();
    let log = `[${formatted_date}] ${req.method}:${req.url} ${res.statusCode}`;
    console.log(log);
    next();
})

// Historical Logging
app.use(async (req, res, next) => {
    if (!req.headers.authorization) return res.status(403).json('Missing authorization header')
    next()
    // Get UID
    const uid = await tokenParsing.toUID(req.headers.authorization)
        .catch(er => { return { errored: true, er } })
    if (uid.errored) return

    // Get Route
    const route = `${req.method}:${req.url}`

    // Get IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress

    // Get Time
    const time = new Date().toISOString().replace(/[a-z]/gi, ' ')

    // Attempt to get body
    const body = req.body
    let bodyString = ''
    for (let i in body) {
        bodyString += `"${i.replace("'", '')}":"{${body[i]}}", `
    }

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Return if required data points are missing
    if (!uid || !time) return

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
app.use('/a/reports', require('./routes/Reports'))
app.use('/a/oauth', require('./routes/OAuth'))


// Starts HTTP Server
// Will switch to HTTPS for prod
const httpServer = http.createServer(app)
httpServer.listen(require('./settings.json').port)