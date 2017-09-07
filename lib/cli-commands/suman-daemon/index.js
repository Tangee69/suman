'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var process = require('suman-browser-polyfills/modules/process');
var global = require('suman-browser-polyfills/modules/global');
var fs = require("fs");
var path = require("path");
var net = require("net");
var util = require("util");
var su = require("suman-utils");
var residence = require("residence");
var poolio_1 = require("poolio");
var JSONStream = require("JSONStream");
var _suman = global.__suman = (global.__suman || {});
var port = 9091;
var projectRoot = residence.findProjectRoot(process.cwd());
var sumanLibRoot = path.resolve(__dirname + '/../../../');
console.log('project root => ', projectRoot);
console.log('suman lib root => ', sumanLibRoot);
if (!process.stdout.isTTY) {
    _suman.logError('process is not a tty, cannot run suman-daemon.');
    process.exit(1);
}
var f = path.resolve(process.env.HOME + '/.suman/daemon.pid');
try {
    fs.writeFileSync(f, String(process.pid));
}
catch (err) {
    _suman.logError('\n', su.getCleanErrorString(err), '\n');
    process.exit(1);
}
_suman.log('suman daemon loaded.');
var p = new poolio_1.Pool({
    filePath: path.resolve(__dirname + '/start-script.js'),
    size: 3,
    env: Object.assign({}, process.env, {
        SUMAN_LIBRARY_ROOT_PATH: sumanLibRoot,
        SUMAN_PROJECT_ROOT: projectRoot
    }),
    streamStdioAfterDelegation: true,
    oneTimeOnly: true,
    inheritStdio: false,
    resolveWhenWorkerExits: true
});
p.on('error', function (e) {
    _suman.logError('suman-daemon worker pool error => ', su.getCleanErrorString(e));
});
var s = net.createServer(function (socket) {
    console.log('socket connection made.');
    socket.pipe(JSONStream.parse()).on('data', function (obj) {
        console.log('message from ', util.inspect(obj));
        return p.any(obj, { socket: socket });
    });
});
s.once('listening', function () {
    _suman.log("suman-daemon tcp server listening on port " + port);
});
s.listen(port);