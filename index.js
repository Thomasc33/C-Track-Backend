// Packages
const fs = require('fs')
const express = require('express')
const https = require('https')
const http = require('http')
const sql = require('mssql')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

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
app.use(express.urlencoded());

// CORS setup (ran into issues with CORS on other projects)
app.use(cors())

// Rate Limit: 10 * 1000ms = 10 seconds, Max = 20 requests per 10 seconds 
const apiLimit = rateLimit({
    windowMs: 10 * 1000,
    max: 20
})
app.use('/a/', apiLimit)

//Directs all trafic going to '/a' to the router
app.use('/a/home', require('./routes/Home'))
app.use('/a/asset', require('./routes/Asset'))
app.use('/a/job', require('./routes/Jobs'))
app.use('/a/user', require('./routes/User'))

//Default Error Messages
app.use((err, req, res, next) => {
    switch (err.message) {
        case 'NoCodeProvided':
            return res.status(400).send({
                status: 'ERROR',
                error: err.message,
            });
        default:
            return res.status(500).send({
                status: 'ERROR',
                error: err.message,
            });
    }
});

//Adds logging to all requests
// app.use((err, req, res) => {
//     console.log(req)
// })

// Starts HTTP Server
// Will switch to HTTPS for prod
const httpServer = http.createServer(app)
httpServer.listen(require('./settings.json').port)