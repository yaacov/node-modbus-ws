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

var VALID_ANS;
var RESEND_WAIT;
var FORGET_ASK;
var MAX_LENGTH;
var POLL_INTERVAL;

const TYPE_INPUT_REG = 4;
const TYPE_HOLDING_REG = 3;
const TYPE_COIL = 1;
const TYPE_DIGITAL_INPUT = 2;

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
 * Dump all cache rows to console
 */
var _debugReadAllRows = function() {
    const SELECT_ALL = "SELECT unit, type, reg, val, ask, ans, snd \
        FROM cache ORDER BY unit, type, reg";
    
    console.log("table: cache");
    
    db.serialize(function() {
        db.all(SELECT_ALL, function(err, rows) {
            rows.forEach(function (row) {
                console.log(row.unit, row.type, row.reg, row.ask, row.ans, row.snd);
            });
        });
    });
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
    
    // make sure each register has a row
    var stmt = db.prepare(INSERT_NEW);
    for (var i = register; i < (register + length); i++) {
        stmt.run(unit, type,  i, 0, 0, 0, 0);
    }
    stmt.finalize();
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
        ORDER BY ask DESC, reg ASC LIMIT 1";
    const SELECT_LAST_REG = "SELECT reg FROM cache \
        WHERE unit = ? AND type = ? AND reg < ? AND ask > ? \
        ORDER BY reg DESC LIMIT 1";
    
    var now = Date.now();
    var minAskTime = now - FORGET_ASK;
    
    db.serialize(function() {
    // start sqlite serialize
    
    // find the register with oldest ask time
    db.get(SELECT_NEXT_REG, now - FORGET_ASK, function(err, row) {
        if (err) {
            console.log(err);
        } else if (row) {
            var unit = row.unit;
            var type = row.type;
            var firstReg = row.reg;
            var lastReg;
            
            //console.log('pollNextGroup first line:', row);
            
            db.get(SELECT_LAST_REG, unit, type, firstReg + MAX_LENGTH, minAskTime,
                function(err, row) {
                    if (err) {
                        console.log(err);
                    } else if (row) {
                        lastReg = row.reg;
                        var length = lastReg - firstReg + 1;
                        
                        //console.log('               last line:', row);
                        
                        // ask from modbus and triger io data get event
                        // and update cache value
                        switch (type) {
                            case TYPE_COIL:
                                _getFC1(unit, firstReg, length);
                                break;
                            case TYPE_DIGITAL_INPUT:
                                _getFC2(unit, firstReg, length);
                                break;
                            case TYPE_HOLDING_REG:
                                _getFC3(unit, firstReg, length);
                                break;
                            case TYPE_INPUT_REG:
                                _getFC4(unit, firstReg, length);
                                break;
                        }
                    }
                }
            );
        }
    });
    
    }); // end sqlite serialize
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
    const UPDATE_SND = "UPDATE cache SET snd = ?, ask = 0 \
        WHERE unit = ? AND type = ? AND reg >= ? AND reg < ?";
    
    var now = Date.now();
    var length = data.length;
    
    // update cache
    db.run(UPDATE_SND, now, unit, type, address, address + length);
    // triger data-get event
    _io.emit('data', {
        'unit': unit,
        'type': type,
        'address': address,
        'data': data,
        'flag': 'get'
    });
    
    return;
}

/**
 * Get coils using cache, and flag to get new data from device
 *
 * @param {number} unit the unit id.
 * @param {number} address the first coil to get.
 * @param {number} length the number of coils to get.
 */
var getCoils = function(unit, address, length) {
    getRegisters(unit, TYPE_COIL, address, length)
}

/**
 * Get modbus coils
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get
 */
var _getFC1 = function(unit, address, length) {
    const UPDATE_REG = "UPDATE cache SET val= ?, ans = ?, ask = 0 \
        WHERE unit = ? AND type = ? AND reg = ?";
    
    var now = Date.now();
    var type = TYPE_COIL;
    
    _modbus.writeFC1(unit, address, length,
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

/**
 * Get input status using cache, and flag to get new data from device
 *
 * @param {number} unit the unit id.
 * @param {number} address the first input to get.
 * @param {number} length the number of input to get.
 */
var getInputStatus = function(unit, address, length) {
    getRegisters(unit, TYPE_DIGITAL_INPUT, address, length)
}

/**
 * Get modbus digital inputs
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get
 */
var _getFC2 = function(unit, address, length) {
    const UPDATE_REG = "UPDATE cache SET val= ?, ans = ?, ask = 0 \
        WHERE unit = ? AND type = ? AND reg = ?";
    
    var now = Date.now();
    var type = TYPE_DIGITAL_INPUT;
    
    _modbus.writeFC2(unit, address, length,
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
 * Get modbus holding registers
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get
 */
var _getFC3 = function(unit, address, length) {
    const UPDATE_REG = "UPDATE cache SET val= ?, ans = ?, ask = 0 \
        WHERE unit = ? AND type = ? AND reg = ?";
    
    var now = Date.now();
    var type = TYPE_HOLDING_REG;
    
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
 * Get modbus input registers
 *
 * @param {number} unit the unit id.
 * @param {number} address the first register to get.
 * @param {number} length the number of registers to get
 */
var _getFC4 = function(unit, address, length) {
    const UPDATE_REG = "UPDATE cache SET val= ?, ans = ?, ask = 0 \
        WHERE unit = ? AND type = ? AND reg = ?";
    
    var now = Date.now();
    var type = TYPE_INPUT_REG;
    
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
        WHERE unit = ? AND type = ? AND reg >= ? AND reg < ? \
        AND ans > ? AND snd < ?";
    
    initRegisters(unit, type, address, length);
    
    var now = Date.now();
    var data = new Array(length);
    
    db.serialize(function() {
    // start sqlite serialize
    
    // set ask signal
    db.run(UPDATE_ASK, now, unit, type, address, address + length, 
        now - FORGET_ASK);
    
    // check for data in cache
    db.all(SELECT_GET, unit, type, address, address + length, 
        now - VALID_ANS, now - RESEND_WAIT,
        function(err, rows) {
            if (err) {
                _io.emit('error', {'err': err});
            } else {
                // if we have valid data in cache
                if (rows.length == length) {
                    // fill the data arry
                    rows.forEach(function(row, i) {data[i] = row.val;});
                    
                    // on discreet types we expect boolean data values
                    if (type == TYPE_COIL || type == TYPE_DIGITAL_INPUT) {
                        data = data.map(function(d) {return (d == 1);});
                    }
                    
                    // emit data get event
                    _emitDataGetEvent(unit, type, address, data);
                }
            }
        }
    );
    
    }); // end sqlite serialize
}

/**
 * force one coil
 *
 * @param {number} unit the slave unit address.
 * @param {number} address the Data Address of the coil.
 * @param {number} state the state to set into coil.
 */
var forceCoil = function(unit, address, state) {
    const UPDATE_REG = "UPDATE cache SET ans = 0, snd = 0, ask = 0 \
        WHERE unit = ? AND type = ? AND reg >= ? AND reg < ?";
    
    var length = 1;
    var type = TYPE_COIL;
    
    initRegisters(unit, type, address, length);
    
    _modbus.writeFC5(unit, address, state,
        function(err, msg) {
            if (err) {
                _io.emit('error', {'err': err});
            } else {
                // invalidate the current value in cache
                db.run(UPDATE_REG, unit, type, address, address + length);
                
                // triger data-set event
                _io.emit('data', {
                    'unit': unit,
                    'type': type,
                    'address': address,
                    'data': state,
                    'flag': 'set'
                });
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
    const UPDATE_REG = "UPDATE cache SET ans = 0, snd = 0, ask = 0 \
        WHERE unit = ? AND type = ? AND reg >= ? AND reg < ?";
    
    var length = data.length;
    var type = TYPE_HOLDING_REG;
    
    initRegisters(unit, type, address, length);
    
    _modbus.writeFC16(unit, address, data,
        function(err, msg) {
            if (err) {
                _io.emit('error', {'err': err});
            } else {
                // invalidate the current value in cache
                db.run(UPDATE_REG, unit, type, address, address + length);
                
                // triger data-set event
                _io.emit('data', {
                    'unit': unit,
                    'type': type,
                    'address': address,
                    'data': data,
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
 * @param {object} set options options wile running.
 */
var run = function(io, modbus, options) {
    /* check for options
     */
    if (!options) options = {};
    
    // answers are valid for N-ms.
    VALID_ANS = options.validans || 5000;
    // do not trigger new io-get event for N-ms.
    RESEND_WAIT = options.resendwait || 100;
    // if not answered after N-ms, forget ask request.
    FORGET_ASK = options.forgetask || 10000;
    // max registers to ask in one modbus request.
    MAX_LENGTH = options.maxlength || 10;
    // wait N-ms between modbus polls.
    POLL_INTERVAL = options.pollinterval || 500; 
    
    // print out cache options line
    console.log('        Cache options: ',  VALID_ANS, RESEND_WAIT, 
        FORGET_ASK, MAX_LENGTH, POLL_INTERVAL);
    
    createDb();
    createTable();
    
    _io = io;
    _modbus = modbus;
    
    var poll = function() {
        //_debugReadAllRows();
        //console.log('polling');
        pollNextGroup();
        
        // wait a little and then do poll again
        setTimeout(poll, POLL_INTERVAL);
    }
    
    setTimeout(poll, 200);
}

module.exports = {};
module.exports.run = run;
module.exports.getCoils = getCoils;
module.exports.getInputStatus = getInputStatus;
module.exports.forceCoil = forceCoil;
module.exports.setRegisters = setRegisters;
module.exports.getHoldingRegisters = getHoldingRegisters;
module.exports.getInputRegisters = getInputRegisters;
