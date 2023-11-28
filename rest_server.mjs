import * as path from 'node:path';
import * as url from 'node:url';

import { default as express, response } from 'express';
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
    let { start_date, end_date, code, grid, neighborhood, limit} = req.query;

    start_date = start_date ? new Date(start_date): new Date(-8640000000000000);
    end_date = end_date ? new Date(end_date) : new Date(8640000000000000);
    let codes = code ? code.split(',') : false;
    let grids = grid ? grid.split(',') : false;
    let neighborhoods = neighborhood ? neighborhood.split(',') : false;
    limit = limit ? limit : 1000;

    let sqlQuery = sqlGen.select().from('Incidents');
    dbSelect(sqlQuery.build(),[]).then((incidents) => {
        incidents.sort((a, b) => {
            let date_time_a = new Date(a.date_time);
            let date_time_b = new Date(b.date_time);
            return date_time_b - date_time_a;
        })
        incidents = incidents.filter((incident) => {
            let date = new Date(incident.date_time)
            return (date >= start_date && date <= end_date) 
            && (!codes || codes.includes(incident.code.toString())) 
            && (!grids || grids.includes(incident.grid.toString()))
            && (!neighborhoods || neighborhoods.includes(incident.neighborhood))})
        if(incidents.length > 0){
            incidents = incidents.slice(0, limit);
            for(let i=0; i<incidents.length; i++){
                let [date, time] = incidents[i].date_time.split('T');
                incidents[i] = {
                    case_number: incidents[i].case_number,
                    date: date,
                    time: time,
                    code: incidents[i].code,
                    incident: incidents[i].incident,
                    police_grid: incidents[i].police_grid,
                    neighborhood_number: incidents[i].neighborhood_number,
                    block: incidents[i].block
                }
            }
            res.status(200).type('json').send(incidents);
        } else{
            res.status(404).type('json').send('No incidents found with selected parameters')
        }
    }).catch((err) => {
        res.status(500).type('text').send(err);
    })
});

// PUT request handler for new crime incident
app.put('/new-incident', (req, res) => {
    console.log(req.body); // uploaded data
    let data = req.body;
    
    let dateTime = data.date + data.time;
    console.log(dateTime);
    let sqlQuery = sqlGen.insert().into('Incidents');
    
    // if statement that sends status 500 if case number already exists
    // data fields: case_number, date, time, code, incident, police_grid, neighborhood_number, block
    // need to break up the data fields in the request to and use set to insert 
    sqlQuery.set({case_number: data.case_number, date_time: dateTime, code: data.code, incident: data.incident, police_grid: data.police_grid, neighborhood_number: data.neighborhood_number, block: data.block}); 
    
    console.log(dbRun(sqlQuery.build(), data));
    dbRun(sqlQuery.build(), data).then(data => {
        res.status(200).type('json').send(data);
        console.log("sent");
    }).catch(err => {
        res.status(500).type('text').send(err);
    });

    res.status(200).type('txt').send('OK'); // <-- you may need to change this
});

// DELETE request handler for new crime incident
app.delete('/remove-incident', (req, res) => {
    console.log(req.query); // query object (key-value pairs after the ? in the url)
    if(!Object.hasOwn(req.query, 'case_number')){
        res.status(400).type('text').send("missing case number");
    }
    let sqlQuery = sqlGen.select().from('Incidents').where({case_number: '?'});
    let sqlDelete = sqlGen.remove().from('Incidents').where({case_number: '?'});
    
    dbSelect(sqlQuery.build(), [req.query.case_number]).then(values => {
        if(values.length == 0){
            res.status(500).type('text').send('case not found');
        }else{
            dbRun(sqlDelete.build(), [req.query.case_number]).then(response => {
                res.status(200).type('text').send(values);
            }).catch(err => {
                res.status(500).type('text').send(err);
            });
        }
    }).catch(err => {
        res.status(500).type('text').send(err);
    });
});

/********************************************************************
 ***   START SERVER                                               *** 
 ********************************************************************/
// Start server - listen for client connections
app.listen(port, () => {
    console.log('Now listening on port ' + port);
});
