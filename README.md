# node-modbus-ws
NodeJS Modbus to WebSocket bridge

[![NPM Version](https://img.shields.io/npm/v/gm.svg?style=flat)](https://www.npmjs.com/package/modbus-ws)

The modbus-ws server allows a browser to connect to a modbus device, using websockets.
When the server is running, and connected to a serial line or a modbusTCP device, 
a web browser can send websocket requests and control a modbus device.

With this server you can build web pages that will happily monitor and send requests to your modbus project or robot.

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

When the server is running it will transfer websocket requests into modbus requests and return the replays received as websocket events.

See the examples directory in the server's code tree, load an example file to a web browser, and watch for the data received from server.
