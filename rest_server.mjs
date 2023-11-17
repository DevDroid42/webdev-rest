import * as path from 'node:path';
import * as url from 'node:url';

import { default as express } from 'express';
import { default as sqlite3 } from 'sqlite3';
import { default as sql_query} from 'sql-query';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const db_filename = path.join(__dirname, 'db', 'stpaul_crime.sqlite3');

const port = 8000;

let app = express();
app.use(express.json());

let sqlGen  = sql_query.Query('SQLite');
console.log(sqlGen.remove().from('codes').where({code: '?'}).build());
console.log(sqlGen.update().into('codes').set({newData: '?'}).where({code: '?'}).build());
console.log(sqlGen.select().from('codes').where({code: '?'}).build());

/********************************************************************
 ***   DATABASE FUNCTIONS                                         *** 
 ********************************************************************/
// Open SQLite3 database (in read-write mode)
let db = new sqlite3.Database(db_filename, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.log('Error opening ' + path.basename(db_filename));
    }
    else {
        console.log('Now connected to ' + path.basename(db_filename));
    }
});

// Create Promise for SQLite3 database SELECT query 
function dbSelect(query, params) {
    //this is done to accommodate the sql generator not formatting ? correctly 
    query = query.replaceAll("'", "");
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(rows);
            }
        });
    });
}

// Create Promise for SQLite3 database INSERT or DELETE query
function dbRun(query, params) {
    //this is done to accommodate the sql generator not formatting ? correctly 
    query = query.replaceAll("'", "");
    return new Promise((resolve, reject) => {
        db.run(query, params, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}

/********************************************************************
 ***   REST REQUEST HANDLERS                                      *** 
 ********************************************************************/
// GET request handler for crime codes 
app.get('/codes', (req, res) => {
    console.log(req.query); // query object (key-value pairs after the ? in the url)
    let sqlQuery = sqlGen.select().from('Codes');
    //these are the actual params fed into the db method call
    let codes = [];
    //check if the code was sent
    if(Object.hasOwn(req.query, 'code')){
        //if it is for each code add an element to the param list
        codes = req.query.code.split(',');

        //this is a list of parameters used for the base sql string generation
        let paramList = [];
        for (let i = 0; i < codes.length; i++) {
            paramList.push('?');
        }
        sqlQuery.where({code: paramList});    
        //this generates: "SELECT * FROM `Codes` WHERE `code` IN ('?', '?')"
        //when two codes are sent, for each code sent comma separated a new '?' is added to the string
    }
    dbSelect(sqlQuery.build(), codes).then(values => {
        res.status(200).type('json').send(values); 
    }).catch(err => {
        res.status(500).type('text').send(err);
    });
});

// GET request handler for neighborhoods, this logic is the same as codes
app.get('/neighborhoods', (req, res) => {
    console.log(req.query); // query object (key-value pairs after the ? in the url)
    let sqlQuery = sqlGen.select().from('Neighborhoods');
    let ids = [];
    if(Object.hasOwn(req.query, 'id')){
        ids = req.query.id.split(',');
        let paramList = [];
        for (let i = 0; i < ids.length; i++) {
            paramList.push('?');
        }
        sqlQuery.where({neighborhood_number : paramList});    
    }
    dbSelect(sqlQuery.build(), ids).then(values => {
        res.status(200).type('json').send(values); 
    }).catch(err => {
        res.status(500).type('text').send(err);
    });
});

// GET request handler for crime incidents
app.get('/incidents', (req, res) => {
    console.log(req.query); // query object (key-value pairs after the ? in the url)
    
    res.status(200).type('json').send({}); // <-- you will need to change this
});

// PUT request handler for new crime incident
app.put('/new-incident', (req, res) => {
    console.log(req.body); // uploaded data
    
    res.status(200).type('txt').send('OK'); // <-- you may need to change this
});

// DELETE request handler for new crime incident
app.delete('/remove-incident', (req, res) => {
    console.log(req.body); // uploaded data
    
    res.status(200).type('txt').send('OK'); // <-- you may need to change this
});

/********************************************************************
 ***   START SERVER                                               *** 
 ********************************************************************/
// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
