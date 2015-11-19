'use strict';

var io = require('socket.io-client')
var server = require('../server');

var socketURL = 'ws://127.0.01:3000';
var options ={
  transports: ['websocket'],
  'force new connection': true
};

var expect = require('chai').expect;

describe('Modbus-WS server', function() {
    before(function(done) {
        var serverOptions = {
            'tcpport': 3000,
            'test': true, // use simulated port
            'nohttp': true, // only websockets, no webapp
            'nocache': false, // use cache
            'pollinterval': 200, // short poll interval
            'resendwait': 1 // send without waiting (wait 1 ms)
        };
        server.start(serverOptions, done);
    });
    
    it('Should get input registers', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('readInputRegisters', {
                "unit": 1,
                "address": 8,
                "length": 3
            });
        });
        
        socket.on('data', function(data){
            expect(data).to.have.property('flag');
            expect(data.flag).to.equal('get');
            
            expect(data).to.have.property('data').with.length(3);
            expect(data.data.toString()).to.equal([8, 9, 10].toString());
            
            socket.disconnect();
            done()
        });
    });
    
    it('Should set holding registers', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('writeRegisters', {
                "unit": 1,
                "address": 8,
                "values": [88,123,47]
            });
        });

        socket.on('data', function(data){
            expect(data).to.have.property('flag');
            expect(data.flag).to.equal('set');
            
            socket.disconnect();
            done()
        });
    });
    
    it('Should get holding registers with the new values', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('readHoldingRegisters', {
                "unit": 1,
                "address": 8,
                "length": 3
            });
        });

        socket.on('data', function(data){
            expect(data).to.have.property('flag');
            expect(data.flag).to.equal('get');
            
            expect(data).to.have.property('data').with.length(3);
            expect(data.data.toString()).to.equal([88,123,47].toString());
            
            socket.disconnect();
            done()
        });
    });
    
    it('Should force one coil', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('writeCoil', {
                "unit": 1,
                "address": 8,
                "state": true
            });
        });

        socket.on('data', function(data){
            expect(data).to.have.property('data');
            expect(data.data).to.equal(true);
            
            socket.disconnect();
            done()
        });
    });
    
    it('Should get holding registers from cache', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('readHoldingRegisters', {
                "unit": 1,
                "address": 8,
                "length": 3
            });
        });

        socket.on('data', function(data){
            expect(data).to.have.property('flag');
            expect(data.flag).to.equal('get');
            
            expect(data).to.have.property('data').with.length(3);
            expect(data.data.toString()).to.equal([88,123,47].toString());
            
            socket.disconnect();
            done()
        });
    });
    
    it('Should get input status', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('readDiscreteInputs', {
                "unit": 1,
                "address": 1,
                "length": 8
            });
        });

        socket.on('data', function(data){
            expect(data).to.have.property('flag');
            expect(data.type).to.equal(2);
            expect(data.flag).to.equal('get');
            
            expect(data).to.have.property('data');
            expect(data.data[7]).to.equal(true);
            
            socket.disconnect();
            done()
        });
    });
    
    it('Should get coils after force one coil', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('readDiscreteInputs', {
                "unit": 1,
                "address": 8,
                "length": 8
            });
        });

        socket.on('data', function(data){
            expect(data).to.have.property('flag');
            expect(data.type).to.equal(2);
            expect(data.flag).to.equal('get');
            
            expect(data).to.have.property('data');
            expect(data.data[0]).to.equal(true);
            expect(data.data[7]).to.equal(false);
            
            socket.disconnect();
            done()
        });
    });
    
    it('Should get input status from cache', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('readDiscreteInputs', {
                "unit": 1,
                "address": 1,
                "length": 8
            });
        });

        socket.on('data', function(data){
            expect(data).to.have.property('flag');
            expect(data.type).to.equal(2);
            expect(data.flag).to.equal('get');
            
            expect(data).to.have.property('data');
            expect(data.data[0]).to.equal(false);
            expect(data.data[7]).to.equal(true);
            
            socket.disconnect();
            done()
        });
    });
});
