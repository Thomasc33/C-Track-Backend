# Asset-Tracking-Backend

## Prerequisites

[Node.js](https://nodejs.org/en/download/) *Created on v16.15.1*

SQL Server:

[SQL Express](https://www.microsoft.com/en-us/download/details.aspx?id=101064) For Dev Server

[SSMS](https://learn.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms?view=sql-server-ver16) To connect to dev/prod server


## Setup and Running

Duplicate and rename `settings_template.json` to `settings.json`

Fill in important parts of `settings.json`

Install Dependencies

```bash
npm i
```

*Optional: Install nodemon* (Allows hot reload on file change)

```bash
npm i nodemon -g
```

Start the backend
```bash
# Without Nodemon
node .

# With Nodemon
nodemon .
```
