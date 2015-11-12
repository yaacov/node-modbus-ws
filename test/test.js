'use strict';
var io = require('socket.io-client')
var server = require('../server');

var socketURL = 'http://127.0.01:3000';
var options ={
  transports: ['websocket'],
  'force new connection': true
};

var expect = require('chai').expect;

describe('Modbus-WS server', function() {
    before(function(done) {
        server.start(done);
    });
    
    it('Should get registers', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('getRegisters', {
                "unit": 1,
                "address": 8,
                "length": 3
            });
        });

        socket.on('data', function(data){
            expect(data).to.have.property('flag');
            expect(data.flag).to.equal('get');
            
            expect(data).to.have.property('values').with.length(3);
            expect(data.values.toString()).to.equal([8, 9, 10].toString());
            
            socket.disconnect();
            done()
        });
    });
    
    it('Should set registers', function(done) {
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
    
    it('Should get the new values', function(done) {
        var socket = io.connect(socketURL, options);

        socket.on('connect', function() {
            socket.emit('getRegisters', {
                "unit": 1,
                "address": 8,
                "length": 3
            });
        });

        socket.on('data', function(data){
            expect(data).to.have.property('flag');
            expect(data.flag).to.equal('get');
            
            expect(data).to.have.property('values').with.length(3);
            expect(data.values.toString()).to.equal([88,123,47].toString());
            
            socket.disconnect();
            done()
        });
    });
    
});
