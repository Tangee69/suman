'use strict';

import {ITestSuite} from "../dts/test-suite";
import {IGlobalSumanObj, IPseudoError, ISumanDomain} from "../dts/global";
import {ISuman} from "../dts/suman";

//TODO: as we know which file or directory the user is running their tests, so error stack traces should only contain those paths
//note: http://stackoverflow.com/questions/20825157/using-spawn-function-with-node-env-production
//TODO: plugins http://hapijs.com/tutorials/plugins

//polyfills
const process = require('suman-browser-polyfills/modules/process');
const global = require('suman-browser-polyfills/modules/global');

//core
import domain = require('domain');
import path = require('path');
import assert = require('assert');
import EE = require('events');
import fs = require('fs');
import util = require('util');

//npm
const colors = require('colors/safe');
const async = require('async');
const _ = require('underscore');
const fnArgs = require('function-arguments');
const pragmatik = require('pragmatik');
const debug = require('suman-debug')('s:index');

//project
const _suman: IGlobalSumanObj = global.__suman = (global.__suman || {});
import rules = require('./helpers/handle-varargs');
import {constants} from '../config/suman-constants';
const su = require('suman-utils');
import makeGracefulExit = require('./make-graceful-exit');
const originalAcquireDeps = require('./acquire-deps-original');
const makeAcquireDepsFillIn = require('./acquire-deps-fill-in');
const makeTestSuite = require('./make-test-suite');
const fatalRequestReply = require('./helpers/fatal-request-reply');
const handleInjections = require('./handle-injections');

////////////////////////////////////////////////////////////////////

export = function main(suman: ISuman) {

  const onSumanCompleted = function _onSumanCompleted(code: number, msg: string) {

    suman.sumanCompleted = true;

    if (process.env.SUMAN_SINGLE_PROCESS === 'yes') {
      suman._sumanEvents.emit('suman-test-file-complete');
    }
    else {

      debugger;
      suman.logFinished(code || 0, msg, function (err: Error | string, val: any) {  //TODO: val is not "any"

        if (_suman.sumanOpts.check_memory_usage) {
          let m = {
            heapTotal: _suman.maxMem.heapTotal / 1000000,
            heapUsed: _suman.maxMem.heapUsed / 1000000
          };
          process.stderr.write(' => Maximum memory usage during run => ' + util.inspect(m));
        }

        _suman.suiteResultEmitter.emit('suman-completed', val);
      });

    }
  };

  const acquireDepsFillIn = makeAcquireDepsFillIn(suman);
  suman.dateSuiteStarted = Date.now();
  const allDescribeBlocks = suman.allDescribeBlocks;
  const gracefulExit = makeGracefulExit(suman);
  const mTestSuite = makeTestSuite(suman, gracefulExit);

  function makeSuite($desc: string, $opts: ICreateOpts, $arr: Array<any>, $cb: TCreateHook) {

    const args = pragmatik.parse(arguments, rules.blockSignature);
    let [desc, opts, arr, cb] = args;

    if (arr && cb) {
      throw new Error(' => Please define either an array or callback.');
    }

    let arrayDeps: Array<string>;

    if (arr) {
      //note: you can't stub a test block!
      cb = arr[arr.length - 1];
      assert.equal(typeof cb, 'function', ' => Suman usage error => ' +
        'You need to pass a function as the last argument to the array.');
      // remove last element
      arrayDeps = arr.slice(0, -1);
    }

    //avoid unncessary pre-assignment
    arrayDeps = arrayDeps || [];

    if (arrayDeps.length > 0) {

      const preVal: Array<string> = [];
      arrayDeps.forEach(function (a) {
        if (/:/.test(a)) {
          preVal.push(a);
        }
      });

      const toEval = ['(function self(){return {', preVal.join(','), '}})()'].join('');
      const obj = eval(toEval);
      //overwrite opts with values from array
      Object.assign(opts, obj);
    }

    desc = (desc === '[suman-placeholder]') ? suman.slicedFileName : desc;
    // suman description is the same as the description of the top level test block
    suman.desc = desc;

    const allowArrowFn = _suman.sumanConfig.allowArrowFunctionsForTestBlocks;
    const isArrow = su.isArrowFunction(cb);
    const isGenerator = su.isGeneratorFn(cb);
    const isAsync = su.isAsyncFn(cb);

    if ((isArrow && !allowArrowFn) || isGenerator || isAsync) {

      const msg = constants.ERROR_MESSAGES.INVALID_FUNCTION_TYPE_USAGE;
      return fatalRequestReply({
        type: constants.runner_message_type.FATAL,
        data: {
          errors: [msg],
          msg: msg
        }
      }, function () {
        console.log(msg + '\n\n');
        console.error(new Error(' => Suman usage error => invalid arrow/generator function usage.').stack);
        process.exit(constants.EXIT_CODES.INVALID_ARROW_FUNCTION_USAGE);
      });

    }

    const deps = suman.deps = fnArgs(cb);
    const delayOptionElected = opts.delay;

    //TODO: we need to warn the user when the give an option to describe or it that is not recognized
    suman.rootSuiteDescription = desc;

    if (!opts.only && _suman.describeOnlyIsTriggered) {
      _suman._writeTestError(' => Suite with description => "' + desc + '" was skipped because another test suite in this file\n' +
        'invoked the only option.');
      onSumanCompleted(0, ' => skipped due to "only" option invoked on another test suite');
      return;
    }

    if (opts.skip) {
      _suman._writeTestError(' => Suite with description => "' + desc + '" was skipped because because you\n' +
        'passed the "skip" option to the test suite.');
      onSumanCompleted(0, ' => skipped due to explicit call of "skip" option');
      return;
    }

    const suite = mTestSuite({
      desc: desc,
      isTopLevel: true,
      opts: opts
    });

    suite.isRootSuite = true;
    suite.__bindExtras();
    allDescribeBlocks.push(suite);

    try {
      //TODO: make this path reference the resolved paths in the resolved paths module
      const globalHooks = require(path.resolve(_suman.sumanHelperDirRoot + '/suman.hooks.js'));
      assert(typeof globalHooks === 'function', 'suman.hooks.js must export a function.');
      //TODO: DI injection should apply here as well
      globalHooks.call(suite, suite);
    }
    catch (err) {
      console.error('\n' + colors.magenta(' => Suman warning => Could not find the "suman.hooks.js" ' +
          'file in your <suman-helpers-dir>.\n' +
          'Create the file to remove the warning.'), '\n\n');
      if (_suman.sumanOpts.verbosity > 3) {
        console.error('\n', err.stack || err, '\n');
      }
    }

    if (deps.length < 1) {
      process.nextTick(function () {
        startWholeShebang([]);
      });
    }
    else {

      const d = domain.create();

      d.once('error', function (err: IPseudoError) {
        console.error(err.stack || err);
        _suman._writeTestError(err.stack || err);

        d.exit();
        process.nextTick(function () {
          err = new Error(' => Suman usage error => Error acquiring IOC deps => \n' + (err.stack || err));
          err.sumanFatal = true;
          err.sumanExitCode = constants.EXIT_CODES.IOC_DEPS_ACQUISITION_ERROR;
          console.error(err.stack || err);
          gracefulExit(err);
        });

      });

      d.run(function () {

        originalAcquireDeps(deps, function (err: IPseudoError, depz: IInjectionDeps) {

          if (err) {
            console.log(err.stack || err);
            return process.exit(constants.EXIT_CODES.ERROR_ACQUIRING_IOC_DEPS);
          }

          let $deps: Array<any> = acquireDepsFillIn(suite, null, depz);

          d.exit();
          process.nextTick(startWholeShebang, $deps);

        });

      });
    }

    //TODO: http://stackoverflow.com/questions/27192917/using-a-domain-to-test-for-an-error-thrown-deep-in-the-call-stack-in-node

    function startWholeShebang(deps: Array<any>) {

      const d: ISumanDomain = domain.create();

      d.once('error', function ($err: IPseudoError) {
        d.exit();
        process.nextTick(gracefulExit, {
          message: $err.message || $err,
          stack: $err.stack || $err,
          sumanFatal: true,
          sumanExitCode: constants.EXIT_CODES.ERROR_IN_ROOT_SUITE_BLOCK
        });
      });

      d.run(function () {

          suite.fatal = function (err: IPseudoError) {
            process.nextTick(gracefulExit, {
              message: 'Fatal error experienced in root suite => ' + (err.message || err),
              stack: err.stack || err,
              sumanExitCode: constants.EXIT_CODES.ERROR_PASSED_AS_FIRST_ARG_TO_DELAY_FUNCTION
            });
          };

          if (delayOptionElected) {

            suite.__proto__.isDelayed = true;

            const to = setTimeout(function () {
              console.log('\n\n => Suman fatal error => suite.resume() function was not called within alloted time.');
              process.exit(constants.EXIT_CODES.DELAY_FUNCTION_TIMED_OUT);
            }, _suman.weAreDebugging ? 500000 : 11000);

            if (_suman.sumanOpts.verbosity > 8) {
              console.log(' => Waiting for delay() function to be called...');
            }

            let callable = true;

            suite.__proto__.__resume = function (val: any) {

              if (callable) {
                callable = false;
                clearTimeout(to);
                process.nextTick(function () {
                  _suman.ctx = null; // no suite here; don't need to call __bindExtras here, because root suite has no parent
                  suite.__proto__.isSetupComplete = true; // keep this, needs be called asynchronously
                  //pass start function all the way through program until last child delay call is invoked!
                  suite.__invokeChildren(val, start);
                });
              }
              else {
                console.error('\n', ' => Suman usage warning => suite.resume() was called more than once.');
              }
            };

            const str = cb.toString();

            if (!su.checkForValInStr(str, /resume/g, 0)) { //TODO this will not work when delay is simply commented out
              process.nextTick(function () {
                console.error(new Error(' => Suman usage error => suite.resume() method needs to be called to continue,' +
                    ' but the resume method was never referenced, so your test cases would never be invoked before timing out.').stack
                  + '\n =>' + str);
                process.exit(constants.EXIT_CODES.DELAY_NOT_REFERENCED);
              });
            }
            else {
              cb.apply(suite, deps);
            }
          }
          else {

            suite.__proto__.__resume = function () {
              console.error('\n', ' => Suman usage warning => suite.resume() has become a noop since delay option is falsy.');
            };

            cb.apply(suite, deps);
            suite.__proto__.isSetupComplete = true;

            handleInjections(suite, function (err: IPseudoError) {

              if (err) {
                console.error(err.stack || err);
                gracefulExit(err);
              }
              else {
                process.nextTick(function () {
                  suite.__invokeChildren(null, start); //pass start function all the way through program until last child delay call is invoked!
                });
              }

            });

          }

        }
      );

    }

    function start() {

      function runSuite(suite: ITestSuite, cb: Function) {

        if (_suman.sumanUncaughtExceptionTriggered) {
          console.error(' => Suman runtime error => "UncaughtException:Triggered" => halting program.');
          return;
        }

        const fn: Function = suite.parallel ? async.each : async.eachSeries;

        debugger;

        suite.__startSuite(function (err: IPseudoError, results: Object) {  // results are object from async.series

          if (err) {
            console.error(' => Test error data before log:', suite);
          }

          suman.logData(suite);

          //TODO: this might be wrong, may need to omit filter
          const children = suite.getChildren().filter(function (child: ITestSuite) {
            return !child.skipped;
          });

          if (children.length < 1) {
            process.nextTick(cb)
          }
          else {
            fn(children, function (child: ITestSuite, cb: Function) {

              child = _.findWhere(allDescribeBlocks, {
                testId: child.testId
              });

              runSuite(child, cb);

            }, function (err: IPseudoError) {
              err && console.error(' => Suman implementation error => ', err.stack || err);
              process.nextTick(cb);
            });
          }
        });
      }

      runSuite(allDescribeBlocks[0], function complete() {

        suman.dateSuiteFinished = Date.now();

        if (_suman.sumanUncaughtExceptionTriggered) {
          console.error(' => Suman runtime error => "UncaughtException:Triggered" => halting program.');
          return;
        }

        onSumanCompleted(0, null);

      });

    }
  }

  return makeSuite;

};
