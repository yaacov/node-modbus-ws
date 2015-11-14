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

var getRegisters;
var setRegisters;

/**
 * Write a Modbus "Read Input Registers" (FC=04) to serial port,
 * and emit the replay to websocket
 *
 * @param {number} unit the slave unit address.
 * @param {number} address the Data Address of the first register.
 * @param {number} length the total number of registers requested.
 */
var _getRegisters = function(unit, address, length) {
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
var _setRegisters = function(unit, address, values) {
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
        
        //console.log('client connected');
        
        socket.on('disconnect', function(){
            // clear all periodically requests
            intervalIDs.map(clearInterval);
            
            //console.log('client disconnected');
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
    
    // run the callback
    if (callback) callback();
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
     * when using socket.io server, comment out this lines.
     */
    http.listen(tcpPort, function(){
        // run the callback
        if (callback) callback();
    });
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
         
        run_wsd(tcpPort, callback);
    } else {
        // run express application
        // with web sockets
        console.log("    Server is running, http://127.0.0.1:" + tcpPort);
        
        run_httpd(tcpPort, callback);
    }
    
    /* set up caching
     */
    if (noCache) {
        console.log("    Setup modbus without caching.");
        
        getRegisters = _getRegisters;
        setRegisters = _setRegisters;
    } else {
        var cache = require("./cache");
        
        console.log("    Setup modbus with caching.");
        
        cache.run(io, modbusRTU);
        getRegisters = cache.getRegisters;
        setRegisters = cache.setRegisters;
    }
    
    console.log("----------------------------------------------------");
    console.log();
}

module.exports = {};
module.exports.stop = stop;
module.exports.start = start;
