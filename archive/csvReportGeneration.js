// Replaced by the /report/excel route
// Archived 3/28/2022 -Thomas C
// Requiring this file will lead to errors


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