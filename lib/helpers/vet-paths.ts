'use strict';

//polyfills
const process = require('suman-browser-polyfills/modules/process');
const global = require('suman-browser-polyfills/modules/global');

//core
const path = require('path');
import util = require('util');

//npm
import chalk = require('chalk');
import su = require('suman-utils');

//project
const _suman = global.__suman = (global.__suman || {});
let loaded = false;

////////////////////////////////////////////////////////////////////

export const run = function (paths: Array<string>): void {

  if (loaded) {
    return;
  }

  loaded = true;
  const projectRoot = _suman.projectRoot;

  paths.forEach(function (p) {

    p = path.isAbsolute(p) ? p : path.resolve(projectRoot + '/' + p);
    const shared = su.findSharedPath(p, projectRoot);

    if (String(shared) !== String(projectRoot)) {
      if (!_suman.sumanOpts.fforce) {
        console.error('Looks like you issued the Suman command from the wrong directory, ' +
          'please cd to the relevant project.\n' +
          ' => It appears that you wanted to execute Suman on this path => "' + chalk.magenta(p) + '"\n' +
          ' But your current working directory is => "' + chalk.cyan(process.cwd()) + '"\n' +
          ' If you think this message is totally wrong and you\'d like to ignore it, use the --fforce option.\n' +
          ' However, most likely you will end up using the <suman-helpers-dir> from the wrong project\n' +
          ' and end up writing to log files in the wrong project.');
      }
    }
  });
};