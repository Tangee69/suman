'use strict';

//dts
import {IAssertObj, IHandleError, IHookObj} from 'suman-types/dts/test-suite';
import {IInjectHookParam} from 'suman-types/dts/params';
import {IGlobalSumanObj} from 'suman-types/dts/global';
import AssertStatic = Chai.AssertStatic;
import {ITestSuite} from 'suman-types/dts/test-suite';
import {ErrorCallback, Dictionary} from 'async';

//polyfills
const process = require('suman-browser-polyfills/modules/process');
const global = require('suman-browser-polyfills/modules/global');

//core
import assert = require('assert');

//npm
import async = require('async');
import su = require('suman-utils');

//project
const _suman: IGlobalSumanObj = global.__suman = (global.__suman || {});
import {ParamBase} from '../base';

////////////////////////////////////////////////////////////////////////////////////

interface IBadProps {
  [key: string]: true
}

export interface IValuesMap {
  [key: string]: true
}

let badProps = <IBadProps> {
  inspect: true,
  constructor: true
};


export class InjectParam extends ParamBase implements IInjectHookParam{
  
  protected __planCalled: boolean;
  protected __valuesMap: IValuesMap;
  protected __suite: ITestSuite;
  protected __values: Array<any>;
  protected __inject: IHookObj;
  protected __assertCount: IAssertObj;
  public planCountExpected: number;
  
  constructor(inject: IHookObj, assertCount: IAssertObj, suite: ITestSuite,
              values: Array<any>, handleError: IHandleError, fini: Function){
    
    super();
    this.__planCalled = false;
    this.__valuesMap = {} as any;
    this.__suite = suite;
    this.__hook = inject;
    this.__handle = handleError;
    this.__fini = fini;
    this.__values = values;
    this.__assertCount = assertCount;
    this.__inject = inject;
    this.planCountExpected = null;
  }
  
  
  registerKey (k: string, val: any): Promise<any> {   //  'register' should be an alias?
    
    const suite  = this.__suite;
    const valuesMap = this.__valuesMap;
    const values = this.__values;
    
    try {
      assert(k && typeof k === 'string', 'key must be a string.');
    }
    catch (err) {
      return this.__handle(err);
    }
    
    if (k in valuesMap) {
      return this.__handle(new Error(`Injection key '${k}' has already been added.`));
    }
    if (k in suite.injectedValues) {
      return this.__handle(new Error(`Injection key '${k}' has already been added.`));
    }
    
    valuesMap[k] = true; // mark as reserved
    values.push({k, val});
    return Promise.resolve(val);
  }
  
  registerFnMap (o: Dictionary<any>): Promise<any> { // 'registerFnsMap' shoule be an alias
  
    const suite  = this.__suite;
    const valuesMap = this.__valuesMap;
    const values = this.__values;
    const self = this;
    
    return new Promise(function (resolve, reject) {
      
      assert(su.isObject(o), 'value must be a non-array object.');
      
      async.series(o, function (err: Error, results: Dictionary<any>) {
        
        if (err) {
          return reject(err);
        }
        
        try {
          Object.keys(results).forEach(function (k) {
            if (k in valuesMap) {
              throw new Error(`Injection key '${k}' has already been added.`);
            }
            if (k in suite.injectedValues) {
              throw new Error(`Injection key '${k}' has already been added.`);
            }
            valuesMap[k] = true; // mark as reserved
            values.push({k, val: results[k]});
          });
        }
        catch (err) {
          return reject(err);
        }
        
        resolve(results);
      });
    })
    .catch(function (err) {
      return self.__handle(err);
    });
  }
  
  registerMap (o: Dictionary<any>): Promise<Array<any>> { // 'registerPromisesMap' should be an alias
  
    const suite  = this.__suite;
    const valuesMap = this.__valuesMap;
    const values = this.__values;
    const keys = Object.keys(o);
    const self = this;
    let registry;
    
    try {
      registry = keys.map(function (k) {
        
        if (k in valuesMap) {
          throw new Error(`Injection key '${k}' has already been added.`);
        }
        if (k in suite.injectedValues) {
          throw new Error(`Injection key '${k}' has already been added.`);
        }
        
        valuesMap[k] = true; // mark as reserved
        values.push({k, val: o[k]});
        return o[k];
      });
    }
    catch (err) {
      return self.__handle(err);
    }
    
    return Promise.all(registry)
    .catch(function (err) {
      return self.__handle(err);
    });
  }
  
  plan (num: number) {
    
    if (this.__planCalled) {
      _suman.writeTestError(new Error('Suman warning => plan() called more than once.').stack);
      return;
    }
    
    this.__planCalled = true;
    if (this.__inject.planCountExpected !== undefined) {
      _suman.writeTestError(
        new Error(' => Suman warning => plan() called, even though plan was already passed as an option.').stack
      );
    }
    
    try {
      assert(Number.isInteger(num), 'Suman usage error => value passed to plan() is not an integer.');
    }
    catch (err) {
      return this.__handle(err);
    }
    
    this.__inject.planCountExpected = this.planCountExpected = num;
  }
  
  confirm () {
    this.__assertCount.num++;
  }
  
}




