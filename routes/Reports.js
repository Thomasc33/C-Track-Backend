const express = require('express')
const Router = express.Router()
const sql = require('mssql')
const axios = require('axios').default
const config = require('../settings.json').SQLConfig
const tokenParsing = require('../lib/tokenParsing')
const reportTunables = require('../reportTunables.json')
const SnipeBearer = require('../settings.json').snipeBearer
const tsheetsBearer = require('../settings.json').tsheets.token
const snipeAPILink = 'https://cpoc.snipe-it.io/api/v1'
const jobIdToSnipe = require('../snipeJobCodeConversion.json')
const userIdToSnipe = require('../snipeUserConversion.json')
const snipeToJobId = Object.fromEntries(Object.entries(jobIdToSnipe).map(a => a.reverse()))
const snipeToUID = Object.fromEntries(Object.entries(userIdToSnipe).map(a => a.reverse()))
const UIDtoTSheetsUID = require('../tsheetsUidConversion.json')
const TSheetsUIDtoUID = Object.fromEntries(Object.entries(UIDtoTSheetsUID).map(a => a.reverse()))
const JobCodePairs = require('../jobCodePairs.json')
const JobCodePairsSet = new Set()
JobCodePairs.forEach(a => a.forEach(ele => JobCodePairsSet.add(ele)))
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

Router.get('/users/daily/:date', async (req, res) => {
    // Check token using toUid function
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.view_reports) return res.status(401).json({ message: 'missing permission' })

    // Get Date
    const date = req.params.date
    if (!date) return res.status(400).json({ message: 'No date provided' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Job Codes
    let jobs_query = await pool.request().query(`SELECT * FROM jobs`)
        .catch(er => { return { isErrored: true, error: er } })
    if (jobs_query.isErrored) return res.status(500).json({ message: 'failed Job query' })
    const hourly_jobs = {}
    const ppd_jobs = {}
    for (let i of jobs_query.recordset) if (i.is_hourly) hourly_jobs[i.id] = i.price; else ppd_jobs[i.id] = i.price

    // Get asset and hourly history for the date
    const dailyDollars = {}
    let asset_query = await pool.request().query(`SELECT user_id, job_code FROM asset_tracking WHERE date = '${date}'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (asset_query.isErrored) return res.status(500).json({ message: asset_query.error })

    let hourly_query = await pool.request().query(`SELECT user_id, job_code, hours FROM hourly_tracking WHERE date = '${date}'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (hourly_query.isErrored) return res.status(500).json({ message: hourly_query.error })

    for (let i of asset_query.recordset) dailyDollars[i.user_id] ? dailyDollars[i.user_id] += parseFloat(ppd_jobs[i.job_code]) : dailyDollars[i.user_id] = parseFloat(ppd_jobs[i.job_code])
    for (let i of hourly_query.recordset) dailyDollars[i.user_id] ? dailyDollars[i.user_id] += parseFloat(hourly_jobs[i.job_code]) * parseFloat(i.hours) : dailyDollars[i.user_id] = parseFloat(hourly_jobs[i.job_code]) * parseFloat(i.hours)
    // Get names associated with uid
    let name_query = await pool.request().query(`SELECT name, id FROM users`)
        .catch(er => { return { isErrored: true, error: er } })
    if (name_query.isErrored) return res.status(500).json({ message: name_query.error })

    // Organize Data
    const d = []
    let ddKeys = Object.keys(dailyDollars)
    for (let i of name_query.recordset) if (ddKeys.includes(`${i.id}`)) d.push({ id: i.id, name: i.name, dailydollars: dailyDollars[i.id] })

    return res.status(200).json(d)
})

Router.get('/user/:uid/:date', async (req, res) => {
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.view_reports) return res.status(401).json({ message: 'missing permission' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Date
    const date = req.params.date
    if (!date) return res.status(400).json({ message: 'No date provided' })

    // Data validation for UID. Check for UID, and Check if UID exists
    uid = req.params.uid
    if (!uid || uid == '') return res.status(400).json({ message: 'No UID given' })
    let resu = await pool.request().query(`SELECT id FROM users WHERE id = ${uid}`).catch(er => { return `Invalid UID` })
    if (resu == 'Invalid UID') return res.status(400).json({ message: 'Invalid UID or not found' })

    // Get Data

    // Query the DB
    let asset_tracking = await pool.request().query(`SELECT job_code FROM asset_tracking WHERE user_id = '${uid}' AND date = '${date}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    let hourly_tracking = await pool.request().query(`SELECT job_code, hours FROM hourly_tracking WHERE user_id = '${uid}' AND date = '${date}'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (hourly_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Invalid UID or not found, Hourly Tracking Query Error' })
    }

    let job_codes = await pool.request().query(`SELECT * FROM jobs`)
        .catch(er => { return { isErrored: true, error: er } })
    if (hourly_tracking.isErrored) return res.status(500).json({ code: 500, message: 'Failed to get job codes' })

    // Format Job Codes
    let hourly_jobs = {}, ppd_jobs = {}
    job_codes.recordset.forEach(job => {
        if (job.status_only) return
        if (job.is_hourly) hourly_jobs[job.id] = { job_name: job.job_name, job_code: job.job_code, price: job.price }
        else ppd_jobs[job.id] = { job_name: job.job_name, job_code: job.job_code, price: job.price }
    })

    // Put data where data should be
    let data = { "Daily Dollars": 0 }

    asset_tracking.recordset.forEach(ppd => {
        if (!ppd_jobs[ppd.job_code]) return
        let job_name = 'ppd_' + ppd_jobs[ppd.job_code].job_name
        if (!job_name) return
        if (data[job_name]) { data[job_name].count = data[job_name].count + 1; data[job_name].dd += ppd_jobs[ppd.job_code].price }
        else data[job_name] = { count: 1, dd: ppd_jobs[ppd.job_code].price }
        data["Daily Dollars"] += ppd_jobs[ppd.job_code].price
    })

    hourly_tracking.recordset.forEach(hourly => {
        if (!hourly_jobs[hourly.job_code]) return
        let job_name = 'hrly_' + hourly_jobs[hourly.job_code].job_name
        if (!job_name) return
        if (data[job_name]) { data[job_name].count = data[job_name].count + hourly.hours; data[job_name].dd += hourly_jobs[hourly.job_code].price * hourly.hours }
        else data[job_name] = { count: hourly.hours, is_hourly: true, dd: hourly_jobs[hourly.job_code].price * hourly.hours }
        data["Daily Dollars"] += hourly_jobs[hourly.job_code].price * hourly.hours
    })

    return res.status(200).json(data)
})

Router.get('/graph/user/:uid/:from/:to', async (req, res) => {
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.view_reports) return res.status(401).json({ message: 'missing permission' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get and check UID
    uid = req.params.uid
    let from = req.params.from
    let to = req.params.to
    if (!uid || uid == '') return res.status(400).json({ message: 'No UID given' })
    let resu = await pool.request().query(`SELECT id FROM users WHERE id = ${uid}`).catch(er => { return `Invalid UID` })
    if (resu == 'Invalid UID') return res.status(400).json({ message: 'Invalid UID or not found' })

    // Get Job Codes
    let jobs_query = await pool.request().query(`SELECT * FROM jobs`)
        .catch(er => { return { isErrored: true, error: er } })
    if (jobs_query.isErrored) return res.status(500).json({ message: 'failed Job query' })
    const hourly_jobs = {}
    const ppd_jobs = {}
    for (let i of jobs_query.recordset) if (i.is_hourly) hourly_jobs[i.id] = parseFloat(i.price); else ppd_jobs[i.id] = parseFloat(i.price)

    // Get asset and hourly history for the date
    let asset_query = await pool.request().query(`SELECT job_code, date FROM asset_tracking WHERE user_id = '${uid}' AND date BETWEEN '${from}' AND '${to}'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (asset_query.isErrored) return res.status(500).json({ message: asset_query.error })

    let hourly_query = await pool.request().query(`SELECT job_code, hours, date FROM hourly_tracking WHERE user_id = '${uid}' AND date BETWEEN '${from}' AND '${to}'`)
        .catch(er => { return { isErrored: true, error: er } })
    if (hourly_query.isErrored) return res.status(500).json({ message: hourly_query.error })

    let data = {}

    for (let i of asset_query.recordset) {
        let d = i.date.toISOString().split('T')[0]
        if (data[d]) data[d] += ppd_jobs[i.job_code]; else data[d] = ppd_jobs[i.job_code]
    }

    for (let i of hourly_query.recordset) {
        let d = i.date.toISOString().split('T')[0]
        if (data[d]) data[d] += parseFloat(i.hours) * hourly_jobs[i.job_code]; else data[d] = parseFloat(i.hours) * hourly_jobs[i.job_code]
    }

    return res.status(200).json(data)
})

// Modified Asset and Hourly Routes for use of report editors
Router.get('/asset/user/:uid/:date', async (req, res) => {
    // Validate requestor and check their permissions
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.edit_others_worksheets) return res.status(401).json({ message: 'Access Denied' })

    // Get UID from params
    uid = req.params.uid

    //Get date from params
    let date = req.params.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data
    let asset_tracking = await pool.request().query(`SELECT * FROM asset_tracking WHERE user_id = '${uid}' AND date = '${getDate(date)}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let data = {
        records: asset_tracking.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

// Done Assets, begin hourly
Router.get('/hourly/user/:uid/:date', async (req, res) => {
    // Validate requestor and check their permissions
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.edit_others_worksheets) return res.status(401).json({ message: 'Access Denied' })

    // Get UID from header
    uid = req.params.uid

    //Get date from header
    let date = req.params.date

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data

    // Query the DB
    let hourly_tracking = await pool.request().query(`SELECT * FROM hourly_tracking WHERE user_id = '${uid}' AND date = '${getDate(date)}'`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (hourly_tracking.isErrored) {
        // Check for specific errors

        // If no errors above, return generic Invalid UID Error
        return res.status(400).json({ message: 'Invalid UID or not found, Asset Tracking Query Error' })
    }

    // Organize Data
    let data = {
        records: hourly_tracking.recordset
    }

    // Return Data
    return res.status(200).json(data)
})

Router.post('/generate', async (req, res) => {
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.view_reports) return res.status(401).json({ message: 'Access Denied' })

    const { date, range } = req.body

    // Establish SQL Connection
    let pool = await sql.connect(config)

    let asset_tracking_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE ${range ? `date >= '${date}' AND date <= '${range}'` : `date = '${date}'`}`)
        .then(d => d.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking_query && asset_tracking_query.isErrored) return res.status(500).json({ message: 'Error fetching asset tracking records' })

    let hourly_tracking_query = await pool.request().query(`SELECT * FROM hourly_tracking WHERE ${range ? `date >= '${date}' AND date <= '${range}'` : `date = '${date}'`}`)
        .then(d => d.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (hourly_tracking_query && hourly_tracking_query.isErrored) return res.status(500).json({ message: 'Error fetching hourly tracking records' })

    if (!asset_tracking_query && !hourly_tracking_query) return res.status(409).json({ message: 'No data to report on' })

    // Get user name object
    let usernames = {}
    let user_query = await pool.request().query(`SELECT id,name FROM users`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (user_query.isErrored) return res.status(500).json({ message: 'Error fetching users' })
    for (let i of user_query.recordset) usernames[i.id] = i.name

    let applicableUsers = new Set()
    if (asset_tracking_query) for (let i of asset_tracking_query) applicableUsers.add(i.user_id)
    if (hourly_tracking_query) for (let i of hourly_tracking_query) applicableUsers.add(i.user_id)
    // let applicableUserString = [...applicableUsers].map(m => UIDtoTSheetsUID[m] || undefined).join(',')


    // Get Job Code Names
    let job_codes = {}
    let job_code_query = await pool.request().query(`SELECT id,job_code,price,hourly_goal FROM jobs`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (job_code_query.isErrored) return res.status(500).json({ message: 'Error fetching job codes' })
    for (let i of job_code_query.recordset) job_codes[i.id] = { name: i.job_code, price: i.price, hourly_goal: i.hourly_goal }


    // Get Tsheets counts
    /**
     * date{
     *      employee {
     *              userObj:
     *              timesheets:[ts_obj]       
     *      }
     * }
     */

    const tsheets_data = await getTsheetsData(job_codes, range, date) //applicableUserString


    // The fun stuff :)
    let data = []

    /**
     * Data
     * [
     *  [name]
     *  ['Job Code', total-count, total-$, Date-Count, $, repeat for each date in range]
     *  [do for each job code used by the user]
     *  [break]
     *  [next person]
     * ]
     */

    function getUserData(id) {
        let d = []

        // Get list of dates
        let dates = []
        if (range) {
            let start = new Date(date)
            let end = new Date(range)
            while (start <= end) {
                dates.push(new Date(start))
                start = start.addDays(1)
            }
        }

        // Start off the CSV Data
        d.push([usernames[id] || id])
        d.push(['Job Code'])

        if (range) {
            if (tsheets_data) {
                d[1].push('Total Count', 'Total TS Count', 'Total Revenue', 'Average Revenue/Hr', 'Average Count/Hr')
                for (let i of dates) {
                    let s = i.toISOString().split('T')[0].substring(5)
                    d[1].push(`${s} #`, `${s} $`, `${s} TS-Hr`)
                }
            } else {
                d[1].push('Total Count', 'Total Revenue')
                for (let i of dates) {
                    let s = i.toISOString().split('T')[0].substring(5)
                    d[1].push(`${s} #`, `${s} $`)
                }
            }
        } else {
            if (tsheets_data) d[1].push('$ Per Job', 'TS-Hours', 'TS-Count', 'Count', 'Goal/Hr', 'Count/Hr', 'Revenue', 'Revenue/Hr')
            else d[1].push(`Count`, 'Revenue')
        }

        let assetJobCodes = new Set()
        let hourlyJobCodes = new Set()
        if (asset_tracking_query) for (let i of asset_tracking_query) if (i.user_id == id) assetJobCodes.add(i.job_code)
        if (hourly_tracking_query) for (let i of hourly_tracking_query) if (i.user_id == id) hourlyJobCodes.add(i.job_code)

        let totalrevenue = 0.0
        let totalhours = 0.0

        assetJobCodes.forEach(jc => {
            //count totals
            if (range) {
                if (tsheets_data) {
                    let row = [], revs = []
                    let tot_count = 0, tot_ts_count = 0, tot_rev = 0, ave_rev, tot_h
                    for (let d of dates) {
                        let h = 0, c = 0
                        d = d.toISOString().split('T')[0]
                        for (let i of tsheets_data[d][id]) if (i.jobCode == jc) { h += i.hours; tot_ts_count += parseInt(i.count) }
                        for (let i of asset_tracking_query) {
                            try {
                                if (i.user_id == id && i.date.toISOString().split('T')[0] == d && i.job_code == jc) c++
                            } catch (e) { console.log(e) }
                        }
                        let r = parseFloat(job_codes[jc].price) * parseFloat(c)
                        row.push(c, r, h)
                        totalhours += h //For user average
                        tot_h += h // For row average
                        revs.push(r)
                        tot_count += c
                        tot_rev += r
                    }
                    ave_rev = revs.reduce(a, b => a + b) / revs.length // Average
                    row.unshift(tot_count, tot_ts_count, tot_rev, ave_rev, tot_count / tot_h)
                } else {
                    let row = [job_codes[jc].name, 0, 0]
                    let totCount = 0
                    for (let d of dates) {
                        let count = 0
                        d = d.toISOString().split('T')[0]
                        for (let i of asset_tracking_query) {
                            try {
                                if (i.user_id == id && i.date.toISOString().split('T')[0] == d && i.job_code == jc) count++
                            } catch (e) { console.log(e) }
                        }
                        row.push(count, parseFloat(job_codes[jc].price) * parseFloat(count))
                        totCount += count
                    }
                    row[1] = totCount
                    row[2] = parseFloat(job_codes[jc].price) * parseFloat(totCount)
                    d.push(row)
                    totalrevenue += row[2]
                }
            }
            else {
                if (tsheets_data) {
                    let job_price, ts_hours, ts_count, count, goal, hrly_count, revenue, hrly_revenue

                    job_price = job_codes[jc].price
                    goal = job_codes[jc].hourly_goal || '-'

                    for (let i of tsheets_data[date][id]) if (i.jobCode == jc) { ts_hours += i.hours; ts_count += i.count }

                    for (let i of asset_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == date && i.job_code == jc) count++

                    revenue = parseFloat(job_codes[jc].price) * parseFloat(count)
                    totalrevenue += revenue
                    totalhours += ts_hours

                    if (goal == '-') hrly_count = '-'
                    else hrly_count = count / ts_hours

                    hrly_revenue = revenue / ts_hours

                    d.push([job_price, ts_hours, ts_count, count, goal, hrly_count, revenue, hrly_revenue])
                } else {
                    let count = 0
                    for (let i of asset_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == date && i.job_code == jc) count++
                    d.push([job_codes[jc].name, count, parseFloat(job_codes[jc].price) * parseFloat(count)])
                    totalrevenue += parseFloat(job_codes[jc].price) * parseFloat(count)
                }
            }
        })

        hourlyJobCodes.forEach(jc => {
            //count totals
            if (range) {
                if (tsheets_data) {
                    let row = [], revs = []
                    let tot_count = 0, tot_ts_count = 0, tot_rev = 0, ave_rev, tot_h
                    for (let d of dates) {
                        let h = 0, c = 0
                        d = d.toISOString().split('T')[0]
                        for (let i of tsheets_data[d][id]) if (i.jobCode == jc) { h += i.hours; tot_ts_count += i.count }
                        for (let i of hourly_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == d && i.job_code == jc) count += i.hours
                        let r = parseFloat(job_codes[jc].price) * parseFloat(c)
                        row.push(c, r, h)
                        totalhours += h //For user average
                        tot_h += h // For row average
                        revs.push(r)
                        tot_count += c
                        tot_rev += r
                    }
                    ave_rev = revs.reduce(a, b => a + b) / revs.length // Average
                    row.unshift(tot_count, tot_ts_count, tot_rev, ave_rev, tot_count / tot_h)
                } else {
                    let row = [job_codes[jc].name, 0, 0]
                    let totCount = 0.0
                    for (let d of dates) {
                        let count = 0.0
                        d = d.toISOString().split('T')[0]
                        for (let i of hourly_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == d && i.job_code == jc) count += i.hours

                        row.push(count, parseFloat(job_codes[jc].price) * count)
                        totCount += count
                    }
                    row[1] = totCount
                    row[2] = parseFloat(job_codes[jc].price) * totCount
                    d.push(row)
                    totalrevenue += row[2]
                }
            }
            else {
                if (tsheets_data) {
                    let job_price, ts_hours, ts_count, count, revenue, hrly_revenue

                    job_price = job_codes[jc].price

                    for (let i of tsheets_data[date][id]) if (i.jobCode == jc) { ts_hours += i.hours; ts_count += i.count }

                    for (let i of hourly_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == date && i.job_code == jc) count += i.hours

                    revenue = parseFloat(job_codes[jc].price) * parseFloat(count)
                    totalrevenue += revenue
                    totalhours += ts_hours

                    hrly_revenue = revenue / ts_hours
                    //('$ Per Job', 'TS-Hours', 'TS-Count', 'Count', 'Goal/Hr', 'Count/Hr', 'Revenue', 'Revenue/Hr')
                    d.push([job_price, ts_hours, ts_count, count, '-', '-', revenue, hrly_revenue])
                } else {
                    let count = 0
                    for (let i of hourly_tracking_query)
                        if (i.user_id == id && i.date.toISOString().split('T')[0] == date && i.job_code == jc) count += i.hours
                    d.push([job_codes[jc].name, count, parseFloat(job_codes[jc].price) * count])
                    totalrevenue += parseFloat(job_codes[jc].price) * count
                }
            }
        })

        // Totals section
        d.push([], ['Total Revenue', totalrevenue])
        if (tsheets_data) d.push(['Total Hours', totalhours], ['Average Hourly', totalrevenue / totalhours])

        return d
    }

    applicableUsers.forEach(u => data.push(...getUserData(u), [], []))

    return res.status(200).json({ data })
})

Router.post('/assetsummary', async (req, res) => {
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.view_reports) return res.status(401).json({ message: 'Access Denied' })

    const { date, range } = req.body

    // Establish SQL Connection
    let pool = await sql.connect(config)

    let asset_tracking_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE ${range ? `date >= '${date}' AND date <= '${range}'` : `date = '${date}'`}`)
        .then(d => d.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking_query && asset_tracking_query.isErrored) return res.status(500).json({ message: 'Error fetching asset tracking records' })

    // Get user name object
    let usernames = {}
    let user_query = await pool.request().query(`SELECT id,name FROM users`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (user_query.isErrored) return res.status(500).json({ message: 'Error fetching users' })
    for (let i of user_query.recordset) usernames[i.id] = i.name


    // Get Job Code Names
    let job_codes = {}
    let job_code_query = await pool.request().query(`SELECT id,job_code,price FROM jobs`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (job_code_query.isErrored) return res.status(500).json({ message: 'Error fetching job codes' })
    for (let i of job_code_query.recordset) job_codes[i.id] = { name: i.job_code, price: i.price }

    let data = [[{ value: 'User' }, { value: 'Asset Id' }, { value: 'Status' }, { value: 'Date' }, { value: 'Time' }, { value: 'Notes' }]]

    for (let i of asset_tracking_query) {
        data.push([
            { value: usernames[i.user_id] },
            { value: i.asset_id, type: String },
            { value: job_codes[i.job_code].name },
            { value: i.date.toISOString().split('T')[0] },
            { value: i.time.toISOString().substring(11, 19) },
            { value: i.notes || '' }
        ])
    }

    const columns = [{ width: 20 }, { width: 20 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 70 }]

    res.status(200).json({ data, columns })
})

Router.post('/hourlysummary', async (req, res) => {
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.view_reports) return res.status(401).json({ message: 'Access Denied' })

    const { date, range } = req.body

    // Establish SQL Connection
    let pool = await sql.connect(config)

    let hourly_tracking_query = await pool.request().query(`SELECT * FROM hourly_tracking WHERE ${range ? `date >= '${date}' AND date <= '${range}'` : `date = '${date}'`}`)
        .then(d => d.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (hourly_tracking_query && hourly_tracking_query.isErrored) return res.status(500).json({ message: 'Error fetching asset tracking records' })

    // Get user name object
    let usernames = {}
    let user_query = await pool.request().query(`SELECT id,name FROM users`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (user_query.isErrored) return res.status(500).json({ message: 'Error fetching users' })
    for (let i of user_query.recordset) usernames[i.id] = i.name


    // Get Job Code Names
    let job_codes = {}
    let job_code_query = await pool.request().query(`SELECT id,job_code,price FROM jobs WHERE is_hourly = 1`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (job_code_query.isErrored) return res.status(500).json({ message: 'Error fetching job codes' })
    for (let i of job_code_query.recordset) job_codes[i.id] = { name: i.job_code, price: i.price }

    let data = [[{ value: 'User' }, { value: 'Job' }, { value: 'Date' }, { value: 'Start' }, { value: 'End' }, { value: 'Hours' }, { value: 'Notes' }]]

    for (let i of hourly_tracking_query) {
        data.push([
            { value: usernames[i.user_id] },
            { value: job_codes[i.job_code].name },
            { value: i.date.toISOString().split('T')[0] },
            { value: i.start_time.toISOString().substring(11, 19) },
            { value: i.end_time.toISOString().substring(11, 19) },
            { value: i.hours },
            { value: i.notes || '' }
        ])
    }

    const columns = [{ width: 20 }, { width: 20 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 70 }]

    res.status(200).json({ data, columns })
})

Router.get('/jobusage/:type', async (req, res) => {
    const { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.view_reports) return res.status(401).json({ message: 'Access Denied' })

    const type = req.params.type.toLowerCase()

    if (!type || !['ytd', 'at'].includes(type)) return res.status(400).json({ error: `type: '${type}' not recognized` })

    let months = []
    if (type == 'ytd') {
        let now = new Date()
        let year = now.getFullYear()
        let month = now.getMonth() + 1
        for (let n in [...Array(12).keys()]) {
            n = parseInt(n) + 1
            if (n > month) break
            months.push({ month: n, year })
        }
    } else {
        let now = new Date()
        let year = now.getFullYear()
        let month = now.getMonth() + 1
        while (year >= 2022) {
            while (month) {
                months.push({ month, year })
                month--
            }
            year--
        }
    }

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get job codes
    let jq = await pool.request().query(`SELECT id, job_code,is_hourly,price FROM jobs`)
        .then(d => d.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (jq && jq.isErrored) return res.status(500).json({ message: 'Error fetching asset tracking records' })

    const aq = `SELECT count(*) AS total, ${[...jq].filter(m => !m.is_hourly).map(m => months.map(d => `SUM(CASE WHEN [job_code] = '${m.id}' and MONTH([date]) = '${d.month}' and YEAR([date]) = '${d.year}' THEN 1 ELSE 0 END) AS [${m.job_code} ${d.month}-${d.year}]`).join(', ')).join(', ')} FROM asset_tracking`
    const hq = `SELECT count(*) AS total, ${[...jq].filter(m => m.is_hourly).map(m => months.map(d => `SUM(case when [job_code] = '${m.id}' and month([date]) = ${d.month} and year([date]) = ${d.year} then 1 else 0 end) as [${m.job_code} ${d.month}-${d.year}]`).join(', ')).join(', ')} FROM hourly_tracking`

    const aq_q = await pool.request().query(aq)
        .then(d => d.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (aq_q && aq_q.isErrored) return res.status(500).json({ message: 'Error fetching asset tracking records' })

    const hq_q = await pool.request().query(hq)
        .then(d => d.recordset)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (hq_q && hq_q.isErrored) return res.status(500).json({ message: 'Error fetching hourly tracking records' })

    let hrly_data = {}
    let ppd_data = {}

    for (let i in aq_q[0]) {
        let job = i.substring(0, i.lastIndexOf(' '))
        let date = i.substring(i.lastIndexOf(' ') + 1, i.length)
        if (!ppd_data[job]) ppd_data[job] = {}
        ppd_data[job][date] = aq_q[0][i]
    }
    for (let i in hq_q[0]) {
        let job = i.substring(0, i.lastIndexOf(' '))
        let date = i.substring(i.lastIndexOf(' ') + 1, i.length)
        if (!hrly_data[job]) hrly_data[job] = {}
        hrly_data[job][date] = hq_q[0][i]
    }

    jq.sort((a, b) => {
        let a_count = 0, b_count = 0
        if (a.is_hourly) a_count = Object.values(hrly_data[a.job_code]).reduce((a, b) => a + b)
        else a_count = Object.values(ppd_data[a.job_code]).reduce((a, b) => a + b)
        if (b.is_hourly) b_count = Object.values(hrly_data[b.job_code]).reduce((a, b) => a + b)
        else b_count = Object.values(ppd_data[b.job_code]).reduce((a, b) => a + b)
        return a_count > b_count ? -1 : a_count == b_count ? 0 : 1
    })
    let data = [[{ value: 'Date' }], [{ value: 'PPD Total' }], [{ value: 'Hourly Total' }], [{ value: 'Total Revenue' }], ...jq.map(m => [{ value: m.job_code }])]

    for (let i of [...months].reverse()) {
        data[0].push({ value: `${monthNames[i.month - 1]}-${i.year}`, align: 'center', leftBorderStyle: 'thin' }, { rightBorderStyle: 'thin' })
        data[1].push({ value: 0, align: 'left', leftBorderStyle: 'thin' }, { value: 0, rightBorderStyle: 'thin' })
        data[2].push({ value: 0, align: 'left', leftBorderStyle: 'thin' }, { value: 0, rightBorderStyle: 'thin' })
        data[3].push({ value: '-', leftBorderStyle: 'thin' }, { value: 0, rightBorderStyle: 'thin' })
        for (let j in jq) {
            let m = jq[j]
            if (m.is_hourly) {
                data[parseInt(j) + 4].push({ value: hrly_data[m.job_code][`${i.month}-${i.year}`], align: 'left', leftBorderStyle: 'thin' },
                    { value: `$${hrly_data[m.job_code][`${i.month}-${i.year}`] * m.price}`, align: 'left', rightBorderStyle: 'thin' })
                data[1][data[1].length - 2].value += hrly_data[m.job_code][`${i.month}-${i.year}`]
                data[1][data[1].length - 1].value += hrly_data[m.job_code][`${i.month}-${i.year}`] * m.price
                data[3][data[3].length - 1].value += hrly_data[m.job_code][`${i.month}-${i.year}`] * m.price
            }
            else {
                data[parseInt(j) + 4].push({ value: ppd_data[m.job_code][`${i.month}-${i.year}`], align: 'left', leftBorderStyle: 'thin' },
                    { value: `$${ppd_data[m.job_code][`${i.month}-${i.year}`] * m.price}`, align: 'left', rightBorderStyle: 'thin' })
                data[2][data[2].length - 2].value += ppd_data[m.job_code][`${i.month}-${i.year}`]
                data[2][data[2].length - 1].value += ppd_data[m.job_code][`${i.month}-${i.year}`] * m.price
                data[3][data[3].length - 1].value += ppd_data[m.job_code][`${i.month}-${i.year}`] * m.price
            }
        }
    }

    // Convert money into money string
    for (let ind in data[1]) if (ind % 2 == 0 && data[1][ind].value) data[1][ind].value = data[1][ind].value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    for (let ind in data[2]) if (ind % 2 == 0 && data[2][ind].value) data[2][ind].value = data[2][ind].value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    for (let ind in data[3]) if (ind % 2 == 0 && data[3][ind].value) data[3][ind].value = data[3][ind].value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

    const columns = [{ width: 40 }]

    res.status(200).json({ data, columns })
})

Router.get('/excel', async (req, res) => {
    let { uid, isAdmin, permissions } = await tokenParsing.checkPermissions(req.headers.authorization)
        .catch(er => { return { uid: { errored: true, er } } })
    if (uid.errored) return res.status(401).json({ message: 'bad authorization token' })
    if (!isAdmin && !permissions.view_reports) return res.status(401).json({ message: 'missing permission' })

    // Establish SQL Connection
    let pool = await sql.connect(config)

    // Get Data range
    const range = req.query.from
    const date = req.query.to
    let start, end
    if (!(range && date)) {// Remove 7 days from start
        let sd = new Date(date)
        sd.setDate(sd.getDate() - 6)
        start = sd.toISOString().split('T')[0]
        end = date
    } else { start = range, end = date } // Report with range

    // Start the snipe 
    const snipeData = await getSnipeData(start)

    // Get Asset and Houly Data
    let asset_tracking_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE ${range ? `date >= '${date}' AND date <= '${range}'` : `date = '${date}'`}`)
        .then(d => d.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (asset_tracking_query && asset_tracking_query.isErrored) return res.status(500).json({ message: 'Error fetching asset tracking records' })

    let hourly_tracking_query = await pool.request().query(`SELECT * FROM hourly_tracking WHERE ${range ? `date >= '${date}' AND date <= '${range}'` : `date = '${date}'`}`)
        .then(d => d.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (hourly_tracking_query && hourly_tracking_query.isErrored) return res.status(500).json({ message: 'Error fetching hourly tracking records' })

    if (!asset_tracking_query && !hourly_tracking_query) return res.status(409).json({ message: 'No data to report on' })

    let five_day_asset_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE date >= '${start}' AND date <= '${end}'`)
        .then(d => d.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
    let five_day_hourly_query = await pool.request().query(`SELECT * FROM hourly_tracking WHERE date >= '${start}' AND date <= '${end}'`)
        .then(d => d.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })

    // Get user name object
    let usernames = {}
    let user_query = await pool.request().query(`SELECT id,name FROM users`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (user_query.isErrored) return res.status(500).json({ message: 'Error fetching users' })
    for (let i of user_query.recordset) usernames[i.id] = i.name

    let applicableUsers = new Set()
    if (asset_tracking_query) for (let i of asset_tracking_query) applicableUsers.add(i.user_id)
    if (hourly_tracking_query) for (let i of hourly_tracking_query) applicableUsers.add(i.user_id)
    // let applicableUserString = [...applicableUsers].filter(a => UIDtoTSheetsUID[`${a}`]).map(m => UIDtoTSheetsUID[m] || undefined).join(',')

    // Get Job Code Names
    let job_codes = {}
    let job_code_query = await pool.request().query(`SELECT id,job_code,price,hourly_goal,requires_asset FROM jobs`)
        .catch(er => { console.log(er); return { isErrored: true, error: er } })
    if (job_code_query.isErrored) return res.status(500).json({ message: 'Error fetching job codes' })
    for (let i of job_code_query.recordset) job_codes[i.id] = { name: i.job_code, price: i.price, hourly_goal: i.hourly_goal, requires_asset: i.requires_asset }

    // Get Tsheets Data
    const tsheets_data = await getTsheetsData(job_codes, start, end) //applicableUserString

    const data = [
        [{ value: 'Report Date' }],
        [{ value: `${range ? `${range}-` : ''}${date}`, fontWeight: 'bold' }],
        [],
        [{ value: 'Total Revenue', leftBorderStyle: 'thick', topBorderStyle: 'thick' }, { value: 0, topBorderStyle: 'thick', rightBorderStyle: 'thick' }],
        [{ value: 'Total Hours', leftBorderStyle: 'thick' }, { value: 0, rightBorderStyle: 'thick' }],
        [{ value: 'Average Hourly Revenue', leftBorderStyle: 'thick', bottomBorderStyle: 'thick' }, { value: 0, bottomBorderStyle: 'thick', rightBorderStyle: 'thick' }],
        [],
        [],
        []
    ]
    let total_hours = 0
    let total_revenue = 0
    let discrepancies = {}
    for (let i of applicableUsers) discrepancies[i] = []
    let tsheetsVisited = new Set()

    function getUserData(id) {
        let d = []

        // Get list of dates
        let dates = []
        if (range) {
            let start = new Date(date)
            let end = new Date(range)
            while (start <= end) {
                dates.push(new Date(start))
                start = start.addDays(1)
            }
        }

        d.push([{ fontSize: 24, value: usernames[id] || id }])
        d.push([{ value: 'Job Code', borderStyle: 'thin', backgroundColor: reportTunables.headerColor, fontWeight: 'bold', color: '#ffffff' }])

        if (range) {
            d[1].push({ value: 'Total Count' }, { value: 'Total Revenue' }, { value: 'Average Revenue/Hr' }, { value: 'Average Count/Hr' })
            for (let i of dates) {
                let s = i.toISOString().split('T')[0].substring(5)
                d[1].push({ value: `${s} #` }, { value: `${s} $` }, { value: `${s} TS-Hr` })
            }
        } else {
            d[1].push({ value: '$ Per Job', borderStyle: 'thin', backgroundColor: reportTunables.headerColor, fontWeight: 'bold', color: '#ffffff' },
                { value: 'Hours/Day', borderStyle: 'thin', backgroundColor: reportTunables.headerColor, fontWeight: 'bold', color: '#ffffff' },
                { value: 'Count/Day', borderStyle: 'thin', backgroundColor: reportTunables.headerColor, fontWeight: 'bold', color: '#ffffff' },
                { value: 'Goal/Hr', borderStyle: 'thin', backgroundColor: reportTunables.headerColor, fontWeight: 'bold', color: '#ffffff' },
                { value: 'Average Count/Hour', borderStyle: 'thin', backgroundColor: reportTunables.headerColor, fontWeight: 'bold', color: '#ffffff' },
                { value: 'Revenue', borderStyle: 'thin', backgroundColor: reportTunables.headerColor, fontWeight: 'bold', color: '#ffffff' },
                { value: 'Revenue/Hr', borderStyle: 'thin', backgroundColor: reportTunables.headerColor, fontWeight: 'bold', color: '#ffffff' })
        }

        let assetJobCodes = new Set()
        let hourlyJobCodes = new Set()
        if (asset_tracking_query) for (let i of asset_tracking_query) if (i.user_id == id) assetJobCodes.add(i.job_code)
        if (hourly_tracking_query) for (let i of hourly_tracking_query) if (i.user_id == id) hourlyJobCodes.add(i.job_code)

        let totalrevenue = 0.0
        let totalhours = 0.0

        let ind = 0
        assetJobCodes.forEach(jc => {
            //count totals
            if (range) {
                let row = [], revs = []
                let tot_count = 0, tot_ts_count = 0, tot_rev = 0, ave_rev, tot_h
                for (let d of dates) {
                    let h = 0, c = 0
                    d = d.toISOString().split('T')[0]
                    for (let i of tsheets_data[d][id].timesheets) if (i.jobCode == jc) { h += i.hours; tot_ts_count += parseInt(i.count) }
                    for (let i of asset_tracking_query) {
                        try {
                            if (i.user_id == id && i.date.toISOString().split('T')[0] == d && i.job_code == jc) c++
                        } catch (e) { console.log(e) }
                    }
                    let r = parseFloat(job_codes[jc].price) * parseFloat(c)
                    row.push({ value: c }, { value: r }, { value: h })
                    totalhours += h //For user average
                    tot_h += h // For row average
                    revs.push({ value: r })
                    tot_count += c
                    tot_rev += r
                }
                ave_rev = revs.reduce(a, b => a + b) / revs.length // Average
                row.unshift({ value: tot_count }, { value: tot_ts_count }, { value: tot_rev }, { value: ave_rev }, { value: tot_count / tot_h })
            }
            else {
                //job price, hours spent, count, goal, count/hour, revenue, revenue/hour
                let job_price = 0, ts_hours = 0.0, ts_count = 0, count = 0, goal = 0, hrly_count = 0, revenue = 0, hrly_revenue = 0, snipe_count = 0, unique = []

                job_price = job_codes[jc].price
                goal = job_codes[jc].hourly_goal || '-'
                if (tsheets_data[date] && tsheets_data[date][id]) for (let i of tsheets_data[date][id].timesheets) if (i.jobCode == `${jc}`) { ts_hours += i.hours; ts_count += parseInt(i.count); tsheetsVisited.add(i.id) }


                let assets = []
                for (let i of asset_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == date && i.job_code == jc) assets.push(i.asset_id)
                count = assets.length

                if (snipeData && snipeData[date] && snipeData[date][id] && (snipeData[date][id][jc] || snipeData[date][id][parseInt(jc)])) {
                    snipe_count = snipeData[date][id][jc] ? snipeData[date][id][jc].length : snipeData[date][id][parseInt(jc)].length;
                    let s = snipeData[date][id][jc] ? snipeData[date][id][jc].map(m => m.toUpperCase().trim()) : snipeData[date][id][parseInt(jc)].map(m => m.toUpperCase().trim())
                    let a = assets.map(m => m.toUpperCase().trim())
                    unique = [...a.filter(e => s.indexOf(e) === -1), ...s.filter(e => a.indexOf(e) === -1)]
                } else {
                    unique = assets.join(', ')
                }

                revenue = parseFloat(job_codes[jc].price) * parseFloat(count)
                totalrevenue += revenue
                totalhours += ts_hours

                if (goal == '-') hrly_count = '-'
                else hrly_count = round(count / (ts_hours || count), 3)

                hrly_revenue = round(revenue / ts_hours, 3)
                if (revenue == 0) hrly_revenue = '-'
                if (hrly_revenue == Infinity) hrly_revenue = 0

                // discrepancy check
                if (job_codes[jc].requires_asset) if ((Object.keys(tsheets_data).length && ts_count !== count) || count !== snipe_count) discrepancies[id].push({ jc, ts_count, count, snipe_count, date, unique })

                d.push([
                    { value: job_codes[jc].name, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size && hourlyJobCodes.size === 0 ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: job_price, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size && hourlyJobCodes.size === 0 ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: ts_hours, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size && hourlyJobCodes.size === 0 ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: count, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size && hourlyJobCodes.size === 0 ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: goal, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size && hourlyJobCodes.size === 0 ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    {
                        value: hrly_count, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size && hourlyJobCodes.size === 0 ? 'thin' : null,
                        backgroundColor: hrly_count >= reportTunables.overPercent * goal ? reportTunables.overColor :
                            hrly_count <= reportTunables.underPercent * goal ? reportTunables.underColor :
                                reportTunables.goalColor
                    },
                    { value: revenue, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size && hourlyJobCodes.size === 0 ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    {
                        value: hrly_revenue, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size && hourlyJobCodes.size === 0 ? 'thin' : null,
                        backgroundColor: hrly_revenue >= reportTunables.overPercent * reportTunables.expectedHourly ? reportTunables.overColor :
                            hrly_revenue <= reportTunables.underPercent * reportTunables.expectedHourly ? reportTunables.underColor :
                                reportTunables.goalColor
                    }])

                ind++
            }
        })

        hourlyJobCodes.forEach(jc => {
            //count totals
            if (range) {
                let row = [], revs = []
                let tot_count = 0, tot_ts_count = 0, tot_rev = 0, ave_rev, tot_h
                for (let d of dates) {
                    let h = 0, c = 0
                    d = d.toISOString().split('T')[0]
                    for (let i of tsheets_data[d][id].timesheets) if (i.jobCode == jc) { h += i.hours; tot_ts_count += parseInt(i.count) }
                    for (let i of hourly_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == d && i.job_code == jc) count += i.hours
                    let r = parseFloat(job_codes[jc].price) * parseFloat(c)
                    row.push({ value: c }, { value: r }, { value: h })
                    totalhours += h //For user average
                    tot_h += h // For row average
                    revs.push({ value: r })
                    tot_count += c
                    tot_rev += r
                }
                ave_rev = revs.reduce(a, b => a + b) / revs.length // Average
                row.unshift(tot_count, tot_ts_count, tot_rev, ave_rev, tot_count / tot_h)
                d.push(row)

            }
            else {
                let job_price = 0, ts_hours = 0, ts_count = 0, count = 0, revenue = 0, hrly_revenue = 0

                job_price = job_codes[jc].price

                if (tsheets_data[date] && tsheets_data[date][id]) for (let i of tsheets_data[date][id].timesheets) if (i.jobCode == `${jc}`) { ts_hours += i.hours; ts_count += parseInt(i.count); tsheetsVisited.add(i.id) }

                for (let i of hourly_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == date && i.job_code == jc) count += i.hours

                revenue = parseFloat(job_codes[jc].price) * parseFloat(count)
                totalrevenue += revenue
                totalhours += ts_hours

                hrly_revenue = job_price

                if (JobCodePairsSet.has(jc)) {
                    let complimentaryJC
                    for (let i of JobCodePairs) if (i.includes(jc)) for (let j of i) if (j != jc) complimentaryJC = j
                    if (complimentaryJC) for (let i of d) {
                        if (i.length < 6) continue
                        if (job_codes[`${complimentaryJC}`]) if (i[0].value == job_codes[jc].name && i[0].value == job_codes[`${complimentaryJC}`].name) {
                            if (parseFloat(i[1].value) < parseFloat(job_price)) i[1].value = job_price
                            if (ts_hours) i[2].value = ts_hours
                            else ts_hours = i[2].value
                            if (ts_hours != count) discrepancies[id].push({ jc: `${jc} (Hourly)`, ts_hours, count, date, snipe_count: '-' })
                            if (i[6].value < revenue) i[6].value = revenue
                            if (i[7].value == '-' || i[7].value < hrly_revenue) {
                                i[7].value = hrly_revenue;
                                i[7].backgroundColor = hrly_revenue >= reportTunables.overPercent * reportTunables.expectedHourly ? reportTunables.overColor : hrly_revenue <= reportTunables.underPercent * reportTunables.expectedHourly ? reportTunables.underColor : reportTunables.goalColor
                            }

                            //Check to see if it was marked as discrepancy before
                            if (discrepancies[id]) for (let ind in discrepancies[id]) {
                                let i = discrepancies[id][ind]
                                if (i.jc == complimentaryJC) {
                                    discrepancies[id][ind].ts_count = ts_count
                                    if (i.count == i.snipe_count && i.count == ts_count) discrepancies[id].splice(ind, 1)
                                }
                            }

                            return
                        }
                    }
                }
                //discrepancy check
                if (ts_hours !== count) discrepancies[id].push({ jc, ts_hours, count, date, snipe_count: '-' })

                d.push([
                    { value: job_codes[jc].name, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size + hourlyJobCodes.size ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: job_price, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size + hourlyJobCodes.size ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: ts_hours || count, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size + hourlyJobCodes.size ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: '-', rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size + hourlyJobCodes.size ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: '-', rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size + hourlyJobCodes.size ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: '-', rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size + hourlyJobCodes.size ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    { value: revenue, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size + hourlyJobCodes.size ? 'thin' : null, backgroundColor: ind % 2 == 1 ? reportTunables.rowAlternatingColor : undefined },
                    {
                        value: hrly_revenue, rightBorderStyle: 'thin', bottomBorderStyle: ind + 1 == assetJobCodes.size + hourlyJobCodes.size ? 'thin' : null,
                        backgroundColor: hrly_revenue >= reportTunables.overPercent * reportTunables.expectedHourly ? reportTunables.overColor :
                            hrly_revenue <= reportTunables.underPercent * reportTunables.expectedHourly ? reportTunables.underColor :
                                reportTunables.goalColor
                    }])

                ind++
            }
        })

        if (snipeData && snipeData[date] && snipeData[date][id]) {
            for (let i in snipeData[date][id]) {
                if (!assetJobCodes.has(parseInt(i)) && !assetJobCodes.has(i)) {
                    let ts_count, count = 0, snipe_count = snipeData[date][id][i].length, unique = snipeData[date][id][i].join(', ')
                    if (tsheets_data[date]) for (let i of tsheets_data[date][id].timesheets) if (i.jobCode == i) { ts_count += parseInt(i.count) }
                    discrepancies[id].push({ jc: i, ts_count, count, snipe_count, date, unique })
                }
            }
        }

        let fiveDayRevenue = 0.0
        let fiveDayHours = 0.0

        // Five day hours counter, assumed tsheets_data was grabbed with start date-6days
        for (let i in tsheets_data) if (tsheets_data[i][id]) for (let j of tsheets_data[i][id].timesheets) fiveDayHours += j.hours

        // Five day revenue counter
        five_day_asset_query.forEach(row => { if (row.user_id == id) fiveDayRevenue += parseFloat(job_codes[row.job_code].price) })
        five_day_hourly_query.forEach(row => { if (row.user_id == id) fiveDayRevenue += parseFloat(job_codes[row.job_code].price) * parseFloat(row.hours) })

        // Totals section
        let temp_rows = [[
            { value: 'Total Revenue', topBorderStyle: 'thin' },
            { value: totalrevenue, topBorderStyle: 'thin', rightBorderStyle: 'thin' },
            { value: '5-Day Revenue', topBorderStyle: 'thin' },
            { value: fiveDayRevenue, topBorderStyle: 'thin', rightBorderStyle: 'thin' },
        ], [
            { value: 'Total Hours' },
            { value: totalhours, rightBorderStyle: 'thin' },
            { value: '5-Day Hours' },
            { value: fiveDayHours, rightBorderStyle: 'thin' },
        ], [
            { value: 'Hourly Revenue', },
            { value: totalhours ? round(totalrevenue / totalhours, 3) : 0, rightBorderStyle: 'thin' },
            { value: '5-Day Hourly Revenue' },
            { value: fiveDayHours ? round(fiveDayRevenue / fiveDayHours, 3) : 0, rightBorderStyle: 'thin' },
        ]]
        if (range && date) { temp_rows[0][2] = {}; temp_rows[0][3] = {}; temp_rows[1][2] = {}; temp_rows[1][3] = {}; temp_rows[2][2] = {}; temp_rows[2][3] = {} }
        d.push([], [], ...temp_rows)

        // Add to all users totals
        total_revenue += totalrevenue
        total_hours += totalhours

        // Add thick border to entire section
        let cols = 0, rows = d.length
        for (let i of d) if (i.length > cols) cols = i.length

        //top&bottom
        for (let i in [...Array(cols)]) {
            if (!d[0][i]) d[0][i] = {}
            if (!d[d.length - 1][i]) d[d.length - 1][i] = {}
            d[0][i].topBorderStyle = 'thick'
            d[d.length - 1][i].bottomBorderStyle = 'thick'
        }
        //left&right
        for (let i in [...Array(rows)]) {
            if (!d[i][0]) d[i][0] = {}
            d[i][0].leftBorderStyle = 'thick'
            for (let j = 0; j <= cols; j++) {
                if (!d[i][j]) d[i][j] = {}
                if (cols - 1 == j) d[i][j].rightBorderStyle = 'thick'
            }
        }
        return d
    }

    function getDiscrepancy(id) {
        let d = []

        // Get list of dates
        let dates = []
        if (range) {
            let start = new Date(date)
            let end = new Date(range)
            while (start <= end) {
                dates.push(new Date(start))
                start = start.addDays(1)
            }
        }

        d.push([{ fontSize: 24, value: usernames[id] || id }, { value: 'Discrepancy Report' }], [])
        d.push([{ value: 'Job Code' }, { value: 'Date' }, { value: 'C-Track Count' }, { value: 'T-Sheets Count' }, { value: 'Snipe Count' }, { value: 'Unique Assets (Comma Seperated)', wrap: true }])

        //{id:[discrepancies]}
        //jc, ts_count, count, snipe_count, date
        for (let i of discrepancies[id]) {
            d.push([
                { value: job_codes[i.jc] ? job_codes[i.jc].name : `Job ID: ${i.jc}` },
                { value: i.date },
                { value: i.count },
                { value: i.ts_count || i.ts_hours || '0' },
                { value: i.snipe_count || '0' },
                { value: i.unique || '-', wrap: true }
            ])
        }



        // Add thick border to entire section
        let cols = 0, rows = d.length
        for (let i of d) if (i.length > cols) cols = i.length

        //top&bottom
        for (let i in [...Array(cols)]) {
            if (!d[0][i]) d[0][i] = {}
            if (!d[d.length - 1][i]) d[d.length - 1][i] = {}
            d[0][i].topBorderStyle = 'thick'
            d[d.length - 1][i].bottomBorderStyle = 'thick'
        }
        //left&right
        for (let i in [...Array(rows)]) {
            if (!d[i][0]) d[i][0] = {}
            d[i][0].leftBorderStyle = 'thick'
            for (let j = 0; j <= cols; j++) {
                if (!d[i][j]) d[i][j] = {}
                if (cols - 1 == j) d[i][j].rightBorderStyle = 'thick'
            }
        }
        return d
    }

    applicableUsers.forEach(u => data.push(...getUserData(u), [], []))

    // In T-Sheets but not C-Track
    if (tsheets_data[date]) for (let uid in tsheets_data[date]) for (let sheet of tsheets_data[date][uid].timesheets) {
        if (!tsheetsVisited.has(sheet.id)) {
            if (!discrepancies[uid]) discrepancies[uid] = []
            discrepancies[uid].push({ jc: sheet.customfields ? sheet.customfields['1164048'] || sheet.notes : sheet.notes, ts_hours: sheet.hours, count: 0, date: date })
        }
    }

    applicableUsers.forEach(u => { if (discrepancies[u] && discrepancies[u].length > 0) data.push(...getDiscrepancy(u), [], []) })

    // Update global totals
    data[3][1].value = total_revenue
    data[4][1].value = total_hours
    data[5][1].value = total_hours == 0 ? 0 : round(total_revenue / total_hours, 3)
    data[5][1].backgroundColor = round(total_revenue / total_hours, 3) >= reportTunables.overPercent * reportTunables.expectedHourly ? reportTunables.overColor : round(total_revenue / total_hours, 3) <= reportTunables.underPercent * reportTunables.expectedHourly ? reportTunables.underColor : reportTunables.goalColor

    // Set column widths
    const columns = [{ width: 40 }, { width: 17.5 }, { width: 18.25 }, { width: 17.5 }, { width: 17.5 }, { width: 17.5 }, { width: 17.5 }, { width: 17.5 }]

    return res.status(200).json({ data, columns })
})


module.exports = Router

function getDate(date) {
    date = new Date(date)
    return date.toISOString().split('T')[0]
}


/**
 * date{
 *      employee {
 *              userObj:
 *              timesheets:[ts_obj]       
 *      }
 * }
 */
/**
 * 
 * @param {Date} start The start date
 * @param {Date} end The end date
 * @returns {Object} tsheets_data
 */
async function getTsheetsData(job_codes, start, end) {
    const tsheets_data = {}
    let job_code_cache = {} //tsid:db id
    let loop = true, failed = false
    let page = 1
    do {
        let ts_call = await axios.get(`https://rest.tsheets.com/api/v1/timesheets`, {
            params: {
                //user_ids: applicableUserString,
                start_date: start,
                jobcode_ids: 61206982, // CURO's customer id
                end_date: end || undefined,
                page: page
            }, headers: {
                Authorization: `Bearer ${tsheetsBearer}`
            }
        }).catch(er => { console.log(er); failed = true })
        if (failed) break;
        if (!ts_call.data.results) { failed = true; break; }

        let sheets = ts_call.data.results.timesheets

        if (ts_call.data.more) page++
        else loop = false

        for (let ind in sheets) { //this might have to be 'for in'
            let i = sheets[ind]
            let d = i.date
            let uid = TSheetsUIDtoUID[`${i.user_id}`] // check data type, the key is string, key[id] is Number
            i.localUid = uid
            if (!tsheets_data[d]) tsheets_data[d] = {}
            if (!tsheets_data[d][uid]) tsheets_data[d][uid] = { userObj: ts_call.data.supplemental_data.users[i.user_id], timesheets: [] }
            if (!i.customfields || !i.customfields['1164048']) { console.log(`Missing customfield or customfield[1164048] on uid: ${uid}'s entry with id of ${i.id}\n${i.customfields.map((val, key) => `${key}: ${val}`).join(', ')}`); continue }
            let jc_name = i.customfields['1164048'].split(':').splice(1).join(':').replace(/[:-\s]/gi, '').toLowerCase()
            if (!jc_name) { console.log(`Missing jc_name from uid: ${uid}'s entry with id of ${i.id}`); continue }
            if (job_code_cache[`${jc_name}`]) i.jobCode = job_code_cache[`${jc_name}`]
            else {
                let f = false
                for (let j in job_codes) {
                    if (job_codes[j].name.replace(/[:-\s]/gi, '').toLowerCase() == jc_name) {
                        f = true
                        i.jobCode = j
                        job_code_cache[`${jc_name}`] = j
                        break;
                    }
                }
                if (!f) i.jobCode = null
            }
            i.count = i.notes ? i.notes.replace(/[:-]/g, ' ').split(' ')[0] : 0
            if (isNaN(i.count)) i.count = 0
            i.hours = i.duration / 3600
            tsheets_data[d][uid].timesheets.push(i)
        }
    } while (loop)

    if (Object.keys(tsheets_data).length == 0) return null
    return tsheets_data
}

/**
 * {date
 *      employee {
 *              jobcode: count     
 *      }
 * }
 */
function getSnipeData(start) {
    return new Promise(async (res, rej) => {
        let startD = new Date(start)
        const data = {}
        let today = new Date().toISOString().split('T')[0]
        data[today] = {}
        while (startD < Date.now()) { data[startD.toISOString().split('T')[0]] = {}; startD.setDate(startD.getDate() + 1) }
        startD = new Date(start)

        let offset = 0, cont = true
        while (cont) {
            // Get data
            const d = await axios.get(`${snipeAPILink}/reports/activity?action_type=update&offset=${offset}&limit=${200}`, { headers: { Authorization: SnipeBearer } }).then(d => d.data.rows).catch(er => { console.log(er); return { error: true } })
            if (d.error) return rej()

            // Loop logic/condition
            let lastDate = new Date(d[d.length - 1].updated_at.datetime.split(' ')[0])
            if (lastDate <= startD) cont = false
            offset += d.length

            // Sort Data
            for (let i of d) {
                let uid = snipeToUID[i.admin.id]
                let day = new Date(i.updated_at.datetime).toISOString().split('T')[0]
                if (!uid) continue
                if (day < startD || !data[day]) continue
                if (!i.log_meta || !i.log_meta.status_id) continue
                let change = i.log_meta.status_id.new
                if (!change) continue
                change = snipeToJobId[change]
                let assetTag = i.item.name.replace(/\(20..\)/g, '').match(/\((.*)\)/g)
                if (assetTag.length == 0) continue
                assetTag = assetTag[0].replace(/[\(\)]/g, '')
                if (!data[day][uid]) data[day][uid] = {}
                if (!data[day][uid][change]) data[day][uid][change] = [assetTag]
                else data[day][uid][change].push(assetTag)
            }
        }
        res(data)
    })
}

const round = (x, n) => Number(parseFloat(Math.round(x * Math.pow(10, n)) / Math.pow(10, n)).toFixed(n));

/** Code to get all the job codes from snipe and match them to the db
        let d = await axios.get(`${snipeAPILink}/statuslabels`, { headers: { Authorization: SnipeBearer } }).then(d => d.data)
        let pool = await sql.connect({
            "user": "NodeExpress",
            "password": "J9:N*pJkh@5rsjX^",
            "database": "Tracker",
            "server": "192.168.205.221",
            "options": {
                "encrypt": false,
                "trustServerCertificate": true
            }
        })
        let job_codes = {}
        let job_code_query = await pool.request().query(`SELECT id,job_code FROM jobs`)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (job_code_query.isErrored) return res.status(500).json({ message: 'Error fetching job codes' })
        for (let i of job_code_query.recordset) job_codes[i.id] = i.job_code
        console.log(job_codes)
        let dat = {}
        for (let i of d.rows) {
            let found = false
            for (let j in job_codes) {
                // console.log(job_codes[j], i.name)
                if (job_codes[j].toLowerCase().replace(/[ :/]/gi, '') == i.name.toLowerCase().replace(/[ :/]/gi, '')) {
                    found = true
                    dat[j] = i.id
                    console.log(`matched ${job_codes[j]} and ${i.name}`)
                } else if (job_codes[j].toLowerCase().replace(/[ :/]/gi, '').replace(/repl/gi, 'r').replace(/depl/gi, 'd').replace(/hrly/gi, 'h').replace(/proj/gi, 'p').replace(/ship/gi, 's') == i.name.toLowerCase().replace(/[ :/]/gi, '').replace(/repl/gi, 'r').replace(/depl/gi, 'd').replace(/hrly/gi, 'h').replace(/proj/gi, 'p').replace(/ship/gi, 's')) {
                    found = true
                    dat[j] = i.id
                    console.log(`matched ${job_codes[j]} and ${i.name}`)
                }
            }
            if (!found) { dat[i.name] = i.id; console.log(`no match found for ${i.name}`) }
        }
        fs.writeFileSync('./snipeJobs.json', JSON.stringify(dat, null, 4))
 */