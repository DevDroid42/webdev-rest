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

    let codes = code ? code.split(',') : [];
    let grids = grid ? grid.split(',') : [];
    let neighborhoods = neighborhood ? neighborhood.split(',') : [];
    limit = limit ? limit : 1000;

    let sqlQuery = sqlGen.select().from('Incidents');
    if(codes.length > 0){
        let paramList = [];
        for (let i = 0; i < codes.length; i++) {
            paramList.push('?');
        }
        sqlQuery.where({code: paramList});
    } 
    if(grids.length > 0){
        let paramList = [];
        for (let i = 0; i < grids.length; i++) {
            paramList.push('?');
        }
        sqlQuery.where({police_grid: paramList});
    } 
    if(neighborhoods.length > 0){
        let paramList = [];
        for (let i = 0; i < grids.length; i++) {
            paramList.push('?');
        }
        sqlQuery.where({neighborhood_number: paramList});
    } 
    dbSelect(sqlQuery.build(), [...codes, ...grids, ...neighborhoods]).then((result) => {
        if(start_date || end_date){
            result = result.filter((incident) => {
            let date = new Date(incident.date_time)
            
            return (date >= start_date && date <= end_date);
            })
        } 
        for (let i = 0; i < result.length; i++) {
            let [date, time] = result[i].date_time.split('T')
            result[i] = {
                case_number: result[i].case_number,
                date: date,
                time: time,
                code: result[i].code,
                incident: result[i].incident,
                police_grid: result[i].police_grid,
                neighborhood_number: result[i].neighborhood_number,
                block: result[i].block
            }
        }
        result = result.reverse();
        result = result.slice(0,limit)
        res.status(200).type('json').send(result);
    }).catch((err) => {
        res.status(500).type('text').send(err);
    })
});

// PUT request handler for new crime incident
app.put('/new-incident', (req, res) => {
    console.log(req.query); // uploaded data
    let data = req.query;
    
    let dateTime = data.date + data.time;
    let sqlQuery = sqlGen.insert().into('Incidents');
    
    // if statement that sends status 500 if case number already exists
    // data fields: case_number, date, time, code, incident, police_grid, neighborhood_number, block
    // need to break up the data fields in the request to and use set to insert 
    sqlQuery.set({case_number: '?', date_time: '?', code: '?', incident: '?', police_grid: '?', neighborhood_number: '?', block: '?'});
    let params = [data.case_number,dateTime,data.code,data.incident,data.police_grid,data.neighborhood_number,data.block];

    dbRun(sqlQuery.build(), params).then(data => {
        res.status(200).type('json').send("added case");
        console.log("sent");
    }).catch(err => {
        res.status(500).type('text').send(err);
    });

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
                res.status(200).type('json').send(values);
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