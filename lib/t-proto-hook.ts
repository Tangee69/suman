'use strict';
import {IAssertObj, IHandleError, IHookObj} from "../dts/test-suite";

//polyfills
const process = require('suman-browser-polyfills/modules/process');
const global = require('suman-browser-polyfills/modules/global');

//core
const assert = require('assert');

//project
const _suman = global.__suman = (global.__suman || {});
const proto = require('./t-proto');

/////////////////////////////////////////////

export = function makeH(hook: IHookObj, assertCount: IAssertObj) {

    let planCalled = false;

    function H(handleError: IHandleError) {
        this.__handle = handleError;
    }

    /*

    !!!

    IMPORTANT NOTE: do not make any references to "this" in any prototype function because "this" may not be bound if the
    the user passes the function directly, and does not call the function with "t" as in "t.x()" but instead
     just calls "x()"

    */

    H.prototype = Object.create(proto);

    H.prototype.plan = function _plan(num: number) {
        if (!planCalled) {
            planCalled = true;
            if (hook.planCountExpected !== undefined) {
              _suman._writeTestError(new Error(' => Suman warning => t.plan() called, even though plan was already passed as an option.').stack);
            }
            assert(Number.isInteger(num), ' => Suman usage error => value passed to t.plan() is not an integer.');
            hook.planCountExpected = num;
        }
        else {
          _suman._writeTestError(new Error(' => Suman warning => t.plan() called twice.').stack);
        }
    };

    H.prototype.confirm = function _confirm() {
        assertCount.num++;
    };

    return H;

}
