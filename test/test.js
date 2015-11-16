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
            'test': true,
            'nohttp': true,
            'nocache': false,
            'noresendwait': true
        };
        server.start(serverOptions, done);
    });
    
    it('Should get input registers', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('getInputRegisters', {
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
            socket.emit('setRegisters', {
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
            socket.emit('getHoldingRegisters', {
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
            socket.emit('forceCoil', {
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
            socket.emit('getHoldingRegisters', {
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
    
});
