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

var app = require('./app');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var ModbusRTU = require("modbus-serial");

var serialPort;
var modbusRTU;

/**
 * Write a Modbus "Read Input Registers" (FC=04) to serial port,
 * and emit the replay to websocket
 *
 * @param {number} unit the slave unit address.
 * @param {number} address the Data Address of the first register.
 * @param {number} length the total number of registers requested.
 */
var getRegisters = function(unit, address, length) {
    modbusRTU.writeFC4(unit, address, length,
        function(err, msg) {
            if (err) {
                console.log(err);
                io.emit('data', {'err': err});
            } else {
                io.emit('data', {
                    'id': unit,
                    'address': address,
                    'values': msg.data,
                    'flag': 'get'
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
var setRegisters = function(unit, address, values) {
    modbusRTU.writeFC16(unit, address, values,
        function(err, msg) {
            if (err) {
                console.log(err);
                io.emit('data', {'err': err});
            } else {
                io.emit('data', {
                    'id': unit,
                    'address': address,
                    'values': values,
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
        
        socket.on('disconnect', function(){
            // clear all periodically requests
            intervalIDs.map(clearInterval);
        });
        
        socket.on('getRegisters', function(data){
            var unit = data.unit;
            var address = data.address;
            var length = data.length;
            
            /* if client request an interval,
             * set a time interval and emit data
             * periodically.
             */
            var interval = data.interval;
            if (interval) {
                var id = setInterval(function() {
                    getRegisters(unit, address, length);
                }, interval);
                
                intervalIDs.push(id);
            } else {
                getRegisters(unit, address, length);
            }
        });
        
        socket.on('setRegisters', function(data){
            var unit = data.unit;
            var address = data.address;
            var values = data.values;
            
            setRegisters(unit, address, values);
        });
    });
};

/**
 * stop the modbus-ws server
 */
var stop = function() {
    serialPort.close();
    http.close();
    process.exit();
}

/**
 * start the modbus-ws server
 */
var start = function(callback) {
    var title = app.locals.appTitle;
    var version = app.locals.appInfo.version;
    var tcpPort = app.locals.tcpport;
    var port = app.locals.serial;
    var baud = app.locals.baudrate;
    var port = app.locals.serial;
    var ip = app.locals.ip;
    var test = app.locals.test;
    
    /* log server title and version
     */
    console.log();
    console.log(title, version);
    
    /* open serial port and setup modbus master
     */
    if (ip) {
        console.log("    Setup tcp/ip port:", ip);
        serialPort = new ModbusRTU.TcpPort(ip);
    } else if (port) {
        var SerialPort = require("serialport").SerialPort;
        
        console.log("    Setup serial port:", port, baud);
        serialPort = new SerialPort(port, {baudrate: baud});
    } else {
        console.log("    Setup test (simulted) port.");
        serialPort = new ModbusRTU.TestPort();
    }
    modbusRTU = new ModbusRTU(serialPort);
    modbusRTU.open();
    
    /* Setup WebSocket event listener
     */
    console.log("    Setup WebSockets");
    setup();
    
    /* Setup WebSocket event listener
     */
    http.listen(tcpPort, function(){
      console.log('    Run server on *:' + tcpPort);
      console.log();
      
      // run the callback
      if (callback) callback();
    });
}

module.exports = {};
module.exports.stop = stop;
module.exports.start = start;
