# node-modbus-ws
NodeJS Modbus to WebSocket bridge

### Install
Install the server locally.
```
npm install modbus-ws</pre>
```
When installed laocally, use:
```
./node_modules/.bin/modbus-ws
```
to run the server.

You can also install the server globally, to add the modbus-ws command to your path.
```
sudo npm install modbus-ws -g</pre>
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

Load an example file to a web browser, and watch for the data received from server.
