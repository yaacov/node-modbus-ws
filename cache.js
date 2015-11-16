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
const RESEND_WAIT = 1000; // do not trigger new io-get event for N-ms.
const MAX_LENGTH = 10; // max registers to ask in one modbus request.
const POLL_INTERVAL = 1000; // wait N-ms between modbus polls.

const TYPE_INPUT_REG = 0;
const TYPE_HOLDING_REG = 1;
const TYPE_COIL = 2;

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
     * type - register type [0 input, 1 holding, 2 coil, 3 digital input]
     * val  - register value
     * ask  - first time browser send request
     * ans  - last time device replied and answer sent to browser
     * snd  - last time io event was triggered
     */
    const CREATE_CACHE = "CREATE TABLE IF NOT EXISTS cache (\
        unit NUMBER, \
        type NUMBER, \
        reg NUMBER, \
        val NUMBER, \
        ask NUMBER, \
        ans NUMBER, \
        snd NUMBER, \
        PRIMARY KEY (unit, type, reg))";
    
    console.log("        Create cache table");
    db.run(CREATE_CACHE);
}

/**
 * Init cache table rows for registers.
 *
 * @param {number} unit the unit id.
 * @param {number} type the register type.
 * @param {number} register the first register to create.
 * @param {number} length the number of registers to create.
 */
var initRegisters = function(unit, type, register, length) {
    const INSERT_NEW = "INSERT OR IGNORE INTO cache VALUES (?, ?, ?, ?, ?, ?, ?)";
    var now = Date.now();
    
    // make sure each register has a row
    var stmt = db.prepare(INSERT_NEW);
    for (var i = register; i < (register + length); i++) {
        stmt.run(unit, type,  i, 0, now, 0, 0);
    }
    stmt.finalize();
}

/**
 * Get holding registers using cache, and flag to get new data from device
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get.
 */
var getHoldingRegisters = function(unit, address, length) {
    getRegisters(unit, TYPE_HOLDING_REG, address, length)
}

/**
 * Get input registers using cache, and flag to get new data from device
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get.
 */
var getInputRegisters = function(unit, address, length) {
    getRegisters(unit, TYPE_INPUT_REG, address, length)
}

/**
 * Get registers using cache, and flag to get new data from device
 *
 * @param {number} unit the unit id.
 * @param {number} type the register type.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get.
 */
var getRegisters = function(unit, type, address, length) {
    const UPDATE_ASK = "UPDATE cache SET ask = ? \
        WHERE unit = ? AND type = ? AND reg >= ? AND reg < ? AND ask < ?";
    const SELECT_GET = "SELECT unit, reg, val FROM cache \
        WHERE unit = ? AND type = ? AND reg >= ? AND reg < ? AND ans > ?";
    
    initRegisters(unit, type, address, length);
    
    var now = Date.now();
    var data = new Array(length);
    
    // set ask signal
    db.run(UPDATE_ASK, now, unit, type, address, address + length, now - FORGET_ASK);
    
    // check for data in cache
    db.all(SELECT_GET, unit, type, address, address + length, now - VALID_ANS,
        function(err, rows) {
            if (err) {
                _io.emit('error', {'err': err});
            } else {
                // if we have valid data in cache
                if (rows.length == length) {
                    // fill the data arry
                    rows.forEach(function(row, i) {data[i] = row.val;});
                    
                    // emit data get event
                    _emitDataGetEvent(unit, type, address, data);
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
    const SELECT_NEXT_REG = "SELECT unit, type, reg FROM cache \
        WHERE ask > ? \
        ORDER BY ask ASC LIMIT 1";
    const SELECT_LAST_REG = "SELECT reg FROM cache \
        WHERE unit = ? AND type = ? AND reg < ? AND ask > ? \
        ORDER BY reg DESC LIMIT 1";
    
    var now = Date.now();
    
    // find the register with oldest ask time
    db.get(SELECT_NEXT_REG, now - FORGET_ASK, function(err, row) {
        if (err) {
            console.log(err);
        } else if (row) {
            var unit = row.unit;
            var type = row.type;
            var firstReg = row.reg;
            var lastReg;
            
            db.get(SELECT_LAST_REG, unit, type, firstReg + MAX_LENGTH, now - FORGET_ASK,
                function(err, row) {
                    if (err) {
                        console.log(err);
                    } else if (row) {
                        lastReg = row.reg;
                        var length = lastReg - firstReg + 1;
                        
                        // ask from modbus and triger io data get event
                        // and update cache value
                        _getRegisters(unit, type, firstReg, length);
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
 * @param {number} type the register type.
 * @param {number} address the first register to set.
 * @param {array} data the new values to set into registers
 */
var _emitDataGetEvent = function(unit, type, address, data) {
    const SELECT_BY_SND = "SELECT unit, type, reg FROM cache \
        WHERE unit = ? AND type = ? AND reg >= ? AND reg < ? AND snd < ?";
    const UPDATE_SND = "UPDATE cache SET snd = ? \
        WHERE unit = ? AND type = ? AND reg >= ? AND reg < ?";
    
    var now = Date.now();
    var length = data.length;
    
    db.all(SELECT_BY_SND, unit, type, address, address + length, now - RESEND_WAIT,
        function(err, rows) {
            if (err) {
                _io.emit('error', {'err': err});
            } else {
                // if we need to emit data
                if (rows.length == length) {
                    // update cache
                    db.run(UPDATE_SND, now, unit, type, address, address + length);
                    
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
 * @param {number} type the register type.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get
 */
var _getRegisters = function(unit, type, address, length) {
    const UPDATE_REG = "UPDATE cache SET val= ?, ans = ?, ask = 0 \
        WHERE unit = ? AND type = ? AND reg = ?";
    
    var now = Date.now();
    
    if (type == TYPE_HOLDING_REG) {
        _modbus.writeFC3(unit, address, length,
            function(err, msg) {
                if (err) {
                    _io.emit('error', {'err': err});
                } else {
                    // update data in cache, and clear ask flag
                    var stmt = db.prepare(UPDATE_REG);
                    for (i = 0; i < length; i++) {
                        stmt.run(msg.data[i], now, unit, type, address + i);
                    }
                    stmt.finalize();
                    
                    // emit data get event
                    _emitDataGetEvent(unit, type, address, msg.data);
                }
            }
        );
    } else if (type == TYPE_INPUT_REG) {
        _modbus.writeFC4(unit, address, length,
            function(err, msg) {
                if (err) {
                    _io.emit('error', {'err': err});
                } else {
                    // update data in cache, and clear ask flag
                    var stmt = db.prepare(UPDATE_REG);
                    for (i = 0; i < length; i++) {
                        stmt.run(msg.data[i], now, unit, type, address + i);
                    }
                    stmt.finalize();
                    
                    // emit data get event
                    _emitDataGetEvent(unit, type, address, msg.data);
                }
            }
        );
    }
}

/**
 * Set modbus registers
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to set.
 * @param {array} data the new values to set into registers
 */
var setRegisters = function(unit, address, data) {
    const UPDATE_REG = "UPDATE cache SET ans = 0, snd = 0, ask = 0 \
        WHERE unit = ? AND type = ? AND reg >= ? AND reg < ?";
    
    var length = data.length;
    var type = TYPE_HOLDING_REG;
    
    initRegisters(unit, address, length);
    
    _modbus.writeFC16(unit, address, data,
        function(err, msg) {
            if (err) {
                _io.emit('error', {'err': err});
            } else {
                // invalidate the current value in cache
                db.run(UPDATE_REG, unit, type, address, address + length);
                
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
    
    setTimeout(poll, 200);
}

/**
 * Dump all cache rows to console
 */
var _debugReadAllRows = function() {
    console.log("readAllRows cache");
    db.all("SELECT unit, type, reg, val, ask, ans, snd FROM cache", function(err, rows) {
        rows.forEach(function (row) {
            console.log(row.unit, row.type, row.reg, row.ask, row.ans, row.snd);
        });
    });
}

module.exports = {};
module.exports.run = run;
module.exports.setRegisters = setRegisters;
module.exports.getHoldingRegisters = getHoldingRegisters;
module.exports.getInputRegisters = getInputRegisters;
