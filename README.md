# node-modbus-ws
NodeJS Modbus to WebSocket bridge

[![NPM Version](https://img.shields.io/npm/v/gm.svg?style=flat)](https://www.npmjs.com/package/modbus-ws)

### Install
Install the server locally.
```
npm install modbus-ws
```
When installed laocally, use:
```
./node_modules/.bin/modbus-ws
```
to run the server.

You can also install the server globally, to add the modbus-ws command to your path.
```
sudo npm install modbus-ws -g
```

Install serialport module if you want to use serial port (globally or locally).
```
sudo npm install serialport -g
```

### Start the modbus-ws server

Run the server using a serial port (requires serial port module):
```
modbus-ws -s /dev/ttyUSB0
```
or using a simulated modbus device:
```
modbus-ws
```
see more options:
```
modbus-ws --help
```

### Examples

See the examples directory in the server's code tree, load an example file to a web browser, and watch for the data received from server.
