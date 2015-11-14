/**
 * Copyright (c) 2015, Yaacov Zamir <kobi.zamir@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any 
 * purpose with or without fee is hereby granted, provided that the above 
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES 
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF 
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR 
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES 
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN 
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF 
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF  THIS SOFTWARE.
 */

var sqlite3 = require('sqlite3').verbose();
var db;
var _io;
var _modbus;

const VALID_ANS = 5000; // answers are valid for N-ms.
const FORGET_ASK = 10000; // if not answered after N-ms, forget ask request.
const RESEND_WAIT = 200; // do not trigger new io-get event for N-ms.
const MAX_LENGTH = 10; // max registers to ask in one modbus request.
const POLL_INTERVAL = 1000; // wait N-ms between modbus polls.

/**
 * Create the cache database.
 */
var createDb = function() {
    console.log("        Create cache db.");
    db = new sqlite3.Database(':memory:');
}

/**
 * Create the cache table.
 */
var createTable = function() {
    /* unit - unit id
     * reg  - register number
     * val  - register value
     * ask  - first time browser send request
     * ans  - last time device replied and answer sent to browser
     * snd  - last time io event was triggered
     */
    const CREATE_CACHE = "CREATE TABLE IF NOT EXISTS cache (\
        unit NUMBER, \
        reg NUMBER, \
        val NUMBER, \
        ask NUMBER, \
        ans NUMBER, \
        snd NUMBER, \
        PRIMARY KEY (unit, reg))";
    
    console.log("        Create cache table");
    db.run(CREATE_CACHE);
}

/**
 * Init cache table rows for registers.
 *
 * @param {number} unit the unit id.
 * @param {number} register the first register to create.
 * @param {number} length the number of registers to create.
 */
var initRegisters = function(unit, register, length) {
    const INSERT_NEW = "INSERT OR IGNORE INTO cache VALUES (?, ?, ?, ?, ?, ?)";
    var now = Date.now();
    
    // make sure each register has a row
    var stmt = db.prepare(INSERT_NEW);
    for (var i = register; i < (register + length); i++) {
        stmt.run(unit, i, 0, now, 0, 0);
    }
    stmt.finalize();
}

/**
 * Get registers using cache, and flag to get new data from device
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get.
 */
var getRegisters = function(unit, address, length) {
    const UPDATE_ASK = "UPDATE cache SET ask = ? \
        WHERE unit = ? AND reg >= ? AND reg < ? AND ask < ?";
    const SELECT_GET = "SELECT unit, reg, val FROM cache \
        WHERE unit = ? AND reg >= ? AND reg < ? AND ans > ?";
    const UPDATE_SND = "UPDATE cache SET snd = ? \
        WHERE unit = ? AND reg >= ? AND reg < ?";
    
    initRegisters(unit, address, length);
    
    var now = Date.now();
    var data = new Array(length);
    
    // set ask signal
    db.run(UPDATE_ASK, now, unit, address, address + length, now - FORGET_ASK);
    
    // check for data in cache
    db.all(SELECT_GET, unit, address, address + length, now - VALID_ANS,
        function(err, rows) {
            if (err) {
                io.emit('error', {'err': err});
            } else {
                // if we have valid data in cache
                if (rows.length == length) {
                    // update cache
                    db.run(UPDATE_SND, now, unit, address, address + length);
                    
                    // fill the data arry
                    rows.forEach(function(row, i) {data[i] = row.val;});
                    
                    // triger data-get event
                    _io.emit('data', {
                        'id': unit,
                        'address': address,
                        'values': data,
                        'flag': 'get'
                    });
                }
            }
        }
    )
}

/**
 * Poll modbus registers
 *
 * find the registers with the oldest ask time
 * and request data from device.
 */
var pollNextGroup = function() {
    const SELECT_NEXT_REG = "SELECT unit, reg FROM cache \
        WHERE ask > ? \
        ORDER BY ask ASC LIMIT 1";
    const SELECT_LAST_REG = "SELECT reg FROM cache \
        WHERE unit = ? AND reg < ? AND ask > ? \
        ORDER BY reg DESC LIMIT 1";
    
    var now = Date.now();
    
    // find the register with oldest ask time
    db.get(SELECT_NEXT_REG, now - FORGET_ASK, function(err, row) {
        if (err) {
            console.log(err);
        } else if (row) {
            var unit = row.unit;
            var firstReg = row.reg;
            var lastReg;
            
            db.get(SELECT_LAST_REG, unit, firstReg + MAX_LENGTH, now - FORGET_ASK,
                function(err, row) {
                    if (err) {
                        console.log(err);
                    } else if (row) {
                        lastReg = row.reg;
                        var length = lastReg - firstReg + 1;
                        
                        // ask from modbus and triger io data get event
                        // and update cache value
                        _getRegisters(unit, firstReg, length);
                    }
                }
            );
        }
    });
}

/**
 * emit data get event to browser
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to set.
 * @param {array} data the new values to set into registers
 */
var _emitDataGetEvent = function(unit, address, data) {
    const SELECT_BY_SND = "SELECT unit, reg FROM cache \
        WHERE unit = ? AND reg >= ? AND reg < ? AND snd < ?";
    const UPDATE_SND = "UPDATE cache SET snd = ? \
        WHERE unit = ? AND reg >= ? AND reg < ?";
    
    var now = Date.now();
    var length = data.length;
    
    db.all(SELECT_BY_SND, unit, address, address + length, now - RESEND_WAIT,
        function(err, rows) {
            if (err) {
                io.emit('error', {'err': err});
            } else {
                // if we need to emit data
                if (rows.length == length) {
                    // update cache
                    db.run(UPDATE_SND, now, unit, address, address + length);
                    
                    // triger data-get event
                    _io.emit('data', {
                        'id': unit,
                        'address': address,
                        'values': data,
                        'flag': 'get'
                    });
                }
            }
        }
    )
}

/**
 * Get modbus registers
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get
 */
var _getRegisters = function(unit, address, length) {
    const UPDATE_REG = "UPDATE cache SET val= ?, ans = ?, ask = 0 \
        WHERE unit = ? AND reg >= ? AND reg < ?";
    
    var now = Date.now();
    
    _modbus.writeFC4(unit, address, length,
        function(err, msg) {
            if (err) {
                io.emit('error', {'err': err});
            } else {
                // update data in cache, and clear ask flag
                var stmt = db.prepare(UPDATE_REG);
                for (i = 0; i < length; i++) {
                    stmt.run(msg.data[i], now, address + i);
                }
                stmt.finalize();
                
                // emit data get event
                _emitDataGetEvent(unit, address, msg.data);
            }
        }
    );
}

/**
 * Set modbus registers
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to set.
 * @param {array} data the new values to set into registers
 */
var setRegisters = function(unit, address, data) {
    const UPDATE_REG = "UPDATE cache SET ans = 0 \
        WHERE unit = ? AND reg >= ? AND reg < ?";
    
    var length = data.length;
    
    initRegisters(unit, address, length);
    
    _modbus.writeFC16(unit, address, data,
        function(err, msg) {
            if (err) {
                io.emit('error', {'err': err});
            } else {
                // invalidate the current value in cache
                db.run(UPDATE_REG, unit, address, address + length);
                
                // triger data-set event
                _io.emit('data', {
                    'id': unit,
                    'address': address,
                    'values': data,
                    'flag': 'set'
                });
            }
        }
    );
}

/**
 * Close data base
 */
var closeDb = function() {
    console.log("        Close cache db");
    db.close();
}

/**
 * Init the cache and Run polling cycle
 *
 * @param {socket.io} io the socket io object to comunicate with browser.
 * @param {modbus} modbus the modbus object to comunicate with devices.
 */
var run = function(io, modbus) {
    createDb();
    createTable();
    
    _io = io;
    _modbus = modbus;
    
    var poll = function() {
        pollNextGroup();
        
        // wait a little and then do poll again
        setTimeout(poll, POLL_INTERVAL);
    }
    
    setTimeout(poll, 1000);
}

/**
 * Dump all cache rows to console
 */
var _debugReadAllRows = function() {
    console.log("readAllRows cache");
    db.all("SELECT unit, reg, val, ask, ans, snd FROM cache", function(err, rows) {
        rows.forEach(function (row) {
            console.log(row.unit, row.reg, row.ask, row.ans, row.snd);
        });
    });
}

module.exports = {};
module.exports.run = run;
module.exports.setRegisters = setRegisters;
module.exports.getRegisters = getRegisters;
