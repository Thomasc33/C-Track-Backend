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

// Rate Limit
const apiLimit = rateLimit({
    windowMs: 5 * 1000, //10 seconds
    max: 30 //20 requests
})
app.use('/a/', apiLimit)

app.use((req, res, next) => {
    let d = new Date();
    let formatted_date = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate() + " " + d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();
    let log = `[${formatted_date}] ${req.method}:${req.url} ${res.statusCode}`;
    console.log(log);
    next();
})

//Directs all trafic going to '/a' to the router
app.use('/a/home', require('./routes/Home'))
app.use('/a/asset', require('./routes/Asset'))
app.use('/a/job', require('./routes/Jobs'))
app.use('/a/user', require('./routes/User'))
app.use('/a/hourly', require('./routes/Hourly'))

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