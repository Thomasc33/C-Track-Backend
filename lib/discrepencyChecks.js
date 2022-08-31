const { getSnipeData, getTsheetsData } = require('../routes/Reports')
const sql = require('mssql')
const config = require('../settings.json').SQLConfig
const JobCodePairs = require('../data/jobCodePairs.json')
const JobCodePairsSet = new Set()
JobCodePairs.forEach(a => a.forEach(ele => JobCodePairsSet.add(ele)))

module.exports = {
    async check(uid = null) {
        // Establish SQL Connection
        let pool = await sql.connect(config)

        // Get Data today
        let now = new Date()
        now.setHours(0, 0, 0, 0)
        const today = now.toISOString().split('T')[0]
        now.setDate(now.getDate() + 1)
        const tomorrow = now.toISOString().split('T')[0]

        // Get Asset and Houly Data
        let asset_tracking_query = await pool.request().query(`SELECT * FROM asset_tracking WHERE date = '${today}'${uid ? ` AND user_id = '${uid}'` : ''}`)
            .then(d => d.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (asset_tracking_query && asset_tracking_query.isErrored) return console.log('Failed getting asset tracking in discrepency check')

        let hourly_tracking_query = await pool.request().query(`SELECT * FROM hourly_tracking WHERE date = '${today}'${uid ? ` AND user_id = '${uid}'` : ''}`)
            .then(d => d.recordset).catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (hourly_tracking_query && hourly_tracking_query.isErrored) return console.log('Failed getting hourly tracking in discrepency check')

        if (!asset_tracking_query && !hourly_tracking_query) return

        // Get user name object
        let usernames = {}
        let user_query = await pool.request().query(`SELECT id,name FROM users${uid ? ` WHERE id = '${uid}'` : ''}`)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (user_query.isErrored) return console.log('Failed getting users in discrepency check')
        for (let i of user_query.recordset) usernames[i.id] = i.name

        let applicableUsers = new Set()
        if (asset_tracking_query) for (let i of asset_tracking_query) applicableUsers.add(i.user_id)
        if (hourly_tracking_query) for (let i of hourly_tracking_query) applicableUsers.add(i.user_id)

        // Get Job Code Names
        let job_codes = {}
        let job_code_query = await pool.request().query(`SELECT id,job_code,hourly_goal,requires_asset FROM jobs`)
            .catch(er => { console.log(er); return { isErrored: true, error: er } })
        if (job_code_query.isErrored) return console.log('Failed getting job codes in discrepency check')
        for (let i of job_code_query.recordset) job_codes[i.id] = { name: i.job_code, hourly_goal: i.hourly_goal, requires_asset: i.requires_asset }

        // Get Snipe Data
        const snipeData = null//await getSnipeData(today)

        // Get Tsheets Data
        const tsheets_data = await getTsheetsData(job_codes, today, tomorrow, uid ? [uid] : undefined)

        let discrepancies = {}
        for (let i of applicableUsers) discrepancies[i] = []
        let tsheetsVisited = new Set()

        function getUserData(id) {
            let assetJobCodes = new Set()
            let hourlyJobCodes = new Set()
            if (asset_tracking_query) for (let i of asset_tracking_query) if (i.user_id == id) assetJobCodes.add(i.job_code)
            if (hourly_tracking_query) for (let i of hourly_tracking_query) if (i.user_id == id) hourlyJobCodes.add(i.job_code)

            assetJobCodes.forEach(jc => {
                // Storage Variables
                let ts_hours = 0.0, ts_count = 0, count = 0, unique = []
                //snipe_count = 0, 

                // Complimentary job code
                let complimentaryJC
                if (JobCodePairsSet.has(jc)) for (let i of JobCodePairs) if (i.includes(jc)) for (let j of i) if (j != jc) complimentaryJC = j

                // Get Tsheets data
                if (tsheets_data && tsheets_data[today] && tsheets_data[today][id]) for (let i of tsheets_data[today][id].timesheets) if (i.jobCode == `${jc}` || i.jobCode == complimentaryJC) {
                    ts_hours += i.hours;
                    ts_count += parseInt(i.count);
                    tsheetsVisited.add(i.id)
                }

                // Get C-Track data
                let assets = []
                for (let i of asset_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == today && i.job_code == jc) assets.push(i.asset_id)
                count += assets.length

                // Get Snipe Data
                // if (snipeData && snipeData[today] && snipeData[today][id] && (snipeData[today][id][jc] || snipeData[today][id][parseInt(jc)])) {
                //     snipe_count += snipeData[today][id][jc] ? snipeData[today][id][jc].length : snipeData[today][id][parseInt(jc)].length;
                //     let s = snipeData[today][id][jc] ? snipeData[today][id][jc].map(m => m.toUpperCase().trim()) : snipeData[today][id][parseInt(jc)].map(m => m.toUpperCase().trim())
                //     let a = assets.map(m => m.toUpperCase().trim())
                //     unique = [...a.filter(e => s.indexOf(e) === -1), ...s.filter(e => a.indexOf(e) === -1)]
                // } else {
                //     unique = assets.join(', ')
                // }

                // Discrepancy check
                if (job_codes[jc].requires_asset && tsheets_data) if ((Object.keys(tsheets_data).length && ts_count !== count) /*|| count !== snipe_count*/) discrepancies[id].push({ jc, ts_count, count, /*snipe_count, */today, unique })
            })

            hourlyJobCodes.forEach(jc => {
                // Check for complimentary job codes
                let complimentaryJC
                if (JobCodePairsSet.has(jc)) for (let i of JobCodePairs) if (i.includes(jc)) for (let j of i) if (j != jc) complimentaryJC = j

                // Storage variables
                let ts_hours = 0, ts_count = 0, count = 0

                // Get Tsheets counts
                if (tsheets_data && tsheets_data[today] && tsheets_data[today][id]) for (let i of tsheets_data[today][id].timesheets) if (i.jobCode == `${jc}` || i.jobCode == `${complimentaryJC}`) { ts_hours += i.hours; ts_count += parseInt(i.count); tsheetsVisited.add(i.id) }

                // Get count from c-track
                for (let i of hourly_tracking_query) if (i.user_id == id && i.date.toISOString().split('T')[0] == today && i.job_code == jc) count += i.hours

                // Check to see if it was marked as discrepancy before
                if (complimentaryJC && discrepancies[id]) for (let ind in discrepancies[id]) {
                    let i = discrepancies[id][ind]
                    if (i.jc == complimentaryJC) {
                        discrepancies[id][ind].ts_count = ts_count
                        if (/*i.count == i.snipe_count && */i.count == ts_count) discrepancies[id].splice(ind, 1)
                    }
                }

                // Discrepancy check
                if (ts_hours !== count) discrepancies[id].push({ jc, ts_hours, count, today })
            })

            // Check Snipe and Tsheets data
            // if (snipeData && snipeData[today] && snipeData[today][id]) {
            //     for (let i in snipeData[today][id]) {
            //         if (!assetJobCodes.has(parseInt(i)) && !assetJobCodes.has(i)) {
            //             let ts_count = 0, count = 0, snipe_count = snipeData[today][id][i].length, unique = snipeData[today][id][i].join(', ')
            //             if (tsheets_data && tsheets_data[today]) for (let i of tsheets_data[today][id].timesheets) if (i.jobCode == i) { ts_count += parseInt(i.count) }
            //             discrepancies[id].push({ jc: i, ts_count, count, snipe_count, today, unique })
            //         }
            //     }
            // }
        }

        async function handleDiscrepancy(id) {
            let values = []
            for (let i of discrepancies[id]) {
                let job = job_codes[i.jc]
                values.push(`('${id}','1','Discrepency on: ${job ? job.name : i.jc}', 'C-Track ${isNaN(i.ts_hours) ? 'Count' : 'Hours'}: ${i.count || 0}${!isNaN(i.ts_count) ? `, T-Sheets Count: ${i.ts_count || 0}` : ''}${!isNaN(i.ts_hours) ? `, T-Sheets Hours: ${i.ts_hours || 0}` : ''}', GETDATE())`)
                /*(!isNaN(i.ts_count) || !(job && job.is_hourly)) && i.snipe_count != '-' ? `, Snipe Count: ${i.snipe_count || 0}` : ''*/
                /*i.unique ? `, Unique Assets: ${i.unique}` : ''*/
            }
            await pool.request().query(`INSERT INTO notifications (user_id,important,title,message,date) VALUES ${values.join(', ')}`)
                .catch(er => { console.log(er) })
        }

        applicableUsers.forEach(u => getUserData(u))

        // In T-Sheets but not C-Track
        if (tsheets_data && tsheets_data[today]) for (let uid in tsheets_data[today]) for (let sheet of tsheets_data[today][uid].timesheets) {
            if (!tsheetsVisited.has(sheet.id)) {
                if (!discrepancies[uid]) discrepancies[uid] = []
                discrepancies[uid].push({ jc: sheet.customfields ? sheet.customfields['1164048'] || sheet.notes : sheet.notes, ts_hours: sheet.hours, count: 0, date: today })
            }
        }

        applicableUsers.forEach(async u => { if (discrepancies[u] && discrepancies[u].length > 0) await handleDiscrepancy(u) })

        if (uid) return discrepancies[uid] ? discrepancies[uid].length : 0
    }
}