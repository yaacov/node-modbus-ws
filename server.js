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

var io;
var ModbusRTU = require("modbus-serial");
var version = require('./package.json').version;

var serialPort;
var modbusRTU;

var getInputRegisters;
var getHoldingRegisters;
var forceCoil;
var setRegisters;
var debug;

/**
 * Write a Modbus "Read Coils" (FC=01) to serial port,
 * and emit the replay to websocket
 *
 * @param {number} unit the slave unit address.
 * @param {number} address the Data Address of the first coil.
 * @param {number} length the total number of coils requested.
 */
var _getCoils = function(unit, address, length) {
    modbusRTU.writeFC1(unit, address, length,
        function(err, msg) {
            if (err) {
                console.log(err);
                io.emit('data', {'err': err});
            } else {
                io.emit('data', {
                    'unit': unit,
                    'type': 1,
                    'address': address,
                    'data': msg.data,
                    'flag': 'get'
                });
            }
        }
    );
}

/**
 * Write a Modbus "Read input status" (FC=02) to serial port,
 * and emit the replay to websocket
 *
 * @param {number} unit the slave unit address.
 * @param {number} address the Data Address of the first digital input.
 * @param {number} length the total number of digital inputs requested.
 */
var _getInputStatus = function(unit, address, length) {
    modbusRTU.writeFC2(unit, address, length,
        function(err, msg) {
            if (err) {
                console.log(err);
                io.emit('data', {'err': err});
            } else {
                io.emit('data', {
                    'unit': unit,
                    'type': 2,
                    'address': address,
                    'data': msg.data,
                    'flag': 'get'
                });
            }
        }
    );
}

/**
 * Write a Modbus "Read Holding Registers" (FC=03) to serial port,
 * and emit the replay to websocket
 *
 * @param {number} unit the slave unit address.
 * @param {number} address the Data Address of the first register.
 * @param {number} length the total number of registers requested.
 */
var _getHoldingRegisters = function(unit, address, length) {
    modbusRTU.writeFC3(unit, address, length,
        function(err, msg) {
            if (err) {
                console.log(err);
                io.emit('data', {'err': err});
            } else {
                io.emit('data', {
                    'unit': unit,
                    'type': 3,
                    'address': address,
                    'data': msg.data,
                    'flag': 'get'
                });
            }
        }
    );
}

/**
 * Write a Modbus "Read Input Registers" (FC=04) to serial port,
 * and emit the replay to websocket
 *
 * @param {number} unit the slave unit address.
 * @param {number} address the Data Address of the first register.
 * @param {number} length the total number of registers requested.
 */
var _getInputRegisters = function(unit, address, length) {
    modbusRTU.writeFC4(unit, address, length,
        function(err, msg) {
            if (err) {
                console.log(err);
                io.emit('data', {'err': err});
            } else {
                io.emit('data', {
                    'unit': unit,
                    'type': 4,
                    'address': address,
                    'data': msg.data,
                    'flag': 'get'
                });
            }
        }
    );
}

/**
 * Write a Modbus "Force one coil" (FC=05) to serial port,
 * and emit the replay to websocket
 *
 * @param {number} unit the slave unit address.
 * @param {number} address the Data Address of the coil.
 * @param {number} state the state to set into coil.
 */
var _forceCoil = function(unit, address, state) {
    modbusRTU.writeFC5(unit, address, state,
        function(err, msg) {
            if (err) {
                console.log(err);
                io.emit('data', {'err': err});
            } else {
                io.emit('data', {
                    'unit': unit,
                    'type': 5,
                    'address': address,
                    'data': state,
                    'flag': 'set'
                });
            }
        }
    );
}

/**
 * Write a Modbus "Preset Multiple Registers" (FC=16) to serial port,
 * and emit the replay to websocket
 *
 * @param {number} unit the slave unit address.
 * @param {number} address the Data Address of the first register.
 * @param {array} values the array of values to write to registers.
 */
var _setRegisters = function(unit, address, values) {
    modbusRTU.writeFC16(unit, address, values,
        function(err, msg) {
            if (err) {
                console.log(err);
                io.emit('data', {'err': err});
            } else {
                io.emit('data', {
                    'unit': unit,
                    'type': 3,
                    'address': address,
                    'data': values,
                    'flag': 'set'
                });
            }
        }
    );
}

/**
 * Setup the socket.io events
 */
var setup = function() {
    /* register socker io events
     */
    io.on('connection', function(socket){
        var intervalIDs = [];
        
        //console.log('client connected');
        
        socket.on('disconnect', function(){
            // clear all periodically requests
            intervalIDs.map(clearInterval);
            
            //console.log('client disconnected');
        });
        
        socket.on('readCoils', function(data){
            // check event validity
            if (!data) return;
            
            var unit = data.unit;
            var address = data.address;
            var length = data.length;
            
            // check event validity
            if (!unit || typeof address == 'undefined' || !length) return;
            
            /* if client request an interval,
             * set a time interval and emit data
             * periodically.
             */
            var interval = data.interval;
            if (interval) {
                var id = setInterval(function() {
                    getCoils(unit, address, length);
                }, interval);
                
                intervalIDs.push(id);
            } else {
                getCoils(unit, address, length);
            }
        });
        
        socket.on('readDiscreteInputs', function(data){
            // check event validity
            if (!data) return;
            
            var unit = data.unit;
            var address = data.address;
            var length = data.length;
            
            // check event validity
            if (!unit || typeof address == 'undefined' || !length) return;
            
            /* if client request an interval,
             * set a time interval and emit data
             * periodically.
             */
            var interval = data.interval;
            if (interval) {
                var id = setInterval(function() {
                    getInputStatus(unit, address, length);
                }, interval);
                
                intervalIDs.push(id);
            } else {
                getInputStatus(unit, address, length);
            }
        });
        
        socket.on('readHoldingRegisters', function(data){
            // check event validity
            if (!data) return;
            
            var unit = data.unit;
            var address = data.address;
            var length = data.length;
            
            // check event validity
            if (!unit || typeof address == 'undefined' || !length) return;
            
            /* if client request an interval,
             * set a time interval and emit data
             * periodically.
             */
            var interval = data.interval;
            if (interval) {
                var id = setInterval(function() {
                    getHoldingRegisters(unit, address, length);
                }, interval);
                
                intervalIDs.push(id);
            } else {
                getHoldingRegisters(unit, address, length);
            }
        });
        
        socket.on('readInputRegisters', function(data){
            // check event validity
            if (!data) return;
            
            var unit = data.unit;
            var address = data.address;
            var length = data.length;
            
            // check event validity
            if (!unit || typeof address == 'undefined' || !length) return;
            
            /* if client request an interval,
             * set a time interval and emit data
             * periodically.
             */
            var interval = data.interval;
            if (interval) {
                var id = setInterval(function() {
                    getInputRegisters(unit, address, length);
                }, interval);
                
                intervalIDs.push(id);
            } else {
                getInputRegisters(unit, address, length);
            }
        });
        
        socket.on('writeCoil', function(data){
            // check event validity
            if (!data) return;
            
            var unit = data.unit;
            var address = data.address;
            var state = data.state;
            
            // check event validity
            if (!unit || 
                typeof address == 'undefined' || 
                typeof state == 'undefined') return;
            
            forceCoil(unit, address, state);
        });
        
        socket.on('writeRegisters', function(data){
            // check event validity
            if (!data) return;
            
            var unit = data.unit;
            var address = data.address;
            var values = data.values;
            
            // check event validity
            if (!unit || typeof address == 'undefined' || !values) return;
            
            setRegisters(unit, address, values);
        });
    });
};

/**
 * stop the modbus-ws server
 */
var stop = function() {
    serialPort.close();
    process.exit();
}

/**
 * Run a websocket only server
 *
 * @param {number} tcpPort the tcp port to listen on
 * @param {function} callback the function to call when done
 */
var run_wsd = function(tcpPort, callback) {
    // run ws server
    io = require('socket.io')(tcpPort);
    
    /* Setup WebSocket event listener
     */
    setup();
}

/**
 * Run server with web application
 *
 * @param {number} tcpPort the tcp port to listen on
 * @param {function} callback the function to call when done
 */
var run_httpd = function(tcpPort, callback) {
    // run express application
    // with websockets
    var app = require('./app');
    var http = require('http').Server(app);
    io = require('socket.io')(http);
    
    /* Setup WebSocket event listener
     */
    setup();
    
    /* Setup http listener
     */
    http.listen(tcpPort);
}

/**
 * start the modbus-ws server
 */
var start = function(options, callback) {
    /* set up some default options
     */
    var title = "Modbus-WS server";
    var tcpPort = options.tcpport || 3000;
    var port = options.serial || false;
    var baud = options.baudrate || 9600;
    var ip = options.ip || false;
    var test = options.test || true;
    var noCache = options.nocache || false;
    var noHttp = options.nohttp || false;
    
    /* log server title and version
     */
    console.log();
    console.log('----------------------------------------------------');
    console.log(title, version);
    
    /* open a serial port and setup modbus master
     */
    if (ip) {
        console.log("    Setup tcp/ip port:", ip);
        serialPort = new ModbusRTU.TcpPort(ip);
    } else if (port) {
        var SerialPort = require("serialport").SerialPort;
        
        console.log("    Setup serial port:", port, baud);
        serialPort = new SerialPort(port, {baudrate: baud});
    } else {
        console.log("    Setup test (simulated) port.");
        serialPort = new ModbusRTU.TestPort();
    }
    modbusRTU = new ModbusRTU(serialPort);
    modbusRTU.open();
    
    /* set up express web application / only web socket server
     */
    if (noHttp) {
        // run only web sockets server
        console.log("    Server is running, ws://127.0.0.1:" + tcpPort);
         
        run_wsd(tcpPort);
    } else {
        // run express application
        // with web sockets
        console.log("    Server is running, http://127.0.0.1:" + tcpPort);
        
        run_httpd(tcpPort);
    }
    
    /* set up caching
     */
    if (noCache) {
        console.log("    Setup modbus without caching.");
        
        getCoils = _getCoils;
        getInputStatus = _getInputStatus;
        getHoldingRegisters = _getHoldingRegisters;
        getInputRegisters = _getInputRegisters;
        forceCoil = _forceCoil;
        setRegisters = _setRegisters;
    } else {
        var cache = require("./cache");
        
        console.log("    Setup modbus with caching.");
        
        cache.run(io, modbusRTU, options);
        
        getCoils = cache.getCoils;
        getInputStatus = cache.getInputStatus;
        getHoldingRegisters = cache.getHoldingRegisters;
        getInputRegisters = cache.getInputRegisters;
        forceCoil = cache.forceCoil;
        setRegisters = cache.setRegisters;
    }
    
    console.log("----------------------------------------------------");
    console.log();
    
    // callback
    if (callback) callback();
}

module.exports = {};
module.exports.stop = stop;
module.exports.start = start;
