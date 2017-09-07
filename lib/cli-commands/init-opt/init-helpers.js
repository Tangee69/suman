'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
var process = require('suman-browser-polyfills/modules/process');
var global = require('suman-browser-polyfills/modules/global');
var cp = require('child_process');
var os = require('os');
var chalk = require("chalk");
var _suman = global.__suman = (global.__suman || {});
var constants = require('../../../config/suman-constants').constants;
var logged = true;
exports.logPermissonsAdvice = function () {
    if (logged) {
        logged = false;
        console.log('\n');
        _suman.log(chalk.magenta('You may wish to run the "$ suman --init" commmand with root permissions.'));
        _suman.log(chalk.magenta('If using sudo to run arbitrary/unknown commands makes you unhappy, then please use chown as following:'));
        console.log(chalk.bgBlack.cyan('  # chown -R $(whoami) $(npm root -g) $(npm root) ~/.npm  ') + '\n\n');
    }
};